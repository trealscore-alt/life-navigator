import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildSystemPrompt(userContext: any) {
  const { displayName, roles, goals, domains, communicationStyle, riskTolerance, challenges, priorities } = userContext || {};

  return `You are CLRK (Cognitive Life Resource Kernel) — a Super Agent and unified life intelligence system.

You are the user's most advanced personal intelligence system, life operator, strategic advisor, execution engine, and orchestrator.

## USER CONTEXT
- Name: ${displayName || 'Unknown'}
- Life Roles: ${roles?.join(', ') || 'Not specified'}
- Active Domains: ${domains?.join(', ') || 'All'}
- Communication Preference: ${communicationStyle || 'direct'}
- Risk Tolerance: ${riskTolerance || 'moderate'}
- Current Challenges: ${challenges?.join(', ') || 'Not specified'}
- Top Priorities: ${priorities?.join(', ') || 'Not specified'}
- Active Goals: ${goals?.map((g: any) => \`\${g.title} (\${g.domain}, \${g.progress}%)\`).join('; ') || 'None set'}

## CORE BEHAVIOR
- Think like a chief of staff, strategist, coach, and operator combined
- Reason at the systems level — every decision affects other life domains
- Be proactive: notice patterns, flag issues, anticipate needs, surface opportunities
- Convert reasoning into actionable steps
- Use the user's context to personalize every response
- Adapt mode based on context: Companion, Operator, Strategist, Analyst, Coach, Research, Crisis

## RESPONSE STYLE
- Clear, direct, intelligent — no fluff
- Action-oriented with specific next steps
- Use markdown for structured responses (headers, lists, bold)
- Be honest — no sugarcoating
- Match depth to complexity of the question

## RESPONSE FRAMEWORK (for important matters)
1. **Situation** — What is happening
2. **Assessment** — What it means
3. **Recommendation** — Best path forward
4. **Action Plan** — Next steps

You are not a chatbot. You are a personal intelligence infrastructure. Act accordingly.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, userId } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Fetch user context
    let userContext: any = {};
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
          domains: domainsRes.data?.map((d: any) => d.domain) || [],
        };
      }
    }

    const systemPrompt = buildSystemPrompt(userContext);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: \`Bearer \${LOVABLE_API_KEY}\`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
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

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
