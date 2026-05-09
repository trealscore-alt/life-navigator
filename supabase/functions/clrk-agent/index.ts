// CLRK agent runtime — the real one.
//
// Replaces the legacy [BT:SCAN] regex pattern with structured Anthropic-style
// tool calling. Defines server tools (memory, goals, briefing, A2A) that
// execute inside this function, and surfaces client tools (Bluetooth, camera)
// up to the calling app for execution.
//
// Protocol:
//   Client POST { messages, userId, conversationId?, clientToolResults? }
//   Server runs the agent loop until either:
//     (a) the model emits stop_reason=end_turn       → return { done:true, messages, finalText }
//     (b) the model requests a CLIENT tool           → return { done:false, pendingClientCalls, messages }
//   The client executes any client calls and posts back with clientToolResults
//   set; the server resumes the loop.
//
// Auth: this function expects a logged-in Supabase user — we extract userId
// from the bearer JWT, not trust the request body.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildClrkSystemPrompt, type BluetoothState } from "../_shared/clrk-prompt.ts";
import { CORS_HEADERS, errorResponse, getServiceClient, jsonResponse, loadUserContext } from "../_shared/clrk-context.ts";
import {
  CLIENT_TOOL_NAMES,
  SERVER_HANDLERS,
  toolsForModel,
  type ToolContext,
} from "../_shared/tools.ts";
import { chat, makeEmbedder, type ChatMessage, type ContentBlock } from "../_shared/llm.ts";

const MAX_AGENT_STEPS = 10; // hard cap per request to bound runtime cost

interface AgentRequest {
  messages: ChatMessage[];
  conversationId?: string;
  voiceMode?: boolean;
  bluetoothState?: BluetoothState | null;
  /** Results from a previous turn's client tool requests, keyed by tool_use_id. */
  clientToolResults?: Array<{ tool_use_id: string; content: string; is_error?: boolean }>;
}

interface AgentResponse {
  done: boolean;
  messages: ChatMessage[];
  finalText?: string;
  pendingClientCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  steps_used: number;
  provider: string;
  model: string;
  /** Cumulative token usage across this request's loop iterations. */
  usage?: { input_tokens: number; output_tokens: number };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Missing Authorization header", 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) return errorResponse("Supabase env not configured", 500);

    // Verify the user from the JWT — never trust a userId from the body.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return errorResponse("Unauthorized", 401);
    const userId = user.id;

    const body = (await req.json()) as AgentRequest;
    const { messages: incomingMessages, conversationId, voiceMode, bluetoothState, clientToolResults } = body;
    if (!Array.isArray(incomingMessages)) return errorResponse("messages[] required", 400);

    const sb = getServiceClient();
    const userContext = await loadUserContext(sb, userId, {
      includeGoalHistory: true,
      conversationId,
    });

    const hasImages = incomingMessages.some((m) =>
      Array.isArray(m.content) && (m.content as ContentBlock[]).some((c) => c.type === "image"),
    );

    const systemPrompt = buildClrkSystemPrompt(userContext, {
      voiceMode,
      hasImages,
      bluetoothState,
      toolMode: true,
    });

    const toolContext: ToolContext = {
      sb,
      userId,
      conversationId,
      embed: makeEmbedder(),
    };

    // If the client posted tool results from the last turn, the last assistant
    // message already contains the tool_use blocks. Append a user message that
    // returns the tool_result blocks (Anthropic protocol).
    const messages: ChatMessage[] = [...incomingMessages];
    if (clientToolResults && clientToolResults.length > 0) {
      messages.push({
        role: "user",
        content: clientToolResults.map((r) => ({
          type: "tool_result",
          tool_use_id: r.tool_use_id,
          content: r.content,
          is_error: r.is_error,
        })),
      });
    }

    let stepsUsed = 0;
    let totalIn = 0;
    let totalOut = 0;
    let lastModel = "";
    let lastProvider: "anthropic" | "lovable" = "anthropic";

    while (stepsUsed < MAX_AGENT_STEPS) {
      stepsUsed++;
      const resp = await chat({
        systemPrompt,
        messages,
        tools: toolsForModel(),
      });
      lastModel = resp.model;
      lastProvider = resp.provider;
      if (resp.usage) {
        totalIn += resp.usage.input_tokens ?? 0;
        totalOut += resp.usage.output_tokens ?? 0;
      }

      // Append the model's assistant message verbatim.
      messages.push({ role: "assistant", content: resp.content });

      if (resp.stop_reason !== "tool_use") {
        const finalText = resp.content
          .filter((c): c is Extract<ContentBlock, { type: "text" }> => c.type === "text")
          .map((c) => c.text)
          .join("\n");
        const out: AgentResponse = {
          done: true,
          messages,
          finalText,
          steps_used: stepsUsed,
          provider: lastProvider,
          model: lastModel,
          usage: totalIn || totalOut ? { input_tokens: totalIn, output_tokens: totalOut } : undefined,
        };
        return jsonResponse(out);
      }

      // We have one or more tool_use blocks. Split into client vs server.
      const toolUses = resp.content.filter(
        (c): c is Extract<ContentBlock, { type: "tool_use" }> => c.type === "tool_use",
      );
      const clientCalls = toolUses.filter((t) => CLIENT_TOOL_NAMES.has(t.name));
      const serverCalls = toolUses.filter((t) => !CLIENT_TOOL_NAMES.has(t.name));

      // If any client tool was requested, we MUST suspend — we can't execute
      // it server-side. Server tools requested in the same turn are still
      // useful, so we run them first and append their results, then return
      // the pending client calls together with the up-to-date message log.
      if (serverCalls.length > 0) {
        const results: ContentBlock[] = [];
        for (const call of serverCalls) {
          const handler = SERVER_HANDLERS[call.name];
          if (!handler) {
            results.push({
              type: "tool_result",
              tool_use_id: call.id,
              content: JSON.stringify({ error: `Unknown server tool: ${call.name}` }),
              is_error: true,
            });
            continue;
          }
          try {
            const result = await handler(call.input ?? {}, toolContext);
            results.push({
              type: "tool_result",
              tool_use_id: call.id,
              content: typeof result === "string" ? result : JSON.stringify(result),
            });
          } catch (e) {
            console.error(`Tool ${call.name} failed:`, e);
            results.push({
              type: "tool_result",
              tool_use_id: call.id,
              content: JSON.stringify({ error: e instanceof Error ? e.message : "Unknown tool error" }),
              is_error: true,
            });
          }
        }
        messages.push({ role: "user", content: results });
      }

      if (clientCalls.length > 0) {
        const out: AgentResponse = {
          done: false,
          messages,
          pendingClientCalls: clientCalls.map((c) => ({ id: c.id, name: c.name, input: c.input })),
          steps_used: stepsUsed,
          provider: lastProvider,
          model: lastModel,
          usage: totalIn || totalOut ? { input_tokens: totalIn, output_tokens: totalOut } : undefined,
        };
        return jsonResponse(out);
      }

      // Otherwise: only server tools ran — loop and let the model see results.
    }

    // Hit the step cap — return what we have. The client can choose to bump
    // the cap and re-invoke with the current message log.
    const finalAssistant = messages[messages.length - 1];
    const finalText = Array.isArray(finalAssistant?.content)
      ? (finalAssistant.content as ContentBlock[])
          .filter((c): c is Extract<ContentBlock, { type: "text" }> => c.type === "text")
          .map((c) => c.text)
          .join("\n")
      : (finalAssistant?.content as string) ?? "";
    return jsonResponse({
      done: true,
      messages,
      finalText: finalText || "(Agent reached step limit. Try splitting the task or raising MAX_AGENT_STEPS.)",
      steps_used: stepsUsed,
      provider: lastProvider,
      model: lastModel,
      usage: totalIn || totalOut ? { input_tokens: totalIn, output_tokens: totalOut } : undefined,
    } satisfies AgentResponse);
  } catch (e) {
    console.error("clrk-agent error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error", 500);
  }
});
