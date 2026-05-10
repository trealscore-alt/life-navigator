import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getIntelligenceFeed, loadUserIntelligenceContext } from "../_shared/intelligence-feed.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type BriefingBody = {
  userId?: string;
  force?: boolean;
  temporalContext?: {
    clientTimestamp?: string;
    clientTimezone?: string;
    clientLocale?: string;
  };
};

type GoalRow = {
  title: string;
  domain: string | null;
  progress: number | null;
  timeframe: string | null;
  status: string | null;
  description: string | null;
  target_date: string | null;
};

type MemoryRow = { kind: string; content: string; importance: number | null; created_at: string };
type TaskRow = { title: string; status: string; domain: string | null; autonomy_level: string | null; created_at: string; updated_at: string };
type SubagentRow = { name: string; role: string; mission: string; status: string; domain: string | null; created_at: string };
type HistoryRow = { source: string; kind: string; title: string | null; content: string; occurred_at: string };
type DeviceRow = { device_name: string | null; data_type: string; value: number; unit: string; created_at: string };

const list = (values: Array<string | null | undefined>, fallback = "Not specified") =>
  values.filter(Boolean).join(", ") || fallback;

const sentenceList = (values: string[], fallback: string) => {
  const cleaned = values.filter(Boolean);
  if (cleaned.length === 0) return fallback;
  if (cleaned.length === 1) return cleaned[0];
  return `${cleaned.slice(0, -1).join(", ")} and ${cleaned[cleaned.length - 1]}`;
};

const buildGroundedBriefing = (
  dateReadable: string,
  profile: Record<string, unknown> | null,
  goals: GoalRow[],
  memories: MemoryRow[],
  tasks: TaskRow[],
  subagents: SubagentRow[],
  devices: DeviceRow[],
  intelligence: Array<{ category: string; title: string; source: string; relevance: number }>,
) => {
  const name = typeof profile?.display_name === "string" ? profile.display_name : "Charles";
  const priorities = Array.isArray(profile?.top_priorities) ? profile.top_priorities.filter((item): item is string => typeof item === "string") : [];
  const challenges = Array.isArray(profile?.current_challenges) ? profile.current_challenges.filter((item): item is string => typeof item === "string") : [];
  const activeGoals = goals.filter((goal) => goal.status === "active");
  const topGoals = activeGoals.slice(0, 3).map((goal) => `${goal.title} (${goal.progress ?? 0}% complete)`);
  const activeTasks = tasks.filter((task) => !["completed", "failed", "cancelled"].includes(task.status)).slice(0, 3);
  const activeAgents = subagents.filter((agent) => !["completed", "failed", "archived"].includes(agent.status)).slice(0, 3);
  const marketSignals = intelligence.filter((item) => ["markets", "investing"].includes(item.category)).slice(0, 2);
  const newsSignals = intelligence.filter((item) => !["markets", "investing"].includes(item.category)).slice(0, 3);

  return [
    `Reality Check: ${name}, today is ${dateReadable}. CLRK is tracking ${activeGoals.length} active goal${activeGoals.length === 1 ? "" : "s"}, ${activeTasks.length} active task${activeTasks.length === 1 ? "" : "s"}, and ${activeAgents.length} active subagent${activeAgents.length === 1 ? "" : "s"}. Your stated priorities are ${sentenceList(priorities, "not fully defined yet")}. Your current friction points are ${sentenceList(challenges, "not fully captured yet")}.`,
    `Mission Priorities: Focus first on ${sentenceList(topGoals, "defining one clear mission goal inside CLRK")}. ${activeTasks.length ? `The live task queue is led by ${sentenceList(activeTasks.map((task) => `${task.title} (${task.status})`), "no active tasks")}.` : "There are no live tasks yet, so CLRK needs a concrete mission to execute against."} ${activeAgents.length ? `The active agent layer includes ${sentenceList(activeAgents.map((agent) => `${agent.name} for ${agent.role}`), "no active agents")}.` : "No active subagents are currently carrying work."}`,
    `Market/News Signals: ${marketSignals.length ? sentenceList(marketSignals.map((item) => `${item.title} from ${item.source}`), "No market feed items loaded") : "No market feed items loaded."} ${newsSignals.length ? `Broader current-event signals include ${sentenceList(newsSignals.map((item) => `${item.title} from ${item.source}`), "no current-event items")}.` : "No world, national, political, or local news signal loaded yet."} Treat these as decision-support signals, not financial or legal advice.`,
    `Risks & Decisions: ${memories.length ? `Relevant memory includes ${sentenceList(memories.slice(0, 3).map((memory) => memory.content), "no durable memory")}.` : "CLRK has little durable memory to personalize from yet."} ${devices.length ? `Recent device context includes ${sentenceList(devices.slice(0, 3).map((device) => `${device.device_name || "device"} ${device.data_type} ${device.value} ${device.unit}`), "no device data")}.` : "No recent device data is connected, so health, environment, vehicle, and robot context remains limited."}`,
    `Next 3 Actions: First, confirm or update your top three mission priorities so CLRK can rank news and market signals correctly. Second, create or deploy subagents for the highest-leverage goal if they are not already assigned. Third, connect the missing data sources you want reflected in briefings, especially calendar, location, financial watchlist, device mesh, and robot runtime.`,
  ].join("\n\n");
};

const localDateParts = (temporalContext?: BriefingBody["temporalContext"]) => {
  const now = new Date(temporalContext?.clientTimestamp || new Date().toISOString());
  const locale = temporalContext?.clientLocale || "en-US";
  const timeZone = temporalContext?.clientTimezone || "UTC";
  try {
    return {
      today: new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now),
      readable: new Intl.DateTimeFormat(locale, { timeZone, weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(now),
      timeZone,
    };
  } catch {
    return { today: now.toISOString().slice(0, 10), readable: now.toISOString(), timeZone: "UTC" };
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, force, temporalContext } = (await req.json()) as BriefingBody;
    if (!userId) throw new Error("userId required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase env not configured");
    const sb = createClient(supabaseUrl, supabaseKey);
    const date = localDateParts(temporalContext);

    if (force === false) {
      const { data: existing } = await sb
        .from("daily_briefings")
        .select("content")
        .eq("user_id", userId)
        .eq("briefing_date", date.today)
        .single();

      if (existing) {
        return new Response(JSON.stringify({ briefing: existing.content, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const [
      profileRes,
      goalsRes,
      domainsRes,
      memoryRes,
      taskRes,
      subagentRes,
      historyRes,
      deviceRes,
    ] = await Promise.all([
      sb.from("profiles").select("*").eq("user_id", userId).single(),
      sb.from("user_goals").select("title, domain, progress, timeframe, status, description, target_date").eq("user_id", userId).order("created_at", { ascending: false }).limit(12),
      sb.from("user_domains").select("domain, priority").eq("user_id", userId).eq("is_active", true).order("priority", { ascending: true }),
      sb.from("clrk_memory").select("kind, content, importance, created_at").eq("user_id", userId).order("importance", { ascending: false }).limit(12),
      sb.from("clrk_tasks").select("title, status, domain, autonomy_level, created_at, updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(10),
      sb.from("clrk_subagents").select("name, role, mission, status, domain, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
      sb.from("clrk_history_events").select("source, kind, title, content, occurred_at").eq("user_id", userId).order("occurred_at", { ascending: false }).limit(10),
      sb.from("device_data_logs").select("device_name, data_type, value, unit, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(12),
    ]);

    const profile = profileRes.data;
    const goals = (goalsRes.data || []) as GoalRow[];
    const domains = (domainsRes.data || []).map((d: { domain: string }) => d.domain);
    const memories = (memoryRes.data || []) as MemoryRow[];
    const tasks = (taskRes.data || []) as TaskRow[];
    const subagents = (subagentRes.data || []) as SubagentRow[];
    const history = (historyRes.data || []) as HistoryRow[];
    const devices = (deviceRes.data || []) as DeviceRow[];
    const intelligenceContext = await loadUserIntelligenceContext(sb, userId);
    const intelligence = await getIntelligenceFeed(intelligenceContext, 10).catch(() => []);

    const userName = (profile?.display_name as string) || "Agent";
    const prompt = [
      `Generate ${userName}'s Daily Intelligence Briefing for ${date.readable}.`,
      "",
      `ALWAYS open by addressing the user as "${userName}" by name. Do NOT use their role title (e.g. Creator, Founder) in place of their name.`,
      "This must be deeply personal and grounded ONLY in the data below. Do not invent goals, debts, businesses, or facts. If something is missing, say what is missing and what CLRK needs connected.",
      "",
      "Profile:",
      `- Name: ${profile?.display_name || "User"}`,
      `- Roles: ${list(profile?.roles || [])}`,
      `- Communication style: ${profile?.communication_style || "direct"}`,
      `- Risk tolerance: ${profile?.risk_tolerance || "moderate"}`,
      `- Top priorities: ${list(profile?.top_priorities || [])}`,
      `- Current challenges: ${list(profile?.current_challenges || [])}`,
      `- Active domains: ${list(domains)}`,
      "",
      "Goals:",
      goals.length
        ? goals.map((goal) => `- ${goal.title} [${goal.domain || "unknown"}], ${goal.status || "unknown"}, ${goal.progress ?? 0}% complete, timeframe ${goal.timeframe || "unset"}, target ${goal.target_date || "unset"}${goal.description ? `: ${goal.description}` : ""}`).join("\n")
        : "- No goals found.",
      "",
      "Memory and history signals:",
      memories.length ? memories.map((memory) => `- [${memory.kind}] ${memory.content}`).join("\n") : "- No durable memory yet.",
      history.length ? history.map((event) => `- [${event.source}/${event.kind}] ${event.title || event.content.slice(0, 80)}: ${event.content.slice(0, 180)}`).join("\n") : "- No recent history events.",
      "",
      "Runtime operations:",
      tasks.length ? tasks.map((task) => `- Task ${task.status}: ${task.title} [${task.domain || "none"} / ${task.autonomy_level || "unset"}]`).join("\n") : "- No CLRK tasks active.",
      subagents.length ? subagents.map((agent) => `- ${agent.name} (${agent.status}) ${agent.role}: ${agent.mission}`).join("\n") : "- No CLRK subagents active.",
      devices.length ? devices.map((device) => `- ${device.device_name || "Device"} ${device.data_type}: ${device.value} ${device.unit} at ${device.created_at}`).join("\n") : "- No recent device data.",
      "",
      "Current external intelligence relevant to mission/goals:",
      intelligence.length ? intelligence.map((item) => `- [${item.category}] ${item.title} (${item.source}) relevance ${item.relevance}: ${item.summary.slice(0, 160)}`).join("\n") : "- No current intelligence feed available.",
      "",
      `OUTPUT FORMAT (mandatory, use these exact markdown headers in this order):`,
      `**Reality Check** — One short paragraph. MUST start with "Good morning/afternoon/evening, ${userName}." Use today's exact date (${date.readable}). Reference the user's actual top priorities and current challenges verbatim from above.`,
      `**Mission Priorities** — 3 bullets. Each bullet must reference a real goal title from above by name and a concrete next move tied to its current % progress.`,
      `**Market & News Signals** — 3-5 bullets. Each bullet cites ONE real headline from the intelligence list above (exact title + source in parens). Add one sentence on why it matters to ${userName}'s goals/priorities. If the list is empty, say "No live intel feed connected today."`,
      `**Risks & Decisions** — 2-3 bullets. Tie risks to the user's actual challenges and goals. Label investment/political content as decision-support, not financial/legal advice.`,
      `**Next 3 Actions** — Numbered 1, 2, 3. Each action concrete, verb-led, doable today, tied to a specific named goal or challenge.`,
      "",
      "HARD RULES:",
      `- Address the user as "${userName}" — never as "Creator", "Founder", "Agent", or any role title.`,
      `- Use TODAY'S date exactly: ${date.readable}. Do not output any other date.`,
      "- Quote real goal titles, real challenge phrases, and real news headlines exactly as given. Do NOT invent any business names, debts, jobs, people, or events not in the data above.",
      "- Keep total under 400 words. No preamble. Start directly with **Reality Check**.",
    ].join("\n");

    if (!LOVABLE_API_KEY) {
      const briefingContent = buildGroundedBriefing(date.readable, profile, goals, memories, tasks, subagents, devices, intelligence);
      await sb.from("daily_briefings").upsert({
        user_id: userId,
        briefing_date: date.today,
        content: briefingContent,
      }, { onConflict: "user_id,briefing_date" });

      return new Response(JSON.stringify({
        briefing: briefingContent,
        cached: false,
        generatedAt: new Date().toISOString(),
        mode: "grounded_live_data",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + LOVABLE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `You are CLRK, ${userName}'s personal intelligence chief of staff. Produce a deeply personal daily briefing using ONLY the supplied data and intelligence. Never fabricate facts. Always address the user by their display name "${userName}". Always use the exact date provided. Follow the output format precisely.` },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      console.error("Gateway error:", response.status, await response.text());
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const briefingContent = data.choices?.[0]?.message?.content || "Unable to generate briefing today.";

    await sb.from("daily_briefings").upsert({
      user_id: userId,
      briefing_date: date.today,
      content: briefingContent,
    }, { onConflict: "user_id,briefing_date" });

    return new Response(JSON.stringify({ briefing: briefingContent, cached: false, generatedAt: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-briefing error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
