import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getIntelligenceFeed, loadUserIntelligenceContext } from "../_shared/intelligence-feed.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, location, limit } = await req.json();
    if (!userId) throw new Error("userId required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) throw new Error("Supabase env not configured");

    const sb = createClient(supabaseUrl, serviceKey);
    const context = await loadUserIntelligenceContext(sb, userId);
    const items = await getIntelligenceFeed({ ...context, location }, Math.min(Number(limit) || 24, 40));

    return new Response(JSON.stringify({
      generatedAt: new Date().toISOString(),
      context: {
        goals: context.goals?.length || 0,
        domains: context.domains || [],
        location: location || "United States",
      },
      items,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("clrk-intelligence-feed error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
