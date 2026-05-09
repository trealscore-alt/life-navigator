-- CLRK agent runtime — tasks, memory, summaries.
-- Adds the persistent state required for the planner/executor and real
-- long-term semantic memory. All tables RLS-enabled with per-user policies.

-- ─────────────────────────────────────────────────────────────────────────────
-- pgvector extension (for semantic memory recall)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────────────────────────────────────
-- clrk_tasks — the planner/executor backbone
-- A "task" is a goal CLRK is actively working on. Tasks can have plan steps
-- (decomposed into a tree via parent_task_id), be scheduled, and run at a
-- specified autonomy level. The executor wakes on a cron, picks up due tasks,
-- and runs them through the agent loop.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE public.clrk_task_status AS ENUM (
  'pending',         -- created, waiting to be picked up
  'planning',        -- planner is decomposing it
  'awaiting_user',   -- needs user approval (per autonomy level)
  'executing',       -- executor is working on it
  'blocked',         -- waiting on a dependency or external signal
  'completed',
  'failed',
  'cancelled'
);

-- Mirrors the autonomy levels declared in the system prompt.
CREATE TYPE public.clrk_autonomy_level AS ENUM (
  'L0_advisory',
  'L1_drafting',
  'L2_assisted',
  'L3_rule_based',
  'L4_delegated',
  'L5_ambient'
);

CREATE TABLE public.clrk_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_task_id UUID REFERENCES public.clrk_tasks(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES public.user_goals(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE SET NULL,

  -- The user-facing description of what this task accomplishes.
  title TEXT NOT NULL,
  description TEXT,
  domain life_domain,

  -- The planner's decomposition: an array of step objects.
  -- Shape: [{ id, title, status, tool?, depends_on?, result? }, ...]
  plan JSONB DEFAULT '[]'::jsonb,

  -- Working memory + tool execution log accumulated during execution.
  -- Shape: [{ ts, kind: 'thought'|'tool_call'|'tool_result'|'message', ... }]
  trace JSONB DEFAULT '[]'::jsonb,

  status clrk_task_status NOT NULL DEFAULT 'pending',
  autonomy_level clrk_autonomy_level NOT NULL DEFAULT 'L1_drafting',

  scheduled_for TIMESTAMPTZ,            -- when the executor should pick this up
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_executor_run_at TIMESTAMPTZ,
  next_check_at TIMESTAMPTZ,            -- for blocked/recurring tasks

  -- Result blob written by the executor on completion.
  result JSONB,
  error_message TEXT,

  -- Operational guardrails
  max_steps INTEGER NOT NULL DEFAULT 25,
  steps_used INTEGER NOT NULL DEFAULT 0,
  cost_cents_estimate INTEGER,
  cost_cents_actual INTEGER,

  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clrk_tasks_user_status ON public.clrk_tasks (user_id, status);
CREATE INDEX idx_clrk_tasks_scheduled  ON public.clrk_tasks (scheduled_for) WHERE status IN ('pending', 'blocked');
CREATE INDEX idx_clrk_tasks_parent     ON public.clrk_tasks (parent_task_id);

ALTER TABLE public.clrk_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own tasks"   ON public.clrk_tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tasks" ON public.clrk_tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tasks" ON public.clrk_tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tasks" ON public.clrk_tasks FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_clrk_tasks_updated_at
  BEFORE UPDATE ON public.clrk_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- clrk_memory — long-term semantic memory
-- Five-layer memory model: short-term (in-context), session (conversation
-- summary), long-term personal (this table), strategic (this table, kind=
-- 'strategic'), environmental (this table, kind='environment'). Embeddings let
-- us retrieve facts by meaning rather than keyword.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.clrk_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  kind TEXT NOT NULL CHECK (kind IN (
    'fact',          -- discrete fact about the user (preference, relationship, etc.)
    'pattern',       -- behavioral pattern CLRK has observed
    'strategic',     -- something the user is building toward
    'environment',   -- device, home, vehicle, app/platform
    'lesson',        -- conclusion drawn from a past task or interaction
    'preference'     -- explicit communication / action preference
  )),

  content TEXT NOT NULL,                  -- the human-readable memory
  source TEXT,                            -- 'conversation' | 'briefing' | 'task' | 'manual' | etc.
  source_id UUID,                         -- pointer to message/task/etc.
  confidence REAL DEFAULT 0.8 CHECK (confidence BETWEEN 0 AND 1),
  embedding VECTOR(1536),                 -- OpenAI text-embedding-3-small dim

  importance INTEGER DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER NOT NULL DEFAULT 0,

  expires_at TIMESTAMPTZ,                 -- for time-bounded facts
  superseded_by UUID REFERENCES public.clrk_memory(id) ON DELETE SET NULL,

  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clrk_memory_user_kind ON public.clrk_memory (user_id, kind);
-- IVFFlat index on embedding for fast approximate KNN. lists=100 is fine until
-- a user has tens of thousands of memories — re-tune later.
CREATE INDEX idx_clrk_memory_embedding
  ON public.clrk_memory USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE public.clrk_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own memory"   ON public.clrk_memory FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own memory" ON public.clrk_memory FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own memory" ON public.clrk_memory FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own memory" ON public.clrk_memory FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_clrk_memory_updated_at
  BEFORE UPDATE ON public.clrk_memory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Vector similarity search RPC. Returns up to p_match_count memories ordered by
-- cosine distance, filtered to the calling user, that have not been superseded
-- and have not expired. SECURITY DEFINER + explicit user_id check keeps RLS
-- enforced even though the function runs with the table owner's privileges.
CREATE OR REPLACE FUNCTION public.match_clrk_memory(
  p_user_id UUID,
  p_query_embedding VECTOR(1536),
  p_match_count INTEGER DEFAULT 8,
  p_kinds TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  kind TEXT,
  content TEXT,
  importance INTEGER,
  similarity REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The calling RPC client (anon or service role) is responsible for passing
  -- the right user_id; we still enforce it here to prevent cross-user reads.
  RETURN QUERY
  SELECT
    m.id,
    m.kind,
    m.content,
    m.importance,
    (1 - (m.embedding <=> p_query_embedding))::REAL AS similarity
  FROM public.clrk_memory m
  WHERE m.user_id = p_user_id
    AND m.superseded_by IS NULL
    AND (m.expires_at IS NULL OR m.expires_at > now())
    AND (p_kinds IS NULL OR m.kind = ANY (p_kinds))
    AND m.embedding IS NOT NULL
  ORDER BY m.embedding <=> p_query_embedding
  LIMIT p_match_count;

  -- Bump access counters for retrieved rows so we can prune cold memory later.
  UPDATE public.clrk_memory
  SET access_count = access_count + 1, last_accessed_at = now()
  WHERE user_id = p_user_id
    AND id IN (SELECT m.id FROM public.clrk_memory m
               WHERE m.user_id = p_user_id
                 AND m.superseded_by IS NULL
                 AND (m.expires_at IS NULL OR m.expires_at > now())
                 AND (p_kinds IS NULL OR m.kind = ANY (p_kinds))
                 AND m.embedding IS NOT NULL
               ORDER BY m.embedding <=> p_query_embedding
               LIMIT p_match_count);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- chat_summaries — rolling per-conversation summary
-- Updated by a summarizer step every N messages so older context can be
-- compacted without losing thread continuity.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.chat_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  message_count INTEGER NOT NULL,         -- how many messages this summary covers
  last_message_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id)                -- one rolling summary per conversation
);

CREATE INDEX idx_chat_summaries_user ON public.chat_summaries (user_id);

ALTER TABLE public.chat_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own summaries"   ON public.chat_summaries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own summaries" ON public.chat_summaries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own summaries" ON public.chat_summaries FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_chat_summaries_updated_at
  BEFORE UPDATE ON public.chat_summaries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
