// Thin LLM client. Anthropic Claude is the structured-tool agent brain.
//
// Anthropic's Messages API is what we expose throughout — even when the user
// has Lovable-only configured, we shape the response to look like Anthropic's
// `{ stop_reason, content: [...] }` so the agent loop has one code path.

import type { ToolDefinition } from "./tools.ts";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export interface ChatMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface ModelResponse {
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" | "error";
  content: ContentBlock[];
  usage?: { input_tokens: number; output_tokens: number };
  model: string;
  provider: "anthropic" | "lovable";
}

export interface LLMOptions {
  systemPrompt: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  /** Override automatic provider selection. */
  provider?: "anthropic" | "lovable";
  /** Anthropic model id. Default: claude-sonnet-4-6. */
  anthropicModel?: string;
  /** Lovable / OpenAI-format model id. Default: google/gemini-3-flash-preview. */
  lovableModel?: string;
}

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
const DEFAULT_LOVABLE_MODEL = "google/gemini-3-flash-preview";

export function pickProvider(): "anthropic" | "lovable" {
  if (Deno.env.get("ANTHROPIC_API_KEY")) return "anthropic";
  if (Deno.env.get("LOVABLE_API_KEY")) return "lovable";
  throw new Error("No LLM provider configured. Set ANTHROPIC_API_KEY or LOVABLE_API_KEY.");
}

export async function chat(opts: LLMOptions): Promise<ModelResponse> {
  const provider = opts.provider ?? pickProvider();
  if (provider !== "anthropic" && opts.tools && opts.tools.length > 0) {
    throw new Error("Structured CLRK tools require ANTHROPIC_API_KEY. No fallback model is allowed for tool-calling agent mode.");
  }
  return provider === "anthropic" ? chatAnthropic(opts) : chatLovable(opts);
}

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic
// ─────────────────────────────────────────────────────────────────────────────

async function chatAnthropic(opts: LLMOptions): Promise<ModelResponse> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const model = opts.anthropicModel ?? DEFAULT_ANTHROPIC_MODEL;

  const body: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.systemPrompt,
    messages: opts.messages,
  };
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
    body.tool_choice = { type: "auto" };
  }

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error("Anthropic error:", resp.status, text);
    throw new Error(`Anthropic ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = await resp.json();
  return {
    stop_reason: data.stop_reason,
    content: data.content,
    usage: data.usage,
    model: data.model,
    provider: "anthropic",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lovable gateway (OpenAI-format) — text-only legacy/live path
// We still translate the response into Anthropic's content-block shape so the
// agent loop is provider-agnostic.
// ─────────────────────────────────────────────────────────────────────────────

async function chatLovable(opts: LLMOptions): Promise<ModelResponse> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  const model = opts.lovableModel ?? DEFAULT_LOVABLE_MODEL;

  if (opts.tools && opts.tools.length > 0) {
    throw new Error("Lovable text path cannot execute tools. Set ANTHROPIC_API_KEY for CLRK agent mode.");
  }

  // Translate Anthropic message shape → OpenAI message shape.
  const oaMessages: Array<{ role: string; content: unknown }> = [
    { role: "system", content: opts.systemPrompt },
  ];
  for (const m of opts.messages) {
    if (typeof m.content === "string") {
      oaMessages.push({ role: m.role, content: m.content });
    } else {
      // Best-effort: collapse content blocks to text. tool_result blocks become
      // a JSON string the model can read; tool_use blocks are ignored
      // (Lovable can't do tool calls).
      const text = m.content
        .map((c) => {
          if (c.type === "text") return c.text;
          if (c.type === "tool_result") return `[tool result]\n${c.content}`;
          if (c.type === "tool_use") return `[tool call unavailable: ${c.name}]`;
          return "";
        })
        .filter(Boolean)
        .join("\n\n");
      oaMessages.push({ role: m.role, content: text });
    }
  }

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages: oaMessages, max_tokens: opts.maxTokens ?? 4096 }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error("Lovable error:", resp.status, text);
    throw new Error(`Lovable ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text }],
    usage: data.usage
      ? { input_tokens: data.usage.prompt_tokens ?? 0, output_tokens: data.usage.completion_tokens ?? 0 }
      : undefined,
    model: data.model ?? model,
    provider: "lovable",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Embeddings (OpenAI) — used by `remember` and `recall` tools.
// Optional: gracefully no-ops when OPENAI_API_KEY isn't set.
// ─────────────────────────────────────────────────────────────────────────────

export function makeEmbedder(): ((text: string) => Promise<number[] | null>) | undefined {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return undefined;
  return async (text: string) => {
    try {
      const resp = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
      });
      if (!resp.ok) {
        console.error("Embedding error:", resp.status, await resp.text());
        return null;
      }
      const data = await resp.json();
      return data.data?.[0]?.embedding ?? null;
    } catch (e) {
      console.error("Embedding exception:", e);
      return null;
    }
  };
}
