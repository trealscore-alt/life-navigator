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
  {
    side: "server",
    name: "search_history",
    description:
      "Search CLRK's permissioned history layer across conversations, rolling summaries, durable memory, tasks, subagents, device readings, and imported history events. Use whenever the user asks about the past, previous work, personal context, or anything CLRK may have seen before.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for in CLRK history." },
        sources: {
          type: "array",
          items: {
            type: "string",
            enum: ["history_events", "conversations", "summaries", "memory", "tasks", "subagents", "devices"],
          },
          description: "Optional source filter. Omit for all sources.",
        },
        limit: { type: "integer", default: 20 },
      },
      required: ["query"],
    },
  },
  {
    side: "server",
    name: "write_history_event",
    description:
      "Write a durable event into CLRK's permissioned history index. Use for important user-approved imports, milestones, observations, device context, task outcomes, and cross-session facts that are broader than a single memory.",
    input_schema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Origin such as conversation, import, web, robot, device, task, or manual." },
        kind: { type: "string", description: "Event type such as note, transcript, observation, file, page, task_result, or device_context." },
        title: { type: "string" },
        content: { type: "string", description: "Self-contained event text." },
        occurred_at: { type: "string", description: "ISO datetime. Defaults to now." },
        metadata: { type: "object" },
      },
      required: ["source", "kind", "content"],
    },
  },
  {
    side: "server",
    name: "web_search",
    description:
      "Search the live internet through CLRK's configured search provider. Use for current facts, broad research, links, citations, news, product/spec changes, laws, prices, schedules, and anything likely to have changed.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        max_results: { type: "integer", default: 5, minimum: 1, maximum: 10 },
      },
      required: ["query"],
    },
  },
  {
    side: "server",
    name: "fetch_url",
    description:
      "Fetch and summarize a public http(s) URL. Use after web_search when the exact page matters, and cite the returned URL/title. Blocks localhost and private network addresses for safety.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string" },
        max_chars: { type: "integer", default: 6000, minimum: 500, maximum: 12000 },
      },
      required: ["url"],
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

  // ── Internal CLRK subagents ──────────────────────────────────────────────
  {
    side: "server",
    name: "define_subagent",
    description:
      "Define one internal CLRK specialist subagent with a role, mission, capabilities, scoped tools, guardrails, and autonomy level. Use when the user asks CLRK to create an agent or when a task needs a reusable specialist.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short memorable subagent name, e.g. Finance Scout, Vehicle Ops, Launch Planner." },
        role: { type: "string", description: "Specialist role this subagent performs." },
        mission: { type: "string", description: "Clear mission statement and outcome." },
        domain: {
          type: "string",
          enum: ["work", "finance", "health", "relationships", "learning", "lifestyle", "ambition"],
        },
        autonomy_level: {
          type: "string",
          enum: ["L0_advisory", "L1_drafting", "L2_assisted", "L3_rule_based", "L4_delegated", "L5_ambient"],
        },
        capabilities: { type: "array", items: { type: "string" } },
        tool_scope: { type: "array", items: { type: "string" }, description: "Allowed CLRK tools/devices/data sources." },
        guardrails: { type: "object", description: "Safety, approval, spending, data, and device constraints." },
        handoff_contract: { type: "object", description: "Expected output format, done criteria, escalation rules." },
        parent_task_id: { type: "string" },
      },
      required: ["name", "role", "mission"],
    },
  },
  {
    side: "server",
    name: "deploy_subagents",
    description:
      "Create a parent CLRK task and deploy a coordinated squad of internal subagents for a user objective. Use for voice prompts like 'CLRK, handle this', 'deploy agents to...', or any complex task requiring multiple specialists.",
    input_schema: {
      type: "object",
      properties: {
        objective: { type: "string", description: "The user's objective in clear operational language." },
        domain: {
          type: "string",
          enum: ["work", "finance", "health", "relationships", "learning", "lifestyle", "ambition"],
        },
        autonomy_level: {
          type: "string",
          enum: ["L0_advisory", "L1_drafting", "L2_assisted", "L3_rule_based", "L4_delegated", "L5_ambient"],
          description: "Default autonomy level for the parent task and subagents.",
        },
        subagents: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              role: { type: "string" },
              mission: { type: "string" },
              capabilities: { type: "array", items: { type: "string" } },
              tool_scope: { type: "array", items: { type: "string" } },
              guardrails: { type: "object" },
              handoff_contract: { type: "object" },
            },
          },
          description: "Specialist subagents to create and queue. If omitted, CLRK should infer a small squad of 2-5 specialists.",
        },
        plan: { type: "array", items: { type: "object" }, description: "Parent task plan steps." },
      },
      required: ["objective", "subagents"],
    },
  },
  {
    side: "server",
    name: "list_subagents",
    description: "List CLRK internal subagents and recent runs. Use when the user asks what agents are working, deployed, paused, or available.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["draft", "ready", "deployed", "paused", "completed", "failed", "archived", "all"] },
        include_runs: { type: "boolean", default: true },
        limit: { type: "integer", default: 25 },
      },
    },
  },
  {
    side: "server",
    name: "update_subagent",
    description:
      "Update an internal CLRK subagent or one of its runs. Use to pause, complete, fail, archive, report progress, or attach output.",
    input_schema: {
      type: "object",
      properties: {
        subagent_id: { type: "string" },
        run_id: { type: "string" },
        status: { type: "string", enum: ["draft", "ready", "deployed", "paused", "completed", "failed", "archived"] },
        run_status: { type: "string", enum: ["queued", "running", "awaiting_user", "blocked", "completed", "failed", "cancelled"] },
        result_summary: { type: "string" },
        output: { type: "object" },
        error_message: { type: "string" },
      },
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

  // ── Personal robot (CLIENT-SIDE — runs on the robot) ─────────────────────
  {
    side: "client",
    name: "robot_status",
    description:
      "Read the robot's current local status, including battery, mobility state, pose, installed capability names, safety state, and latest sensor summary.",
    input_schema: { type: "object", properties: {} },
  },
  {
    side: "client",
    name: "robot_say",
    description:
      "Speak a short sentence through the robot's speaker. Use for embodied interaction, confirmations, and warnings.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Short spoken text. Keep it natural and concise." },
        voice: { type: "string", description: "Optional robot voice id." },
      },
      required: ["text"],
    },
  },
  {
    side: "client",
    name: "robot_read_sensors",
    description:
      "Read live robot sensor data. Use before physical movement, environmental assessment, or any embodied action.",
    input_schema: {
      type: "object",
      properties: {
        sensors: {
          type: "array",
          items: { type: "string" },
          description: "Optional sensor names such as camera, lidar, depth, microphone, imu, bumper, battery.",
        },
      },
    },
  },
  {
    side: "client",
    name: "robot_capture_image",
    description:
      "Capture a still image from the robot's camera. The robot returns a base64 image or a local reference depending on hardware adapter.",
    input_schema: {
      type: "object",
      properties: {
        camera: { type: "string", description: "Optional camera id, such as front, rear, wrist, head." },
      },
    },
  },
  {
    side: "client",
    name: "robot_move_base",
    description:
      "Move the robot base. This is a physical-world action and must obey the robot safety policy. Always call robot_read_sensors or robot_status first.",
    input_schema: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["forward", "backward", "left", "right", "turn_left", "turn_right"] },
        distance_m: { type: "number", description: "Linear movement distance in meters. Keep small unless user explicitly allows more." },
        angle_deg: { type: "number", description: "Turn angle in degrees for turn_left or turn_right." },
        speed: { type: "string", enum: ["crawl", "slow", "normal"], description: "Defaults to slow." },
      },
      required: ["direction"],
    },
  },
  {
    side: "client",
    name: "robot_stop",
    description:
      "Immediately stop all robot motion and active physical actuators. Use this any time safety is uncertain.",
    input_schema: { type: "object", properties: {} },
  },
  {
    side: "client",
    name: "robot_set_mode",
    description:
      "Set robot operating mode. Use idle for waiting, observe for passive sensing, assist for user-guided work, and dock for returning to charger if supported.",
    input_schema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["idle", "observe", "assist", "dock"] },
      },
      required: ["mode"],
    },
  },

  // ── Universal smart device mesh (CLIENT-SIDE) ────────────────────────────
  {
    side: "client",
    name: "smart_device_scan",
    description:
      "Scan for smart devices across available transports: Bluetooth, Wi-Fi/LAN, local vehicle bridge, smart glasses bridge, VR headset bridge, Matter, HomeKit, or vendor adapters.",
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["all", "smart_glasses", "vr_headset", "vehicle", "wearable", "smart_home", "robot", "phone", "audio"],
        },
        transport: {
          type: "string",
          enum: ["any", "bluetooth", "wifi", "matter", "homekit", "vehicle_bridge", "xr_bridge", "robot_runtime"],
        },
      },
    },
  },
  {
    side: "client",
    name: "smart_device_connect",
    description:
      "Connect CLRK to a smart device endpoint. Use this for smart glasses, VR headsets, vehicles, wearables, smart-home systems, and robot runtimes.",
    input_schema: {
      type: "object",
      properties: {
        device_id: { type: "string", description: "Stable device id from smart_device_scan or smart_device_status." },
        category: {
          type: "string",
          enum: ["smart_glasses", "vr_headset", "vehicle", "wearable", "smart_home", "robot", "phone", "audio"],
        },
      },
      required: ["device_id"],
    },
  },
  {
    side: "client",
    name: "smart_device_status",
    description:
      "Get current connected smart-device mesh status, including active conversation endpoints, sensors, audio routes, display routes, and command capabilities.",
    input_schema: {
      type: "object",
      properties: {
        device_id: { type: "string", description: "Optional device id. Omit for whole mesh." },
      },
    },
  },
  {
    side: "client",
    name: "smart_device_command",
    description:
      "Send a structured command to a connected smart device. Use for non-dangerous device control such as display text on glasses, route audio, request vehicle telemetry, start VR overlay, or toggle a smart-home scene.",
    input_schema: {
      type: "object",
      properties: {
        device_id: { type: "string" },
        command: { type: "string" },
        args: { type: "object", description: "Command-specific arguments." },
      },
      required: ["device_id", "command"],
    },
  },
  {
    side: "client",
    name: "smart_device_start_conversation",
    description:
      "Start or resume a persistent CLRK conversation session on a device endpoint such as smart glasses, VR headset, vehicle cabin, earbuds, phone, or robot.",
    input_schema: {
      type: "object",
      properties: {
        device_id: { type: "string" },
        mode: { type: "string", enum: ["hands_free", "push_to_talk", "ambient", "meeting", "navigation"] },
      },
      required: ["device_id"],
    },
  },
  {
    side: "client",
    name: "smart_device_stop_conversation",
    description:
      "Stop a device conversation endpoint while preserving the conversation summary and session continuity.",
    input_schema: {
      type: "object",
      properties: {
        device_id: { type: "string" },
      },
      required: ["device_id"],
    },
  },
  {
    side: "client",
    name: "smart_device_read_context",
    description:
      "Read contextual signals from a connected smart device: glasses camera summary, VR scene state, vehicle telemetry, wearable health state, home sensor state, or current audio route.",
    input_schema: {
      type: "object",
      properties: {
        device_id: { type: "string" },
        signals: { type: "array", items: { type: "string" } },
      },
      required: ["device_id"],
    },
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

type HistorySource = "history_events" | "conversations" | "summaries" | "memory" | "tasks" | "subagents" | "devices";
type SearchResult = { source: HistorySource | "web"; items: unknown[]; error?: string };
type WebResult = { title: string; url: string; snippet?: string; source?: string };

const DEFAULT_HISTORY_SOURCES: HistorySource[] = [
  "history_events",
  "conversations",
  "summaries",
  "memory",
  "tasks",
  "subagents",
  "devices",
];

function intInput(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.max(min, Math.min(max, n));
}

function textInput(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function searchPattern(query: string): string {
  return `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

async function safeHistoryQuery(source: HistorySource, query: () => PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>): Promise<SearchResult> {
  try {
    const { data, error } = await query();
    if (error) return { source, items: [], error: error.message ?? "History source unavailable." };
    return { source, items: data ?? [] };
  } catch (error) {
    return { source, items: [], error: error instanceof Error ? error.message : "History source unavailable." };
  }
}

function publicHttpUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only public http(s) URLs can be fetched.");

  const host = url.hostname.toLowerCase();
  const blockedHosts = ["localhost", "0.0.0.0", "127.0.0.1", "::1"];
  if (blockedHosts.includes(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Local and private network URLs are blocked.");
  }

  const parts = host.split(".").map((part) => Number.parseInt(part, 10));
  const isIpv4 = parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
  if (isIpv4) {
    const [a, b] = parts;
    if (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) {
      throw new Error("Private network URLs are blocked.");
    }
  }

  return url;
}

function htmlToText(html: string, maxChars: number): { title: string | null; text: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?.replace(/\s+/g, " ")
    .trim() ?? null;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
  return { title, text };
}

async function runWebSearch(query: string, maxResults: number): Promise<{ configured: boolean; provider?: string; results: WebResult[]; message?: string }> {
  const tavilyKey = Deno.env.get("TAVILY_API_KEY");
  if (tavilyKey) {
    const resp = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: tavilyKey, query, max_results: maxResults, include_answer: false }),
    });
    if (!resp.ok) throw new Error(`Tavily search returned ${resp.status}`);
    const body = await resp.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
    return {
      configured: true,
      provider: "tavily",
      results: (body.results ?? []).filter((item) => item.url).slice(0, maxResults).map((item) => ({
        title: item.title || item.url || "Untitled",
        url: item.url!,
        snippet: item.content,
        source: "tavily",
      })),
    };
  }

  const serperKey = Deno.env.get("SERPER_API_KEY");
  if (serperKey) {
    const resp = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": serperKey },
      body: JSON.stringify({ q: query, num: maxResults }),
    });
    if (!resp.ok) throw new Error(`Serper search returned ${resp.status}`);
    const body = await resp.json() as { organic?: Array<{ title?: string; link?: string; snippet?: string }> };
    return {
      configured: true,
      provider: "serper",
      results: (body.organic ?? []).filter((item) => item.link).slice(0, maxResults).map((item) => ({
        title: item.title || item.link || "Untitled",
        url: item.link!,
        snippet: item.snippet,
        source: "serper",
      })),
    };
  }

  const braveKey = Deno.env.get("BRAVE_SEARCH_API_KEY");
  if (braveKey) {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(maxResults));
    const resp = await fetch(url, { headers: { Accept: "application/json", "X-Subscription-Token": braveKey } });
    if (!resp.ok) throw new Error(`Brave search returned ${resp.status}`);
    const body = await resp.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
    return {
      configured: true,
      provider: "brave",
      results: (body.web?.results ?? []).filter((item) => item.url).slice(0, maxResults).map((item) => ({
        title: item.title || item.url || "Untitled",
        url: item.url!,
        snippet: item.description,
        source: "brave",
      })),
    };
  }

  return {
    configured: false,
    results: [],
    message: "No web search provider is configured. Set TAVILY_API_KEY, SERPER_API_KEY, or BRAVE_SEARCH_API_KEY in the Supabase Edge Function environment.",
  };
}

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

  search_history: async (input, ctx) => {
    const query = textInput(input.query);
    if (!query) throw new Error("query required");
    const limit = intInput(input.limit, 20, 1, 50);
    const requestedSources = Array.isArray(input.sources)
      ? input.sources.filter((source): source is HistorySource => DEFAULT_HISTORY_SOURCES.includes(source as HistorySource))
      : DEFAULT_HISTORY_SOURCES;
    const pattern = searchPattern(query);
    const sourceLimit = Math.max(3, Math.ceil(limit / Math.max(1, requestedSources.length)));

    const lookups: Array<Promise<SearchResult>> = requestedSources.map((source) => {
      if (source === "history_events") {
        return safeHistoryQuery(source, () => ctx.sb
          .from("clrk_history_events")
          .select("id, source, kind, title, content, occurred_at, metadata, created_at")
          .eq("user_id", ctx.userId)
          .ilike("content", pattern)
          .order("occurred_at", { ascending: false })
          .limit(sourceLimit));
      }
      if (source === "conversations") {
        return safeHistoryQuery(source, () => ctx.sb
          .from("chat_messages")
          .select("id, conversation_id, role, content, metadata, created_at")
          .eq("user_id", ctx.userId)
          .ilike("content", pattern)
          .order("created_at", { ascending: false })
          .limit(sourceLimit));
      }
      if (source === "summaries") {
        return safeHistoryQuery(source, () => ctx.sb
          .from("chat_summaries")
          .select("id, conversation_id, summary, message_count, updated_at")
          .eq("user_id", ctx.userId)
          .ilike("summary", pattern)
          .order("updated_at", { ascending: false })
          .limit(sourceLimit));
      }
      if (source === "memory") {
        return safeHistoryQuery(source, () => ctx.sb
          .from("clrk_memory")
          .select("id, kind, content, importance, source, source_id, created_at")
          .eq("user_id", ctx.userId)
          .ilike("content", pattern)
          .order("importance", { ascending: false })
          .limit(sourceLimit));
      }
      if (source === "tasks") {
        return safeHistoryQuery(source, () => ctx.sb
          .from("clrk_tasks")
          .select("id, title, description, domain, status, autonomy_level, result, created_at, completed_at")
          .eq("user_id", ctx.userId)
          .ilike("title", pattern)
          .order("created_at", { ascending: false })
          .limit(sourceLimit));
      }
      if (source === "subagents") {
        return safeHistoryQuery(source, () => ctx.sb
          .from("clrk_subagents")
          .select("id, name, role, mission, domain, status, autonomy_level, capabilities, tool_scope, result, created_at")
          .eq("user_id", ctx.userId)
          .ilike("mission", pattern)
          .order("created_at", { ascending: false })
          .limit(sourceLimit));
      }
      return safeHistoryQuery(source, () => ctx.sb
        .from("device_data_logs")
        .select("id, device_name, data_type, value, unit, created_at")
        .eq("user_id", ctx.userId)
        .ilike("data_type", pattern)
        .order("created_at", { ascending: false })
        .limit(sourceLimit));
    });

    const results = await Promise.all(lookups);
    return {
      query,
      limit,
      results,
      total_items: results.reduce((sum, result) => sum + result.items.length, 0),
      note: "This searches CLRK-owned and user-imported history only. Private external history requires a connector/import with user permission.",
    };
  },

  write_history_event: async (input, ctx) => {
    const source = textInput(input.source);
    const kind = textInput(input.kind);
    const content = textInput(input.content);
    if (!source || !kind || !content) throw new Error("source, kind, and content are required");
    const title = textInput(input.title, content.slice(0, 90));
    const occurredAt = textInput(input.occurred_at, new Date().toISOString());
    const embedding = ctx.embed ? await ctx.embed(`${title}\n${content}`).catch(() => null) : null;

    const { data, error } = await ctx.sb
      .from("clrk_history_events")
      .insert({
        user_id: ctx.userId,
        conversation_id: ctx.conversationId ?? null,
        source,
        kind,
        title,
        content,
        occurred_at: occurredAt,
        metadata: (input.metadata as Record<string, unknown>) ?? {},
        embedding,
      })
      .select("id, source, kind, title, occurred_at, created_at")
      .single();
    if (error) throw error;
    return { event: data, embedded: !!embedding };
  },

  web_search: async (input) => {
    const query = textInput(input.query);
    if (!query) throw new Error("query required");
    const maxResults = intInput(input.max_results, 5, 1, 10);
    return await runWebSearch(query, maxResults);
  },

  fetch_url: async (input) => {
    const rawUrl = textInput(input.url);
    if (!rawUrl) throw new Error("url required");
    const url = publicHttpUrl(rawUrl);
    const maxChars = intInput(input.max_chars, 6000, 500, 12000);
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "CLRK-Agent/1.0 (+https://github.com/trealscore-alt/life-navigator)",
        Accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.5",
      },
      redirect: "follow",
    });
    if (!resp.ok) throw new Error(`URL fetch returned ${resp.status}`);
    const contentType = resp.headers.get("content-type") ?? "";
    const raw = (await resp.text()).slice(0, Math.max(maxChars * 4, 12000));
    const parsed = contentType.includes("html") ? htmlToText(raw, maxChars) : { title: null, text: raw.replace(/\s+/g, " ").trim().slice(0, maxChars) };
    return {
      url: url.toString(),
      status: resp.status,
      content_type: contentType,
      title: parsed.title,
      text: parsed.text,
      truncated: parsed.text.length >= maxChars,
    };
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

  define_subagent: async (input, ctx) => {
    const { data, error } = await ctx.sb
      .from("clrk_subagents")
      .insert({
        user_id: ctx.userId,
        conversation_id: ctx.conversationId ?? null,
        parent_task_id: (input.parent_task_id as string) ?? null,
        name: input.name as string,
        role: input.role as string,
        mission: input.mission as string,
        domain: (input.domain as string) ?? null,
        autonomy_level: (input.autonomy_level as string) ?? "L1_drafting",
        capabilities: Array.isArray(input.capabilities) ? input.capabilities.map(String) : [],
        tool_scope: Array.isArray(input.tool_scope) ? input.tool_scope.map(String) : [],
        guardrails: (input.guardrails as Record<string, unknown>) ?? {},
        handoff_contract: (input.handoff_contract as Record<string, unknown>) ?? {},
        status: "ready",
      })
      .select("id, name, role, mission, status, autonomy_level, capabilities, tool_scope")
      .single();
    if (error) throw error;
    return { subagent: data };
  },

  deploy_subagents: async (input, ctx) => {
    const objective = input.objective as string;
    const autonomyLevel = (input.autonomy_level as string) ?? "L1_drafting";
    const rawSubagents = Array.isArray(input.subagents) ? input.subagents as Array<Record<string, unknown>> : [];
    if (rawSubagents.length === 0) throw new Error("subagents[] required");

    const parentPlan = Array.isArray(input.plan)
      ? input.plan
      : rawSubagents.map((agent, idx) => ({
          id: crypto.randomUUID(),
          title: `${agent.name || `Subagent ${idx + 1}`} executes assigned mission`,
          status: "pending",
        }));

    const { data: task, error: taskError } = await ctx.sb
      .from("clrk_tasks")
      .insert({
        user_id: ctx.userId,
        conversation_id: ctx.conversationId ?? null,
        title: objective.slice(0, 120),
        description: objective,
        domain: (input.domain as string) ?? null,
        autonomy_level: autonomyLevel,
        plan: parentPlan,
        status: autonomyLevel === "L0_advisory" || autonomyLevel === "L1_drafting" ? "awaiting_user" : "pending",
        metadata: { created_by: "deploy_subagents", subagent_count: rawSubagents.length },
      })
      .select("id, title, status, autonomy_level")
      .single();
    if (taskError) throw taskError;

    const subagentRows = rawSubagents.map((agent, idx) => ({
      user_id: ctx.userId,
      parent_task_id: task.id,
      conversation_id: ctx.conversationId ?? null,
      name: String(agent.name || `CLRK Subagent ${idx + 1}`),
      role: String(agent.role || "Specialist executor"),
      mission: String(agent.mission || objective),
      domain: (agent.domain as string) ?? (input.domain as string) ?? null,
      autonomy_level: (agent.autonomy_level as string) ?? autonomyLevel,
      capabilities: Array.isArray(agent.capabilities) ? agent.capabilities.map(String) : [],
      tool_scope: Array.isArray(agent.tool_scope) ? agent.tool_scope.map(String) : [],
      guardrails: (agent.guardrails as Record<string, unknown>) ?? {
        approval_required_for: ["external_send", "purchase", "delete", "physical_action", "credential_use"],
      },
      handoff_contract: (agent.handoff_contract as Record<string, unknown>) ?? {
        output: "summary, findings, next_actions, blockers",
        escalation: "ask CLRK/user when approval or missing data blocks progress",
      },
      status: "deployed",
      last_deployed_at: new Date().toISOString(),
      metadata: { deployed_by: "deploy_subagents" },
    }));

    const { data: subagents, error: subagentError } = await ctx.sb
      .from("clrk_subagents")
      .insert(subagentRows)
      .select("id, name, role, mission, status, autonomy_level");
    if (subagentError) throw subagentError;

    const runRows = (subagents || []).map((agent: { id: string; name: string; mission: string }) => ({
      user_id: ctx.userId,
      subagent_id: agent.id,
      task_id: task.id,
      conversation_id: ctx.conversationId ?? null,
      objective: agent.mission,
      input: { parent_objective: objective, subagent_name: agent.name },
      status: autonomyLevel === "L0_advisory" || autonomyLevel === "L1_drafting" ? "awaiting_user" : "queued",
      plan: [],
    }));

    const { data: runs, error: runError } = await ctx.sb
      .from("clrk_subagent_runs")
      .insert(runRows)
      .select("id, subagent_id, objective, status");
    if (runError) throw runError;

    return { task, subagents, runs };
  },

  list_subagents: async (input, ctx) => {
    const status = (input.status as string) ?? "all";
    const limit = (input.limit as number) ?? 25;
    let q = ctx.sb
      .from("clrk_subagents")
      .select("id, name, role, mission, domain, status, autonomy_level, capabilities, tool_scope, last_deployed_at, created_at, result")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status !== "all") q = q.eq("status", status);
    const { data: subagents, error } = await q;
    if (error) throw error;

    if (input.include_runs === false || !subagents || subagents.length === 0) return { subagents };

    const { data: runs, error: runError } = await ctx.sb
      .from("clrk_subagent_runs")
      .select("id, subagent_id, task_id, status, objective, output, error_message, created_at, completed_at")
      .eq("user_id", ctx.userId)
      .in("subagent_id", subagents.map((agent: { id: string }) => agent.id))
      .order("created_at", { ascending: false })
      .limit(limit * 3);
    if (runError) throw runError;
    return { subagents, runs: runs ?? [] };
  },

  update_subagent: async (input, ctx) => {
    const out: Record<string, unknown> = {};

    if (input.subagent_id) {
      const updates: Record<string, unknown> = {};
      if (input.status) updates.status = input.status;
      if (input.result_summary || input.output) {
        updates.result = {
          summary: input.result_summary,
          output: input.output ?? null,
        };
      }
      if (input.error_message) updates.error_message = input.error_message;
      if (input.status === "completed") updates.completed_at = new Date().toISOString();

      const { data, error } = await ctx.sb
        .from("clrk_subagents")
        .update(updates)
        .eq("id", input.subagent_id as string)
        .eq("user_id", ctx.userId)
        .select()
        .single();
      if (error) throw error;
      out.subagent = data;
    }

    if (input.run_id) {
      const updates: Record<string, unknown> = {};
      if (input.run_status) updates.status = input.run_status;
      if (input.output || input.result_summary) {
        updates.output = {
          summary: input.result_summary,
          ...(input.output as Record<string, unknown> ?? {}),
        };
      }
      if (input.error_message) updates.error_message = input.error_message;
      if (input.run_status === "running") updates.started_at = new Date().toISOString();
      if (input.run_status === "completed" || input.run_status === "failed" || input.run_status === "cancelled") {
        updates.completed_at = new Date().toISOString();
      }

      const { data, error } = await ctx.sb
        .from("clrk_subagent_runs")
        .update(updates)
        .eq("id", input.run_id as string)
        .eq("user_id", ctx.userId)
        .select()
        .single();
      if (error) throw error;
      out.run = data;
    }

    if (!out.subagent && !out.run) throw new Error("subagent_id or run_id required");
    return out;
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
