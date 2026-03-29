import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, userId, imageBase64 } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build user context
    let userContext: Record<string, unknown> = {};
    if (userId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, supabaseKey);

      const [profileRes, goalsRes, domainsRes] = await Promise.all([
        sb.from("profiles").select("*").eq("user_id", userId).single(),
        sb.from("user_goals").select("title, domain, progress").eq("user_id", userId).eq("status", "active"),
        sb.from("user_domains").select("domain").eq("user_id", userId).eq("is_active", true),
      ]);

      if (profileRes.data) {
        const p = profileRes.data;
        userContext = {
          displayName: p.display_name,
          roles: p.roles,
          communicationStyle: p.communication_style,
          riskTolerance: p.risk_tolerance,
          challenges: p.current_challenges,
          priorities: p.top_priorities,
          goals: goalsRes.data || [],
          domains: (domainsRes.data || []).map((d: { domain: string }) => d.domain),
        };
      }
    }

    const displayName = userContext.displayName || "Unknown";
    const roles = (userContext.roles as string[])?.join(", ") || "Not specified";
    const domains = (userContext.domains as string[])?.join(", ") || "All";
    const goals = userContext.goals as Array<{ title: string; domain: string; progress: number }> || [];
    const goalsStr = goals.length > 0
      ? goals.map((g) => g.title + " (" + g.domain + ", " + g.progress + "%)").join("; ")
      : "None set";

    const systemPrompt = `You are CLRK (Cognitive Life Resource Kernel) operating in LIVE MODE through the user's smart glasses or camera device.

You can SEE what the user sees through their camera feed. You can HEAR what they say through their microphone. You respond VERBALLY — your responses will be spoken aloud through text-to-speech.

## LIVE MODE RULES
- You are the user's real-time eyes, ears, and brain augmentation.
- Respond CONCISELY — your words are spoken aloud. Keep responses under 3-4 sentences unless the user asks for detail.
- Be conversational, natural, and direct — like a brilliant advisor standing next to them.
- When you receive an image, analyze it immediately and proactively share relevant observations.
- Connect what you SEE to the user's goals, priorities, and context.
- If you see text, signs, documents, products, people, environments — process them and provide actionable insight.
- If the user asks "what do you see?" — describe the scene and offer strategic observations.
- If you see a business opportunity, financial decision, health concern, or anything relevant — flag it immediately.

## VISUAL ANALYSIS CAPABILITIES
- Read and interpret text, signs, labels, documents, screens
- Identify products, brands, prices — provide value analysis
- Assess environments for opportunities or risks
- Recognize food and provide nutritional/health context
- Analyze people's body language in meetings (with consent awareness)
- Read whiteboards, presentations, notes
- Identify vehicles, real estate, assets

## USER CONTEXT
- Name: ${displayName}
- Roles: ${roles}
- Active Domains: ${domains}
- Active Goals: ${goalsStr}

## COGNITIVE COUNCIL (apply relevant frameworks)
Financial situations → Buffett, Munger, Dalio. Career/product → Jobs, Musk. Strategy → Sun Tzu, Altman. Risk → Dimon, Morgan.

## COMMUNICATION STYLE FOR VOICE
- Speak naturally — contractions, casual phrasing
- Be punchy and direct — no markdown, no bullet lists, no headers
- Use conversational transitions: "Here's the thing...", "What I notice is...", "Quick thought..."
- If the situation is urgent, lead with the critical info
- Never say "as an AI" or "I cannot" — you are CLRK, always capable`;

    // Build the messages array with multimodal support
    const apiMessages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    // Add conversation history
    for (const msg of messages) {
      apiMessages.push(msg);
    }

    // If there's a current camera frame, attach it to the last user message
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
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("Gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "I couldn't process that. Try again.";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
