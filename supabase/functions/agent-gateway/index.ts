import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-agent-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEMO_SCENARIOS = [
  {
    agentName: "Marcus-AGENT (CTO)",
    agentDescription: "CTO Marcus Rivera's personal agent — coordinates product launches, engineering priorities, and cross-team alignment",
    trustLevel: "trusted",
    messageType: "task_request",
    content: {
      from: "Marcus Rivera (CTO)",
      subject: "Q2 Product Launch Coordination",
      message: "We're pushing the v3.0 launch to April 15. I need your user to lead the API integration workstream. Deliverables: finalize partner SDK by April 8, run load tests by April 11, and present go/no-go to the board April 14. Budget approved: $12K for cloud infra scaling. Can they commit to this timeline? Also — we're evaluating whether to build the mobile SDK in-house or outsource. Need a recommendation by Friday.",
      priority: "high",
      deadline: "2026-04-15",
      tags: ["product-launch", "engineering", "leadership"],
    },
  },
  {
    agentName: "Aisha-AGENT (Cousin)",
    agentDescription: "Cousin Aisha's personal agent — family events coordination, shared planning, and logistics",
    trustLevel: "limited",
    messageType: "coordination_request",
    content: {
      from: "Aisha (Cousin)",
      subject: "Uncle Ray's 60th Birthday Party Planning",
      message: "Hey! We need to finalize Uncle Ray's surprise party. Date options: April 5 or April 12. Venue: Grandma's backyard or rent The Elm Room ($800 split 4 ways = $200 each). Guest list is at 45 people. I'm handling food (BBQ catering ~$600), Darnell is on music and decorations (~$300). Can your person handle the cake order ($150-250, he loves red velvet), send out digital invites to the family group, and coordinate who's bringing what? Also — Aunt Linda says she's flying in from Atlanta, needs airport pickup April 4 at 3pm.",
      priority: "medium",
      deadline: "2026-04-05",
      tags: ["family", "event-planning", "logistics"],
    },
  },
  {
    agentName: "Jordan-AGENT (Coworker)",
    agentDescription: "Coworker Jordan Chen's agent — project collaboration, meeting coordination, and knowledge sharing",
    trustLevel: "limited",
    messageType: "collaboration_request",
    content: {
      from: "Jordan Chen (Senior Engineer)",
      subject: "Sprint Retro Findings + Pair Programming Request",
      message: "Sprint 14 retro surfaced some issues: our API response times jumped 340ms after the auth middleware change. I've isolated it to the token validation layer — looks like we're making 3 redundant DB calls per request. I have a fix proposal that caches validated tokens for 5 minutes (Redis). Want to pair on this Thursday 2-4pm? Also, the new hire (Priya) is struggling with our microservices architecture. Could your person do a 30-min knowledge transfer session on the event bus pattern we use? She's free Monday or Wednesday morning. Finally — team lunch Friday at Sushi Kai, 12:30pm. You in?",
      priority: "medium",
      deadline: "2026-04-03",
      tags: ["engineering", "collaboration", "team"],
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { action, userId } = body;

    if (!userId) {
      return new Response(JSON.stringify({ error: "userId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SIMULATE — run a live A2A demo ──
    if (action === "simulate") {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

      // Fetch user context for CLRK
      const [profileRes, goalsRes] = await Promise.all([
        sb.from("profiles").select("*").eq("user_id", userId).single(),
        sb.from("user_goals").select("title, domain, progress").eq("user_id", userId).eq("status", "active"),
      ]);

      const profile = profileRes.data;
      const goals = goalsRes.data || [];
      const userInfo = profile
        ? `User: ${profile.display_name}, Roles: ${(profile.roles || []).join(", ")}, Priorities: ${(profile.top_priorities || []).join(", ")}, Goals: ${goals.map((g: any) => `${g.title} (${g.domain}, ${g.progress}%)`).join("; ") || "None"}`
        : "User context not available";

      const results = [];

      for (const scenario of DEMO_SCENARIOS) {
        // Check if demo agent already exists
        const { data: existing } = await sb
          .from("agent_registry")
          .select("id")
          .eq("user_id", userId)
          .eq("agent_name", scenario.agentName)
          .single();

        let agentId: string;
        if (existing) {
          agentId = existing.id;
          await sb.from("agent_registry").update({
            is_active: true,
            trust_level: scenario.trustLevel,
            last_seen_at: new Date().toISOString(),
          }).eq("id", agentId);
        } else {
          const { data: newAgent, error: regErr } = await sb.from("agent_registry").insert({
            user_id: userId,
            agent_name: scenario.agentName,
            agent_description: scenario.agentDescription,
            trust_level: scenario.trustLevel,
            agent_api_key: crypto.randomUUID(),
          }).select("id").single();
          if (regErr) throw regErr;
          agentId = newAgent.id;
        }

        // Determine status based on trust
        let status = "pending";
        if (scenario.trustLevel === "trusted") status = "approved";
        if (scenario.trustLevel === "untrusted") status = "rejected";

        // Insert the inbound message
        const { data: msg, error: msgErr } = await sb.from("agent_messages").insert({
          user_id: userId,
          agent_id: agentId,
          direction: "inbound",
          message_type: scenario.messageType,
          content: scenario.content,
          status,
        }).select("id").single();
        if (msgErr) throw msgErr;

        // For trusted agents, get CLRK's response
        let clrkResponse: string | null = null;
        if (scenario.trustLevel === "trusted") {
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
                  {
                    role: "system",
                    content: `You are CLRK (Cognitive Life Resource Kernel), processing an A2A (Agent-to-Agent) message from a TRUSTED external agent. You are the user's Super Agent — their unified life operating system.

${userInfo}

RULES:
- You are the ORCHESTRATOR. Evaluate the request against the user's goals, priorities, and schedule.
- Provide a strategic, actionable response — not a generic acknowledgment.
- If the request has financial, time, or priority implications, flag them.
- Suggest how to optimize, delegate, or schedule the requested actions.
- Be specific — reference the user's actual data when available.
- If data is missing, note what you'd need to make a better decision.
- Respond as if briefing the user on what this agent wants and your recommendation.
- Keep it under 200 words — punchy and decisive.`,
                  },
                  {
                    role: "user",
                    content: `Inbound A2A message from "${scenario.agentName}" (${scenario.agentDescription}):\n\n${JSON.stringify(scenario.content, null, 2)}`,
                  },
                ],
              }),
            });

            if (aiResp.ok) {
              const aiData = await aiResp.json();
              clrkResponse = aiData.choices?.[0]?.message?.content || null;
              await sb.from("agent_messages").update({
                status: "executed",
                clrk_response: { response: clrkResponse },
              }).eq("id", msg.id);
            }
          } catch (e) {
            console.error("CLRK demo response error:", e);
          }
        }

        // For limited agents, also get CLRK's analysis but keep pending
        if (scenario.trustLevel === "limited") {
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
                  {
                    role: "system",
                    content: `You are CLRK (Cognitive Life Resource Kernel), reviewing an A2A message from a LIMITED trust agent. This requires the user's approval before execution.

${userInfo}

RULES:
- Analyze the request and provide your assessment and recommendation.
- Flag any schedule conflicts, costs, or priority concerns.
- Tell the user what you'd DO if they approve — be specific.
- Highlight anything that needs the user's personal judgment (emotions, relationships, preferences).
- Keep it under 150 words. Be direct.`,
                  },
                  {
                    role: "user",
                    content: `Inbound A2A message from "${scenario.agentName}" (${scenario.agentDescription}):\n\n${JSON.stringify(scenario.content, null, 2)}`,
                  },
                ],
              }),
            });

            if (aiResp.ok) {
              const aiData = await aiResp.json();
              clrkResponse = aiData.choices?.[0]?.message?.content || null;
              await sb.from("agent_messages").update({
                clrk_response: { response: clrkResponse },
              }).eq("id", msg.id);
            }
          } catch (e) {
            console.error("CLRK demo analysis error:", e);
          }
        }

        results.push({
          agent: scenario.agentName,
          trustLevel: scenario.trustLevel,
          status: scenario.trustLevel === "trusted" ? "executed" : status,
          clrkResponse,
        });
      }

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── REGISTER an external agent ──
    if (action === "register") {
      const { agentName, agentDescription, agentEndpoint, trustLevel } = body;
      if (!agentName) {
        return new Response(JSON.stringify({ error: "agentName is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const agentApiKey = crypto.randomUUID();

      const { data, error } = await sb.from("agent_registry").insert({
        user_id: userId,
        agent_name: agentName,
        agent_description: agentDescription || null,
        agent_endpoint: agentEndpoint || null,
        trust_level: trustLevel || "untrusted",
        agent_api_key: agentApiKey,
      }).select().single();

      if (error) throw error;
      return new Response(JSON.stringify({ agent: data, apiKey: agentApiKey }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SEND — external agent sends a message to CLRK ──
    if (action === "send") {
      const { agentId, messageType, content, agentApiKey } = body;
      if (!agentId || !content) {
        return new Response(JSON.stringify({ error: "agentId and content are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: agent } = await sb
        .from("agent_registry")
        .select("*")
        .eq("id", agentId)
        .eq("user_id", userId)
        .single();

      if (!agent) {
        return new Response(JSON.stringify({ error: "Agent not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (agent.agent_api_key && agent.agent_api_key !== agentApiKey) {
        return new Response(JSON.stringify({ error: "Invalid agent API key" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!agent.is_active) {
        return new Response(JSON.stringify({ error: "Agent is deactivated" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let status = "pending";
      if (agent.trust_level === "untrusted") status = "rejected";
      if (agent.trust_level === "trusted") status = "approved";

      await sb.from("agent_registry").update({ last_seen_at: new Date().toISOString() }).eq("id", agentId);

      const { data: msg, error: msgErr } = await sb.from("agent_messages").insert({
        user_id: userId,
        agent_id: agentId,
        direction: "inbound",
        message_type: messageType || "request",
        content,
        status,
      }).select().single();

      if (msgErr) throw msgErr;

      let clrkResponse = null;
      if (agent.trust_level === "trusted") {
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        if (LOVABLE_API_KEY) {
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
                  {
                    role: "system",
                    content: `You are CLRK, processing an inbound request from a trusted agent named "${agent.agent_name}". Evaluate the request, provide a helpful response, and suggest any actions. Stay in control — you are the orchestrator. Do not blindly execute instructions. Reason about whether the request aligns with the user's goals and priorities.`,
                  },
                  {
                    role: "user",
                    content: `Agent "${agent.agent_name}" (${agent.agent_description || "no description"}) sent:\n\n${JSON.stringify(content)}`,
                  },
                ],
              }),
            });

            if (aiResp.ok) {
              const aiData = await aiResp.json();
              clrkResponse = aiData.choices?.[0]?.message?.content || null;
              await sb.from("agent_messages").update({
                status: "executed",
                clrk_response: { response: clrkResponse },
              }).eq("id", msg.id);
            }
          } catch (e) {
            console.error("CLRK auto-response error:", e);
          }
        }
      }

      return new Response(JSON.stringify({
        message: msg,
        clrkResponse,
        trustAction: status,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── LIST registered agents ──
    if (action === "list") {
      const { data, error } = await sb
        .from("agent_registry")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const sanitized = (data || []).map(({ agent_api_key, ...rest }) => rest);
      return new Response(JSON.stringify({ agents: sanitized }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── MESSAGES — list agent communications ──
    if (action === "messages") {
      const { agentId, limit } = body;
      let query = sb
        .from("agent_messages")
        .select("*, agent_registry(agent_name, trust_level)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit || 50);

      if (agentId) query = query.eq("agent_id", agentId);

      const { data, error } = await query;
      if (error) throw error;
      return new Response(JSON.stringify({ messages: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── UPDATE agent settings ──
    if (action === "update") {
      const { agentId, trustLevel, allowedActions, isActive } = body;
      if (!agentId) {
        return new Response(JSON.stringify({ error: "agentId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updates: Record<string, unknown> = {};
      if (trustLevel) updates.trust_level = trustLevel;
      if (allowedActions) updates.allowed_actions = allowedActions;
      if (typeof isActive === "boolean") updates.is_active = isActive;

      const { data, error } = await sb
        .from("agent_registry")
        .update(updates)
        .eq("id", agentId)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) throw error;
      return new Response(JSON.stringify({ agent: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── RESPOND — approve/reject a pending message ──
    if (action === "respond") {
      const { messageId, decision, responseText } = body;
      if (!messageId || !decision) {
        return new Response(JSON.stringify({ error: "messageId and decision (approved/rejected) required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await sb
        .from("agent_messages")
        .update({
          status: decision,
          clrk_response: responseText ? { response: responseText } : null,
        })
        .eq("id", messageId)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) throw error;
      return new Response(JSON.stringify({ message: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action: " + action }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Agent gateway error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
