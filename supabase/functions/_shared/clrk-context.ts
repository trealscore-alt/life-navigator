// Shared user-context loader. Pulls profile, goals, domains, last briefing,
// and recent device data for a given userId in a single concurrent batch.
// Optionally augments with retrieved long-term memory + rolling conversation
// summary if a conversation_id is provided (no-ops gracefully if those tables
// don't exist yet — the memory migration adds them).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { UserContext } from "./clrk-prompt.ts";

export interface LoadContextOptions {
  /** Set true to pull all goals (active+completed+paused), false for active only. */
  includeGoalHistory?: boolean;
  /** How many recent device readings to include in the prompt. */
  deviceLimit?: number;
  /** Conversation id — if provided, fetch rolling summary for it. */
  conversationId?: string;
  /** Embedding to retrieve memory facts against (post-RAG). Optional. */
  queryEmbedding?: number[];
  /** Max memory facts to retrieve when queryEmbedding is set. */
  memoryLimit?: number;
}

type QueryResult<T = unknown> = { data?: T | null; error?: unknown };

export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  return createClient(url, key);
}

export async function loadUserContext(
  sb: SupabaseClient,
  userId: string,
  opts: LoadContextOptions = {},
): Promise<UserContext> {
  const deviceLimit = opts.deviceLimit ?? 50;

  const baseQueries: Promise<unknown>[] = [
    sb.from("profiles").select("*").eq("user_id", userId).single(),
    sb.from("user_goals").select("*").eq("user_id", userId).eq("status", "active"),
    sb.from("user_domains").select("domain, priority").eq("user_id", userId).eq("is_active", true),
    sb.from("daily_briefings").select("content, briefing_date").eq("user_id", userId).order("briefing_date", { ascending: false }).limit(1),
    sb.from("device_data_logs").select("device_name, data_type, value, unit, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(deviceLimit),
  ];
  if (opts.includeGoalHistory) {
    baseQueries.push(sb.from("user_goals").select("*").eq("user_id", userId));
  }
  if (opts.conversationId) {
    baseQueries.push(
      sb.from("chat_summaries")
        .select("summary")
        .eq("conversation_id", opts.conversationId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
  }

  const results = await Promise.all(baseQueries.map((p) => Promise.resolve(p).catch((e: unknown) => ({ error: e }))));
  const [profileRes, goalsRes, domainsRes, briefingRes, deviceRes, ...rest] = results as QueryResult[];

  let allGoalsRes: QueryResult | null = null;
  let summaryRes: QueryResult<{ summary?: string }> | null = null;
  let idx = 0;
  if (opts.includeGoalHistory) allGoalsRes = rest[idx++];
  if (opts.conversationId) summaryRes = rest[idx++];

  if (!profileRes?.data) {
    return {};
  }
  const p = profileRes.data;

  // Optional semantic memory recall — uses the rpc `match_clrk_memory` added
  // by the memory migration. Silently skipped if it doesn't exist.
  let memoryFacts: Array<{ kind: string; content: string }> | null = null;
  if (opts.queryEmbedding && opts.queryEmbedding.length > 0) {
    try {
      const { data } = await sb.rpc("match_clrk_memory", {
        p_user_id: userId,
        p_query_embedding: opts.queryEmbedding,
        p_match_count: opts.memoryLimit ?? 8,
      });
      if (Array.isArray(data)) {
        memoryFacts = data.map((d: { kind: string; content: string }) => ({ kind: d.kind, content: d.content }));
      }
    } catch {
      // memory not available yet — ignore
    }
  }

  return {
    displayName: (p as { display_name?: string }).display_name,
    roles: (p as { roles?: string[] }).roles,
    communicationStyle: (p as { communication_style?: string }).communication_style,
    riskTolerance: (p as { risk_tolerance?: string }).risk_tolerance,
    challenges: (p as { current_challenges?: string[] }).current_challenges,
    priorities: (p as { top_priorities?: string[] }).top_priorities,
    personalityType: (p as { personality_type?: string }).personality_type,
    automationComfort: (p as { automation_comfort?: string }).automation_comfort,
    timeDrains: (p as { time_drains?: string[] }).time_drains,
    goals: Array.isArray(goalsRes?.data) ? goalsRes.data : [],
    allGoals: Array.isArray(allGoalsRes?.data) ? allGoalsRes.data : null,
    domains: Array.isArray(domainsRes?.data) ? domainsRes.data.map((d: { domain: string }) => d.domain) : [],
    domainPriorities: Array.isArray(domainsRes?.data) ? domainsRes.data : [],
    lastBriefing: Array.isArray(briefingRes?.data) ? briefingRes.data[0] || null : null,
    recentDeviceData: Array.isArray(deviceRes?.data) ? deviceRes.data : [],
    conversationSummary: summaryRes?.data?.summary || null,
    memoryFacts,
  };
}

// CORS headers used by every edge function. Keep in one place so we never
// drift on which custom headers are allowed.
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": [
    "authorization",
    "x-client-info",
    "apikey",
    "content-type",
    "x-agent-api-key",
    "x-supabase-client-platform",
    "x-supabase-client-platform-version",
    "x-supabase-client-runtime",
    "x-supabase-client-runtime-version",
  ].join(", "),
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status);
}
