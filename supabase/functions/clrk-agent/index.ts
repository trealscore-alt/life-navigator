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
import { buildClrkSystemPrompt, type BluetoothState, type TemporalContext } from "../_shared/clrk-prompt.ts";
import { CORS_HEADERS, errorResponse, getServiceClient, jsonResponse, loadUserContext } from "../_shared/clrk-context.ts";
import {
  CLIENT_TOOL_NAMES,
  SERVER_HANDLERS,
  toolsForModel,
  type ToolContext,
} from "../_shared/tools.ts";
import { chat, makeEmbedder, type ChatMessage, type ContentBlock } from "../_shared/llm.ts";

const MAX_AGENT_STEPS = 10; // hard cap per request to bound runtime cost
const SUBAGENT_VOICE_RE = /\b(?:create|make|build|define|deploy|spin up|launch|assign)\b.{0,80}\b(?:subagent|subagents|agent|agents|specialist|specialists|squad|team)\b|\b(?:subagent|subagents|agent|agents|specialist|specialists|squad|team)\b.{0,80}\b(?:handle|research|plan|build|monitor|analyze|manage|work on)\b/i;

interface AgentRequest {
  messages: ChatMessage[];
  conversationId?: string;
  voiceMode?: boolean;
  bluetoothState?: BluetoothState | null;
  temporalContext?: TemporalContext | null;
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

const textFromContent = (content: ChatMessage["content"]) => {
  if (typeof content === "string") return content;
  return content
    .filter((block): block is Extract<ContentBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n");
};

const getLatestUserText = (messages: ChatMessage[]) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return textFromContent(messages[i].content).trim();
  }
  return "";
};

const isSubagentVoiceCommand = (text: string) => SUBAGENT_VOICE_RE.test(text);

const inferDomain = (text: string) => {
  const lower = text.toLowerCase();
  if (/\b(finance|money|invest|budget|debt|cash|revenue|sales|profit)\b/.test(lower)) return "finance";
  if (/\b(health|fitness|sleep|diet|medical|doctor|workout|stress)\b/.test(lower)) return "health";
  if (/\b(relationship|family|partner|friend|communication)\b/.test(lower)) return "relationships";
  if (/\b(learn|course|study|skill|training|book)\b/.test(lower)) return "learning";
  if (/\b(home|vehicle|car|house|travel|routine|errand|device|robot)\b/.test(lower)) return "lifestyle";
  if (/\b(goal|launch|startup|company|career|job|project|product|code|app|business)\b/.test(lower)) return "work";
  return "ambition";
};

const objectiveFromVoice = (text: string) =>
  text
    .replace(/\b(hey|okay|ok)\s+(clrk|clark|clerk)[, ]*/gi, "")
    .replace(/\b(can you|could you|please)\b/gi, "")
    .trim()
    .replace(/\s+/g, " ");

const buildSubagentSquad = (objective: string, domain: string) => [
  {
    name: "Mission Scout",
    role: "Research and context specialist",
    mission: `Gather relevant context, constraints, options, and unknowns for: ${objective}`,
    domain,
    capabilities: ["research", "history_search", "context_mapping", "risk_identification"],
    tool_scope: ["search_history", "recall", "web_search", "fetch_url"],
    guardrails: {
      approval_required_for: ["external_send", "purchase", "delete", "physical_action", "credential_use"],
      data_minimization: true,
    },
    handoff_contract: {
      output: "facts, sources, assumptions, unknowns, risks",
      escalation: "Ask CLRK for more data when context is missing.",
    },
  },
  {
    name: "Execution Planner",
    role: "Planning and sequencing specialist",
    mission: `Turn the objective into phases, milestones, dependencies, and next actions: ${objective}`,
    domain,
    capabilities: ["planning", "prioritization", "dependency_mapping", "timeline_design"],
    tool_scope: ["create_task", "update_task", "list_goals", "search_history"],
    guardrails: {
      approval_required_for: ["autonomous_execution", "financial_action", "legal_commitment", "medical_decision"],
    },
    handoff_contract: {
      output: "plan, milestones, blockers, approval points",
      escalation: "Flag any step requiring user approval.",
    },
  },
  {
    name: "Ops Runner",
    role: "Drafting and operations specialist",
    mission: `Prepare drafts, checklists, messages, and operational assets needed to move this forward: ${objective}`,
    domain,
    capabilities: ["drafting", "checklists", "workflow_design", "status_reporting"],
    tool_scope: ["create_task", "write_history_event", "remember"],
    guardrails: {
      approval_required_for: ["external_send", "public_post", "purchase", "device_command", "robot_action"],
    },
    handoff_contract: {
      output: "drafts, checklists, next actions, blockers",
      escalation: "Return drafts to CLRK before anything is sent or executed.",
    },
  },
];

async function handleSubagentVoiceCommand(
  text: string,
  messages: ChatMessage[],
  toolContext: ToolContext,
): Promise<AgentResponse> {
  const objective = objectiveFromVoice(text) || "Create and deploy CLRK subagents for the user's spoken objective.";
  const lower = text.toLowerCase();
  const domain = inferDomain(text);
  const autonomyLevel = /\b(autonomous|delegate|run it|handle it|take over)\b/.test(lower) ? "L2_assisted" : "L1_drafting";
  const wantsSingle = /\b(a|one|single)\s+(?:\w+\s+){0,3}(subagent|agent|specialist)\b/.test(lower) && !/\b(deploy|squad|team|agents|subagents|specialists)\b/.test(lower);

  if (wantsSingle) {
    const role =
      lower.match(/\b(research|finance|health|coding|code|planning|planner|marketing|sales|device|robot|vehicle)\b/)?.[1] ??
      "specialist";
    const result = await SERVER_HANDLERS.define_subagent({
      name: `${role[0].toUpperCase()}${role.slice(1)} Specialist`,
      role: `${role} specialist`,
      mission: objective,
      domain,
      autonomy_level: autonomyLevel,
      capabilities: ["focused_analysis", "planning", "drafting", "status_reporting"],
      tool_scope: ["search_history", "recall", "create_task", "write_history_event"],
      guardrails: {
        approval_required_for: ["external_send", "purchase", "delete", "physical_action", "credential_use"],
      },
      handoff_contract: {
        output: "summary, recommendations, next actions, blockers",
        escalation: "Ask CLRK or the user when approval or missing data blocks progress.",
      },
    }, toolContext);
    const subagent = (result as { subagent?: { name?: string; id?: string; status?: string } }).subagent;
    const finalText = `Done. I created ${subagent?.name ?? "the specialist subagent"} and set it to ${subagent?.status ?? "ready"}. Tell me the first mission you want it to run, or say “deploy it” and I’ll turn it into an active run.`;
    return {
      done: true,
      messages: [...messages, { role: "assistant", content: [{ type: "text", text: finalText }] }],
      finalText,
      steps_used: 0,
      provider: "clrk-runtime",
      model: "voice-subagent-router",
    };
  }

  const result = await SERVER_HANDLERS.deploy_subagents({
    objective,
    domain,
    autonomy_level: autonomyLevel,
    subagents: buildSubagentSquad(objective, domain),
    plan: [
      { id: crypto.randomUUID(), title: "Map context, constraints, and success criteria", status: "pending" },
      { id: crypto.randomUUID(), title: "Build execution plan and approval gates", status: "pending" },
      { id: crypto.randomUUID(), title: "Prepare first drafts, checklists, or operational assets", status: "pending" },
    ],
  }, toolContext);
  const deployed = (result as { subagents?: Array<{ name: string }>; runs?: Array<{ status: string }> }).subagents ?? [];
  const finalText = `Done. I deployed ${deployed.length} CLRK subagents: ${deployed.map((agent) => agent.name).join(", ")}. They’re queued under a parent task, with approvals required before anything leaves CLRK or touches money, devices, accounts, or the physical world.`;
  return {
    done: true,
    messages: [...messages, { role: "assistant", content: [{ type: "text", text: finalText }] }],
    finalText,
    steps_used: 0,
    provider: "clrk-runtime",
    model: "voice-subagent-router",
  };
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
    const { messages: incomingMessages, conversationId, voiceMode, bluetoothState, temporalContext, clientToolResults } = body;
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
      temporalContext: {
        ...(temporalContext || {}),
        serverTimestamp: new Date().toISOString(),
      },
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
    // Trim history to last 8 messages to stay under Anthropic input-token rate limits.
    // The first message must not start with a tool_result, so drop leading orphans.
    const trimmed = incomingMessages.slice(-8);
    while (trimmed.length > 0 && Array.isArray(trimmed[0].content) &&
           (trimmed[0].content as ContentBlock[]).some((c) => c.type === "tool_result")) {
      trimmed.shift();
    }
    const messages: ChatMessage[] = trimmed;
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

    const latestUserText = getLatestUserText(messages);
    if (voiceMode && (!clientToolResults || clientToolResults.length === 0) && isSubagentVoiceCommand(latestUserText)) {
      const out = await handleSubagentVoiceCommand(latestUserText, messages, toolContext);
      return jsonResponse(out);
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
