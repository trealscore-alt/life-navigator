import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId } = await req.json();
    if (!userId) throw new Error("userId required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Check if briefing already exists for today
    const today = new Date().toISOString().split("T")[0];
    const { data: existing } = await sb
      .from("daily_briefings")
      .select("content")
      .eq("user_id", userId)
      .eq("briefing_date", today)
      .single();

    if (existing) {
      return new Response(JSON.stringify({ briefing: existing.content, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user context
    const [profileRes, goalsRes, domainsRes] = await Promise.all([
      sb.from("profiles").select("display_name, roles, communication_style, risk_tolerance, current_challenges, top_priorities").eq("user_id", userId).single(),
      sb.from("user_goals").select("title, domain, progress, timeframe, status").eq("user_id", userId).eq("status", "active"),
      sb.from("user_domains").select("domain").eq("user_id", userId).eq("is_active", true),
    ]);

    const profile = profileRes.data;
    const goals = goalsRes.data || [];
    const domains = (domainsRes.data || []).map((d: { domain: string }) => d.domain);

    const now = new Date();
    const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long" });
    const dateStr = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    const goalsSection = goals.length > 0
      ? goals.map((g: any) => "- " + g.title + " (" + g.domain + ", " + g.progress + "% complete, timeframe: " + g.timeframe + ")").join("\n")
      : "No active goals set.";

    const prompt = [
      "Generate a concise, actionable daily briefing for " + (profile?.display_name || "the user") + ".",
      "",
      "Today is " + dayOfWeek + ", " + dateStr + ".",
      "",
      "User context:",
      "- Roles: " + (profile?.roles?.join(", ") || "Not specified"),
      "- Active domains: " + (domains.join(", ") || "All"),
      "- Communication style: " + (profile?.communication_style || "direct"),
      "- Risk tolerance: " + (profile?.risk_tolerance || "moderate"),
      "- Top priorities: " + (profile?.top_priorities?.join(", ") || "Not specified"),
      "- Current challenges: " + (profile?.current_challenges?.join(", ") || "Not specified"),
      "",
      "Active goals:",
      goalsSection,
      "",
      "Write a briefing that is 3-5 paragraphs. Include:",
      "1. A personalized greeting and day overview",
      "2. Top 2-3 priorities for today based on their goals and challenges",
      "3. One strategic insight or opportunity they should consider",
      "4. An encouraging closing that matches their communication style",
      "",
      "Be specific to their situation. Reference their actual goals and challenges. Do NOT use markdown headers or bullet points — write in flowing prose paragraphs. Keep it under 200 words.",
    ].join("\n");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + LOVABLE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are CLRK, a personal intelligence system. Generate a daily briefing that is strategic, actionable, and personalized. Write in clean prose paragraphs without markdown formatting." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("Gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const briefingContent = data.choices?.[0]?.message?.content || "Unable to generate briefing today.";

    // Save briefing
    await sb.from("daily_briefings").upsert({
      user_id: userId,
      briefing_date: today,
      content: briefingContent,
    }, { onConflict: "user_id,briefing_date" });

    return new Response(JSON.stringify({ briefing: briefingContent, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
