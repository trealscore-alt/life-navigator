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
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 1. Store all readings (any device type)
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

    // 2. Get user's active goals across ALL domains (not just health)
    const { data: goals } = await sb
      .from("user_goals")
      .select("id, title, domain, progress, description")
      .eq("user_id", userId)
      .eq("status", "active");

    // 3. Get recent readings for context (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentData } = await sb
      .from("device_data_logs")
      .select("data_type, value, unit, device_name, created_at")
      .eq("user_id", userId)
      .gte("created_at", oneDayAgo)
      .order("created_at", { ascending: false })
      .limit(200);

    // 4. Ask CLRK to analyze all device data
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let analysis = null;
    const goalUpdates: { goalId: string; newProgress: number }[] = [];

    if (LOVABLE_API_KEY) {
      // Aggregate recent data by type
      const aggregated: Record<string, { values: number[]; unit: string; devices: Set<string> }> = {};
      for (const d of recentData || []) {
        if (!aggregated[d.data_type]) aggregated[d.data_type] = { values: [], unit: d.unit, devices: new Set() };
        aggregated[d.data_type].values.push(Number(d.value));
        if (d.device_name) aggregated[d.data_type].devices.add(d.device_name);
      }

      const summary: Record<string, { avg: number; min: number; max: number; count: number; unit: string; devices: string[] }> = {};
      for (const [type, info] of Object.entries(aggregated)) {
        const vals = info.values;
        summary[type] = {
          avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 100) / 100,
          min: Math.min(...vals),
          max: Math.max(...vals),
          count: vals.length,
          unit: info.unit,
          devices: Array.from(info.devices),
        };
      }

      const prompt = `You are CLRK, analyzing data from connected Bluetooth devices. These can be ANY type of device — fitness trackers, environmental sensors, smart home devices, cycling computers, speakers, industrial sensors, etc.

CURRENT READINGS:
${readings.map((r: { dataType: string; value: number; unit: string; deviceName?: string }) =>
  `- ${r.dataType}: ${r.value} ${r.unit} (from ${r.deviceName || 'unknown device'})`
).join('\n')}

24-HOUR DATA SUMMARY:
${Object.entries(summary).map(([type, s]) =>
  `- ${type}: avg=${s.avg} ${s.unit}, min=${s.min}, max=${s.max}, readings=${s.count}, devices=[${s.devices.join(', ')}]`
).join('\n')}

USER'S ACTIVE GOALS (all domains):
${goals?.map(g => `- [${g.id}] "${g.title}" (${g.domain}, progress: ${g.progress}%) — ${g.description || 'no description'}`).join('\n') || 'None'}

TASK: Analyze the device data holistically and respond with ONLY valid JSON (no markdown):
{
  "insight": "Brief insight about what the data tells us (1-2 sentences). Cover any device type — health, environment, fitness, smart home, etc.",
  "alerts": ["any concerning or noteworthy patterns across any device type"],
  "goalUpdates": [{"goalId": "...", "suggestedProgress": N, "reason": "..."}],
  "deviceInsights": [{"device": "device name", "status": "healthy|warning|critical|nominal", "note": "brief note"}]
}

Only suggest goal updates if the data clearly supports it. Be conservative. Treat all device types as equally important.`;

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
              { role: "system", content: "You are a universal device data analyst. Respond ONLY with valid JSON." },
              { role: "user", content: prompt },
            ],
          }),
        });

        if (aiResp.ok) {
          const aiData = await aiResp.json();
          const content = aiData.choices?.[0]?.message?.content || "";
          const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
          try {
            analysis = JSON.parse(cleaned);

            if (analysis.goalUpdates && Array.isArray(analysis.goalUpdates)) {
              for (const update of analysis.goalUpdates) {
                if (update.goalId && typeof update.suggestedProgress === "number") {
                  const goal = goals?.find(g => g.id === update.goalId);
                  if (goal && update.suggestedProgress > goal.progress && update.suggestedProgress <= 100) {
                    await sb.from("user_goals").update({ progress: update.suggestedProgress }).eq("id", update.goalId).eq("user_id", userId);
                    goalUpdates.push({ goalId: update.goalId, newProgress: update.suggestedProgress });
                  }
                }
              }
            }
          } catch {
            analysis = { insight: content, alerts: [], goalUpdates: [], deviceInsights: [] };
          }
        }
      } catch (e) {
        console.error("AI analysis error:", e);
      }
    }

    // 5. Mark as processed
    await sb.from("device_data_logs").update({ processed: true }).eq("user_id", userId).eq("processed", false);

    return new Response(JSON.stringify({ stored: readings.length, analysis, goalUpdates }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Process device data error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
