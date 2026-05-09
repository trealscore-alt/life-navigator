// Live Mode endpoint — smart-glasses / AR camera + voice path.
// Latency-sensitive, non-streaming JSON response, vision-capable model.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildClrkLivePrompt } from "../_shared/clrk-prompt.ts";
import {
  CORS_HEADERS,
  errorResponse,
  getServiceClient,
  jsonResponse,
  loadUserContext,
} from "../_shared/clrk-context.ts";

interface LiveBody {
  messages: Array<{ role: "user" | "assistant"; content: unknown }>;
  userId?: string;
  imageBase64?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const { messages, userId, imageBase64 } = (await req.json()) as LiveBody;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let userContext = {};
    if (userId) {
      const sb = getServiceClient();
      userContext = await loadUserContext(sb, userId, { deviceLimit: 30 });
    }

    const systemPrompt = buildClrkLivePrompt(userContext);

    const apiMessages: any[] = [{ role: "system", content: systemPrompt }, ...messages];

    // Inline the image into the last user message if provided.
    if (imageBase64 && apiMessages.length > 1) {
      const lastMsg = apiMessages[apiMessages.length - 1];
      if (lastMsg.role === "user") {
        lastMsg.content = [
          { type: "text", text: typeof lastMsg.content === "string" ? lastMsg.content : "What do you see?" },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
        ];
      }
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + LOVABLE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: apiMessages,
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return errorResponse("Rate limited. Please try again shortly.", 429);
      if (response.status === 402) return errorResponse("AI credits exhausted. Please add funds.", 402);
      const t = await response.text();
      console.error("Gateway error:", response.status, t);
      return errorResponse("AI gateway error", 500);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "I couldn't process that. Try again.";

    return jsonResponse({ reply });
  } catch (e) {
    console.error("clrk-live error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error", 500);
  }
});
