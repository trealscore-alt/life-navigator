import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, readings } = await req.json();

    if (!userId || !readings || !Array.isArray(readings) || readings.length === 0) {
      return new Response(JSON.stringify({ error: "userId and readings[] required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // 1. Store readings
    const rows = readings.map((r: { deviceId: string; deviceName?: string; dataType: string; value: number; unit: string; metadata?: Record<string, unknown> }) => ({
      user_id: userId,
      device_id: r.deviceId,
      device_name: r.deviceName || null,
      data_type: r.dataType,
      value: r.value,
      unit: r.unit,
      metadata: r.metadata || {},
    }));

    const { error: insertErr } = await sb.from("device_data_logs").insert(rows);
    if (insertErr) throw insertErr;

    // 2. Get user's active health goals
    const { data: healthGoals } = await sb
      .from("user_goals")
      .select("id, title, domain, progress, description")
      .eq("user_id", userId)
      .eq("status", "active")
      .eq("domain", "health");

    // 3. Get recent readings for context (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentData } = await sb
      .from("device_data_logs")
      .select("data_type, value, unit, created_at")
      .eq("user_id", userId)
      .gte("created_at", oneDayAgo)
      .order("created_at", { ascending: false })
      .limit(100);

    // 4. Ask CLRK to analyze and suggest goal updates
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let analysis = null;
    const goalUpdates: { goalId: string; newProgress: number }[] = [];

    if (LOVABLE_API_KEY && (healthGoals?.length || 0) > 0) {
      // Aggregate recent data by type
      const aggregated: Record<string, { values: number[]; unit: string }> = {};
      for (const d of recentData || []) {
        if (!aggregated[d.data_type]) aggregated[d.data_type] = { values: [], unit: d.unit };
        aggregated[d.data_type].values.push(Number(d.value));
      }

      const summary: Record<string, { avg: number; min: number; max: number; count: number; unit: string }> = {};
      for (const [type, info] of Object.entries(aggregated)) {
        const vals = info.values;
        summary[type] = {
          avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
          min: Math.min(...vals),
          max: Math.max(...vals),
          count: vals.length,
          unit: info.unit,
        };
      }

      const prompt = `You are CLRK, analyzing device health data for the user.

CURRENT READINGS (just received):
${readings.map((r: { dataType: string; value: number; unit: string; deviceName?: string }) =>
  `- ${r.dataType}: ${r.value} ${r.unit} (from ${r.deviceName || 'unknown device'})`
).join('\n')}

24-HOUR SUMMARY:
${Object.entries(summary).map(([type, s]) =>
  `- ${type}: avg=${s.avg} ${s.unit}, min=${s.min}, max=${s.max}, readings=${s.count}`
).join('\n')}

ACTIVE HEALTH GOALS:
${healthGoals?.map(g => `- [${g.id}] "${g.title}" (progress: ${g.progress}%) — ${g.description || 'no description'}`).join('\n') || 'None'}

TASK: Analyze the data and respond with ONLY a JSON object (no markdown, no code fences):
{
  "insight": "Brief health insight based on the data (1-2 sentences)",
  "alerts": ["any concerning patterns"],
  "goalUpdates": [{"goalId": "...", "suggestedProgress": N, "reason": "..."}]
}

Only suggest goal progress updates if the data clearly supports it. Be conservative.`;

      try {
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + LOVABLE_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: "You are a health data analyst. Respond ONLY with valid JSON." },
              { role: "user", content: prompt },
            ],
          }),
        });

        if (aiResp.ok) {
          const aiData = await aiResp.json();
          const content = aiData.choices?.[0]?.message?.content || "";
          // Strip any markdown code fences
          const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
          try {
            analysis = JSON.parse(cleaned);

            // Apply goal updates if suggested
            if (analysis.goalUpdates && Array.isArray(analysis.goalUpdates)) {
              for (const update of analysis.goalUpdates) {
                if (update.goalId && typeof update.suggestedProgress === "number") {
                  const goal = healthGoals?.find(g => g.id === update.goalId);
                  if (goal && update.suggestedProgress > goal.progress && update.suggestedProgress <= 100) {
                    await sb
                      .from("user_goals")
                      .update({ progress: update.suggestedProgress })
                      .eq("id", update.goalId)
                      .eq("user_id", userId);
                    goalUpdates.push({ goalId: update.goalId, newProgress: update.suggestedProgress });
                  }
                }
              }
            }
          } catch {
            analysis = { insight: content, alerts: [], goalUpdates: [] };
          }
        }
      } catch (e) {
        console.error("AI analysis error:", e);
      }
    }

    // 5. Mark readings as processed
    const ids = readings.map((_: unknown, i: number) => rows[i]);
    await sb
      .from("device_data_logs")
      .update({ processed: true })
      .eq("user_id", userId)
      .eq("processed", false);

    return new Response(JSON.stringify({
      stored: readings.length,
      analysis,
      goalUpdates,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Process device data error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
