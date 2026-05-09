// CLRK tool catalog — the structured-calling alternative to the
// [BT:SCAN]-style text tokens. Each tool has an Anthropic-compatible JSON
// schema and (for server-side tools) a handler that executes against
// Supabase / external APIs.
//
// Tools split into two classes:
//   - Server tools execute inside this edge function. The handler runs and
//     the tool_result is fed back into the next model turn.
//   - Client tools execute on the user's device (Bluetooth, camera, etc.).
//     The agent loop pauses, returns the tool_use block to the client, and
//     resumes when the client posts tool_result back.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Anthropic tool-use schema shape. (OpenAI's schema is similar; we adapt at
// the gateway layer rather than redefining everything.)
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolDescriptor extends ToolDefinition {
  /** Server-side tools run inside the edge function. Client tools are
   * surfaced to the calling app to execute (BLE, camera, push, etc.). */
  side: "server" | "client";
}

export interface ToolContext {
  sb: SupabaseClient;
  userId: string;
  conversationId?: string;
  /** Optional embedder (text → vector). When absent, memory writes skip the
   * embedding column and recall falls back to ILIKE. */
  embed?: (text: string) => Promise<number[] | null>;
}

export type ToolHandler = (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// Tool definitions
// ─────────────────────────────────────────────────────────────────────────────

const TOOL_DEFS: ToolDescriptor[] = [
  // ── Profile / Goals ───────────────────────────────────────────────────────
  {
    side: "server",
    name: "read_user_profile",
    description:
      "Read the user's profile (display name, roles, communication style, risk tolerance, challenges, priorities, automation comfort). Use when you need the user's preferences or identity context that isn't already in your system prompt.",
    input_schema: { type: "object", properties: {} },
  },
  {
    side: "server",
    name: "list_goals",
    description:
      "List the user's goals. Filter by status ('active', 'completed', 'paused', 'all') and optionally by domain.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["active", "completed", "paused", "all"] },
        domain: {
          type: "string",
          enum: ["work", "finance", "health", "relationships", "learning", "lifestyle", "ambition"],
        },
      },
    },
  },
  {
    side: "server",
    name: "create_goal",
    description:
      "Create a new goal for the user. Use when the user explicitly states something they want to achieve and confirms they want to track it.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short goal title — what they're trying to achieve." },
        description: { type: "string" },
        domain: {
          type: "string",
          enum: ["work", "finance", "health", "relationships", "learning", "lifestyle", "ambition"],
        },
        timeframe: { type: "string", enum: ["week", "month", "quarter", "year", "long_term"] },
        target_date: { type: "string", description: "ISO date YYYY-MM-DD if there's a deadline." },
      },
      required: ["title", "domain"],
    },
  },
  {
    side: "server",
    name: "update_goal_progress",
    description: "Update the progress percentage or status of an existing goal.",
    input_schema: {
      type: "object",
      properties: {
        goal_id: { type: "string" },
        progress: { type: "number", description: "Percentage 0-100." },
        status: { type: "string", enum: ["active", "completed", "paused", "cancelled"] },
      },
      required: ["goal_id"],
    },
  },

  // ── Memory ────────────────────────────────────────────────────────────────
  {
    side: "server",
    name: "remember",
    description:
      "Save a fact, pattern, lesson, preference, or environmental detail to long-term memory. Use proactively when the user shares stable information you should retain across sessions (preferences, relationships, devices, routines, lessons learned). Do NOT save ephemeral details.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The memory in clear, self-contained language." },
        kind: {
          type: "string",
          enum: ["fact", "pattern", "strategic", "environment", "lesson", "preference"],
        },
        importance: { type: "integer", description: "1-10. Default 5.", minimum: 1, maximum: 10 },
      },
      required: ["content", "kind"],
    },
  },
  {
    side: "server",
    name: "recall",
    description:
      "Search the user's long-term memory for relevant facts. Returns the top semantically similar memories. Use before answering questions where prior personal context likely matters.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        kinds: {
          type: "array",
          items: { type: "string" },
          description: "Optional filter by kind.",
        },
        limit: { type: "integer", default: 6 },
      },
      required: ["query"],
    },
  },

  // ── Tasks (planner/executor) ──────────────────────────────────────────────
  {
    side: "server",
    name: "create_task",
    description:
      "Create a CLRK task — a goal you'll work on across multiple steps, possibly autonomously. Use for anything that needs decomposition, scheduling, or background execution.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        domain: {
          type: "string",
          enum: ["work", "finance", "health", "relationships", "learning", "lifestyle", "ambition"],
        },
        autonomy_level: {
          type: "string",
          enum: ["L0_advisory", "L1_drafting", "L2_assisted", "L3_rule_based", "L4_delegated", "L5_ambient"],
          description: "How much autonomy CLRK has. Default L1 (drafting requires user approval).",
        },
        scheduled_for: { type: "string", description: "Optional ISO datetime to run later." },
        plan: {
          type: "array",
          items: { type: "object" },
          description: "Optional initial plan. Array of { id, title, status: 'pending' } step objects.",
        },
      },
      required: ["title"],
    },
  },
  {
    side: "server",
    name: "list_tasks",
    description: "List the user's CLRK tasks. Optionally filter by status.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "planning", "awaiting_user", "executing", "blocked", "completed", "failed", "cancelled", "all"],
        },
        limit: { type: "integer", default: 25 },
      },
    },
  },
  {
    side: "server",
    name: "update_task",
    description: "Update a task's status, plan, or trace.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        status: {
          type: "string",
          enum: ["pending", "planning", "awaiting_user", "executing", "blocked", "completed", "failed", "cancelled"],
        },
        plan: { type: "array", items: { type: "object" } },
        result_summary: { type: "string" },
      },
      required: ["task_id"],
    },
  },

  // ── Briefings + device data ───────────────────────────────────────────────
  {
    side: "server",
    name: "generate_today_briefing",
    description: "Trigger generation of today's daily briefing. Cached — safe to call multiple times.",
    input_schema: { type: "object", properties: {} },
  },
  {
    side: "server",
    name: "read_recent_device_data",
    description:
      "Read recent Bluetooth device readings (heart rate, environment, battery, etc.). Use when the user asks about device readings or when health/environment data is relevant.",
    input_schema: {
      type: "object",
      properties: {
        data_types: { type: "array", items: { type: "string" } },
        hours: { type: "integer", default: 24 },
        limit: { type: "integer", default: 100 },
      },
    },
  },

  // ── Agent network (A2A) ───────────────────────────────────────────────────
  {
    side: "server",
    name: "list_external_agents",
    description: "List external agents registered to this user with their trust levels.",
    input_schema: { type: "object", properties: {} },
  },
  {
    side: "server",
    name: "list_agent_messages",
    description: "List recent A2A messages, optionally filtered to pending approval.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "approved", "rejected", "executed", "failed", "all"] },
        limit: { type: "integer", default: 20 },
      },
    },
  },
  {
    side: "server",
    name: "respond_to_agent_message",
    description:
      "Approve or reject a pending A2A message and (optionally) attach a CLRK response. Use only after confirming with the user for limited-trust agents.",
    input_schema: {
      type: "object",
      properties: {
        message_id: { type: "string" },
        decision: { type: "string", enum: ["approved", "rejected"] },
        response_text: { type: "string" },
      },
      required: ["message_id", "decision"],
    },
  },

  // ── Bluetooth (CLIENT-SIDE — runs on device) ──────────────────────────────
  {
    side: "client",
    name: "bluetooth_status",
    description: "Get the current live Bluetooth state on the user's device (discovered devices, scanning state, connected devices, monitoring set, last live readings).",
    input_schema: { type: "object", properties: {} },
  },
  {
    side: "client",
    name: "bluetooth_scan",
    description: "Start scanning for nearby Bluetooth devices. Scan runs for ~15s by default.",
    input_schema: {
      type: "object",
      properties: {
        duration_ms: { type: "integer", description: "How long to scan, in ms. Default 15000." },
      },
    },
  },
  { side: "client", name: "bluetooth_stop_scan", description: "Stop an active Bluetooth scan.", input_schema: { type: "object", properties: {} } },
  {
    side: "client",
    name: "bluetooth_connect",
    description: "Connect to a Bluetooth device by its deviceId (use the exact value from bluetooth_status).",
    input_schema: {
      type: "object",
      properties: { device_id: { type: "string" } },
      required: ["device_id"],
    },
  },
  {
    side: "client",
    name: "bluetooth_disconnect",
    description: "Disconnect from a Bluetooth device.",
    input_schema: {
      type: "object",
      properties: { device_id: { type: "string" } },
      required: ["device_id"],
    },
  },
  {
    side: "client",
    name: "bluetooth_monitor",
    description: "Start streaming readings from a connected device. Call after bluetooth_connect.",
    input_schema: {
      type: "object",
      properties: { device_id: { type: "string" } },
      required: ["device_id"],
    },
  },
  {
    side: "client",
    name: "bluetooth_stop_monitor",
    description: "Stop streaming readings from a device.",
    input_schema: {
      type: "object",
      properties: { device_id: { type: "string" } },
      required: ["device_id"],
    },
  },

  // ── Camera (CLIENT-SIDE) ──────────────────────────────────────────────────
  {
    side: "client",
    name: "capture_image",
    description: "Capture a photo from the user's camera so you can see what they're seeing. Returns a base64 image you'll receive in the next turn.",
    input_schema: { type: "object", properties: {} },
  },
];

export const ALL_TOOLS = TOOL_DEFS;
export const SERVER_TOOLS = TOOL_DEFS.filter((t) => t.side === "server");
export const CLIENT_TOOLS = TOOL_DEFS.filter((t) => t.side === "client");
export const CLIENT_TOOL_NAMES = new Set(CLIENT_TOOLS.map((t) => t.name));

/** Strip the `side` property when sending to the model. */
export function toolsForModel(): ToolDefinition[] {
  return TOOL_DEFS.map(({ side: _side, ...rest }) => rest);
}

// ─────────────────────────────────────────────────────────────────────────────
// Server-side handlers
// ─────────────────────────────────────────────────────────────────────────────

export const SERVER_HANDLERS: Record<string, ToolHandler> = {
  read_user_profile: async (_input, ctx) => {
    const { data, error } = await ctx.sb
      .from("profiles")
      .select("display_name, roles, communication_style, risk_tolerance, personality_type, automation_comfort, current_challenges, top_priorities, time_drains, onboarding_completed")
      .eq("user_id", ctx.userId)
      .single();
    if (error) throw error;
    return data;
  },

  list_goals: async (input, ctx) => {
    const status = (input.status as string) ?? "active";
    let q = ctx.sb.from("user_goals").select("id, title, description, domain, timeframe, status, progress, target_date, created_at").eq("user_id", ctx.userId);
    if (status !== "all") q = q.eq("status", status);
    if (input.domain) q = q.eq("domain", input.domain as string);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return { goals: data };
  },

  create_goal: async (input, ctx) => {
    const { data, error } = await ctx.sb
      .from("user_goals")
      .insert({
        user_id: ctx.userId,
        title: input.title as string,
        description: (input.description as string) ?? null,
        domain: input.domain as string,
        timeframe: (input.timeframe as string) ?? "month",
        target_date: (input.target_date as string) ?? null,
        progress: 0,
        status: "active",
      })
      .select()
      .single();
    if (error) throw error;
    return { goal: data };
  },

  update_goal_progress: async (input, ctx) => {
    const updates: Record<string, unknown> = {};
    if (typeof input.progress === "number") updates.progress = Math.max(0, Math.min(100, Math.round(input.progress as number)));
    if (input.status) updates.status = input.status;
    const { data, error } = await ctx.sb
      .from("user_goals")
      .update(updates)
      .eq("id", input.goal_id as string)
      .eq("user_id", ctx.userId)
      .select()
      .single();
    if (error) throw error;
    return { goal: data };
  },

  remember: async (input, ctx) => {
    const content = input.content as string;
    const kind = input.kind as string;
    const importance = (input.importance as number) ?? 5;
    const embedding = ctx.embed ? await ctx.embed(content).catch(() => null) : null;
    const { data, error } = await ctx.sb
      .from("clrk_memory")
      .insert({
        user_id: ctx.userId,
        kind,
        content,
        importance,
        source: "agent",
        embedding,
      })
      .select("id, kind, content, importance")
      .single();
    if (error) throw error;
    return { memory: data, embedded: !!embedding };
  },

  recall: async (input, ctx) => {
    const query = input.query as string;
    const limit = (input.limit as number) ?? 6;
    const kinds = input.kinds as string[] | undefined;

    // Try semantic search first.
    if (ctx.embed) {
      const queryEmbedding = await ctx.embed(query).catch(() => null);
      if (queryEmbedding) {
        const { data, error } = await ctx.sb.rpc("match_clrk_memory", {
          p_user_id: ctx.userId,
          p_query_embedding: queryEmbedding,
          p_match_count: limit,
          p_kinds: kinds ?? null,
        });
        if (!error) return { memories: data ?? [], mode: "semantic" };
      }
    }

    // Fallback: ILIKE keyword.
    let q = ctx.sb.from("clrk_memory").select("id, kind, content, importance").eq("user_id", ctx.userId).ilike("content", `%${query}%`);
    if (kinds && kinds.length > 0) q = q.in("kind", kinds);
    const { data, error } = await q.order("importance", { ascending: false }).limit(limit);
    if (error) throw error;
    return { memories: data ?? [], mode: "keyword" };
  },

  create_task: async (input, ctx) => {
    const { data, error } = await ctx.sb
      .from("clrk_tasks")
      .insert({
        user_id: ctx.userId,
        conversation_id: ctx.conversationId ?? null,
        title: input.title as string,
        description: (input.description as string) ?? null,
        domain: (input.domain as string) ?? null,
        autonomy_level: (input.autonomy_level as string) ?? "L1_drafting",
        scheduled_for: (input.scheduled_for as string) ?? null,
        plan: (input.plan as unknown[]) ?? [],
        status: "pending",
      })
      .select("id, title, status, autonomy_level, scheduled_for")
      .single();
    if (error) throw error;
    return { task: data };
  },

  list_tasks: async (input, ctx) => {
    const status = (input.status as string) ?? "pending";
    let q = ctx.sb
      .from("clrk_tasks")
      .select("id, title, description, status, autonomy_level, plan, scheduled_for, created_at, completed_at")
      .eq("user_id", ctx.userId);
    if (status !== "all") q = q.eq("status", status);
    const { data, error } = await q.order("created_at", { ascending: false }).limit((input.limit as number) ?? 25);
    if (error) throw error;
    return { tasks: data };
  },

  update_task: async (input, ctx) => {
    const updates: Record<string, unknown> = {};
    if (input.status) updates.status = input.status;
    if (Array.isArray(input.plan)) updates.plan = input.plan;
    if (input.status === "completed") updates.completed_at = new Date().toISOString();
    if (input.result_summary) {
      updates.result = { summary: input.result_summary };
    }
    const { data, error } = await ctx.sb
      .from("clrk_tasks")
      .update(updates)
      .eq("id", input.task_id as string)
      .eq("user_id", ctx.userId)
      .select()
      .single();
    if (error) throw error;
    return { task: data };
  },

  generate_today_briefing: async (_input, ctx) => {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resp = await fetch(`${supabaseUrl}/functions/v1/generate-briefing`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
      body: JSON.stringify({ userId: ctx.userId }),
    });
    if (!resp.ok) throw new Error(`generate-briefing returned ${resp.status}`);
    return await resp.json();
  },

  read_recent_device_data: async (input, ctx) => {
    const hours = (input.hours as number) ?? 24;
    const limit = (input.limit as number) ?? 100;
    const types = input.data_types as string[] | undefined;
    const since = new Date(Date.now() - hours * 3600_000).toISOString();
    let q = ctx.sb
      .from("device_data_logs")
      .select("device_name, data_type, value, unit, created_at")
      .eq("user_id", ctx.userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (types && types.length > 0) q = q.in("data_type", types);
    const { data, error } = await q;
    if (error) throw error;
    return { readings: data ?? [], hours };
  },

  list_external_agents: async (_input, ctx) => {
    const { data, error } = await ctx.sb
      .from("agent_registry")
      .select("id, agent_name, agent_description, trust_level, is_active, last_seen_at")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { agents: data };
  },

  list_agent_messages: async (input, ctx) => {
    const status = (input.status as string) ?? "pending";
    let q = ctx.sb
      .from("agent_messages")
      .select("id, agent_id, direction, message_type, content, status, clrk_response, created_at, agent_registry(agent_name, trust_level)")
      .eq("user_id", ctx.userId);
    if (status !== "all") q = q.eq("status", status);
    const { data, error } = await q.order("created_at", { ascending: false }).limit((input.limit as number) ?? 20);
    if (error) throw error;
    return { messages: data };
  },

  respond_to_agent_message: async (input, ctx) => {
    const { data, error } = await ctx.sb
      .from("agent_messages")
      .update({
        status: input.decision as string,
        clrk_response: input.response_text ? { response: input.response_text } : null,
      })
      .eq("id", input.message_id as string)
      .eq("user_id", ctx.userId)
      .select()
      .single();
    if (error) throw error;
    return { message: data };
  },
};
