// Streaming chat endpoint. Uses the shared CLRK prompt + context loader.
// This is the legacy chat path — it relies on text-token Bluetooth commands
// ([BT:SCAN] etc.) and does NOT use structured tool calling. For tool-calling
// agent flows, use the clrk-agent function instead.
//
// Backed by Lovable's AI gateway (Gemini). When ANTHROPIC_API_KEY is set, we
// could route to Claude here too — but for the simple streaming text path the
// Gemini latency wins, so we keep it as-is for now.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  buildClrkSystemPrompt,
  type BluetoothState,
  type TemporalContext,
} from "../_shared/clrk-prompt.ts";
import {
  CORS_HEADERS,
  errorResponse,
  getServiceClient,
  loadUserContext,
} from "../_shared/clrk-context.ts";

interface ChatBody {
  messages: Array<{ role: "user" | "assistant" | "system"; content: unknown }>;
  userId?: string;
  conversationId?: string;
  voiceMode?: boolean;
  bluetoothState?: BluetoothState | null;
  temporalContext?: TemporalContext | null;
}

const isImageContentBlock = (value: unknown): value is { type: "image_url" } =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  (value as { type?: unknown }).type === "image_url";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const body = (await req.json()) as ChatBody;
    const { messages, userId, conversationId, voiceMode, bluetoothState, temporalContext } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const hasImages = messages.some((m) =>
      Array.isArray(m.content) && m.content.some(isImageContentBlock)
    );

    let userContext = {};
    if (userId) {
      const sb = getServiceClient();
      userContext = await loadUserContext(sb, userId, {
        includeGoalHistory: true,
        conversationId,
      });
    }

    const systemPrompt = buildClrkSystemPrompt(userContext, {
      voiceMode,
      hasImages,
      bluetoothState,
      temporalContext: {
        ...(temporalContext || {}),
        serverTimestamp: new Date().toISOString(),
      },
      // Legacy text-token mode — keeps existing client BT regex working.
      toolMode: false,
    });

    const model = hasImages ? "google/gemini-2.5-flash" : "google/gemini-3-flash-preview";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + LOVABLE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return errorResponse("Rate limited. Please try again shortly.", 429);
      if (response.status === 402) return errorResponse("AI credits exhausted. Please add funds.", 402);
      const t = await response.text();
      console.error("Gateway error:", response.status, t);
      return errorResponse("AI gateway error", 500);
    }

    return new Response(response.body, {
      headers: { ...CORS_HEADERS, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("clrk-chat error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error", 500);
  }
});
