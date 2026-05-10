CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clrk_task_status') THEN
    CREATE TYPE public.clrk_task_status AS ENUM (
      'pending', 'planning', 'awaiting_user', 'executing', 'blocked', 'completed', 'failed', 'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clrk_autonomy_level') THEN
    CREATE TYPE public.clrk_autonomy_level AS ENUM (
      'L0_advisory', 'L1_drafting', 'L2_assisted', 'L3_rule_based', 'L4_delegated', 'L5_ambient'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clrk_subagent_status') THEN
    CREATE TYPE public.clrk_subagent_status AS ENUM (
      'draft', 'ready', 'deployed', 'paused', 'completed', 'failed', 'archived'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clrk_subagent_run_status') THEN
    CREATE TYPE public.clrk_subagent_run_status AS ENUM (
      'queued', 'running', 'awaiting_user', 'blocked', 'completed', 'failed', 'cancelled'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.clrk_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  parent_task_id UUID REFERENCES public.clrk_tasks(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES public.user_goals(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  domain life_domain,
  plan JSONB DEFAULT '[]'::jsonb,
  trace JSONB DEFAULT '[]'::jsonb,
  status public.clrk_task_status NOT NULL DEFAULT 'pending',
  autonomy_level public.clrk_autonomy_level NOT NULL DEFAULT 'L1_drafting',
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_executor_run_at TIMESTAMPTZ,
  next_check_at TIMESTAMPTZ,
  result JSONB,
  error_message TEXT,
  max_steps INTEGER NOT NULL DEFAULT 25,
  steps_used INTEGER NOT NULL DEFAULT 0,
  cost_cents_estimate INTEGER,
  cost_cents_actual INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clrk_tasks_user_status ON public.clrk_tasks (user_id, status);
CREATE INDEX IF NOT EXISTS idx_clrk_tasks_scheduled ON public.clrk_tasks (scheduled_for) WHERE status IN ('pending', 'blocked');
CREATE INDEX IF NOT EXISTS idx_clrk_tasks_parent ON public.clrk_tasks (parent_task_id);

ALTER TABLE public.clrk_tasks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clrk_tasks' AND policyname = 'Users can view own tasks') THEN
    CREATE POLICY "Users can view own tasks" ON public.clrk_tasks FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clrk_tasks' AND policyname = 'Users can insert own tasks') THEN
    CREATE POLICY "Users can insert own tasks" ON public.clrk_tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clrk_tasks' AND policyname = 'Users can update own tasks') THEN
    CREATE POLICY "Users can update own tasks" ON public.clrk_tasks FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clrk_tasks' AND policyname = 'Users can delete own tasks') THEN
    CREATE POLICY "Users can delete own tasks" ON public.clrk_tasks FOR DELETE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_clrk_tasks_updated_at') THEN
    CREATE TRIGGER update_clrk_tasks_updated_at BEFORE UPDATE ON public.clrk_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.clrk_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('fact', 'pattern', 'strategic', 'environment', 'lesson', 'preference')),
  content TEXT NOT NULL,
  source TEXT,
  source_id UUID,
  confidence REAL DEFAULT 0.8 CHECK (confidence BETWEEN 0 AND 1),
  embedding VECTOR(1536),
  importance INTEGER DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  superseded_by UUID REFERENCES public.clrk_memory(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clrk_memory_user_kind ON public.clrk_memory (user_id, kind);
CREATE INDEX IF NOT EXISTS idx_clrk_memory_embedding ON public.clrk_memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE public.clrk_memory ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clrk_memory' AND policyname = 'Users can view own memory') THEN
    CREATE POLICY "Users can view own memory" ON public.clrk_memory FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clrk_memory' AND policyname = 'Users can insert own memory') THEN
    CREATE POLICY "Users can insert own memory" ON public.clrk_memory FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clrk_memory' AND policyname = 'Users can update own memory') THEN
    CREATE POLICY "Users can update own memory" ON public.clrk_memory FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clrk_memory' AND policyname = 'Users can delete own memory') THEN
    CREATE POLICY "Users can delete own memory" ON public.clrk_memory FOR DELETE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_clrk_memory_updated_at') THEN
    CREATE TRIGGER update_clrk_memory_updated_at BEFORE UPDATE ON public.clrk_memory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

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

  UPDATE public.clrk_memory
  SET access_count = access_count + 1, last_accessed_at = now()
  WHERE user_id = p_user_id
    AND id IN (
      SELECT m.id
      FROM public.clrk_memory m
      WHERE m.user_id = p_user_id
        AND m.superseded_by IS NULL
        AND (m.expires_at IS NULL OR m.expires_at > now())
        AND (p_kinds IS NULL OR m.kind = ANY (p_kinds))
        AND m.embedding IS NOT NULL
      ORDER BY m.embedding <=> p_query_embedding
      LIMIT p_match_count
    );
END;
$$;

CREATE TABLE IF NOT EXISTS public.chat_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  summary TEXT NOT NULL,
  message_count INTEGER NOT NULL,
  last_message_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_summaries_user ON public.chat_summaries (user_id);

ALTER TABLE public.chat_summaries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_summaries' AND policyname = 'Users can view own summaries') THEN
    CREATE POLICY "Users can view own summaries" ON public.chat_summaries FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_summaries' AND policyname = 'Users can insert own summaries') THEN
    CREATE POLICY "Users can insert own summaries" ON public.chat_summaries FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_summaries' AND policyname = 'Users can update own summaries') THEN
    CREATE POLICY "Users can update own summaries" ON public.chat_summaries FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_chat_summaries_updated_at') THEN
    CREATE TRIGGER update_chat_summaries_updated_at BEFORE UPDATE ON public.chat_summaries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.clrk_subagents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  parent_task_id UUID REFERENCES public.clrk_tasks(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  mission TEXT NOT NULL,
  domain life_domain,
  status public.clrk_subagent_status NOT NULL DEFAULT 'draft',
  autonomy_level public.clrk_autonomy_level NOT NULL DEFAULT 'L1_drafting',
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  tool_scope TEXT[] NOT NULL DEFAULT '{}',
  handoff_contract JSONB NOT NULL DEFAULT '{}'::jsonb,
  guardrails JSONB NOT NULL DEFAULT '{}'::jsonb,
  memory JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_deployed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result JSONB,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clrk_subagents_user_status ON public.clrk_subagents (user_id, status);
CREATE INDEX IF NOT EXISTS idx_clrk_subagents_task ON public.clrk_subagents (parent_task_id);

ALTER TABLE public.clrk_subagents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clrk_subagents' AND policyname = 'Users can view own subagents') THEN
    CREATE POLICY "Users can view own subagents" ON public.clrk_subagents FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clrk_subagents' AND policyname = 'Users can insert own subagents') THEN
    CREATE POLICY "Users can insert own subagents" ON public.clrk_subagents FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clrk_subagents' AND policyname = 'Users can update own subagents') THEN
    CREATE POLICY "Users can update own subagents" ON public.clrk_subagents FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clrk_subagents' AND policyname = 'Users can delete own subagents') THEN
    CREATE POLICY "Users can delete own subagents" ON public.clrk_subagents FOR DELETE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_clrk_subagents_updated_at') THEN
    CREATE TRIGGER update_clrk_subagents_updated_at BEFORE UPDATE ON public.clrk_subagents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.clrk_subagent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  subagent_id UUID NOT NULL REFERENCES public.clrk_subagents(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.clrk_tasks(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE SET NULL,
  status public.clrk_subagent_run_status NOT NULL DEFAULT 'queued',
  objective TEXT NOT NULL,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  plan JSONB NOT NULL DEFAULT '[]'::jsonb,
  trace JSONB NOT NULL DEFAULT '[]'::jsonb,
  output JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clrk_subagent_runs_user_status ON public.clrk_subagent_runs (user_id, status);
CREATE INDEX IF NOT EXISTS idx_clrk_subagent_runs_subagent ON public.clrk_subagent_runs (subagent_id);

ALTER TABLE public.clrk_subagent_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clrk_subagent_runs' AND policyname = 'Users can view own subagent runs') THEN
    CREATE POLICY "Users can view own subagent runs" ON public.clrk_subagent_runs FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clrk_subagent_runs' AND policyname = 'Users can insert own subagent runs') THEN
    CREATE POLICY "Users can insert own subagent runs" ON public.clrk_subagent_runs FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clrk_subagent_runs' AND policyname = 'Users can update own subagent runs') THEN
    CREATE POLICY "Users can update own subagent runs" ON public.clrk_subagent_runs FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clrk_subagent_runs' AND policyname = 'Users can delete own subagent runs') THEN
    CREATE POLICY "Users can delete own subagent runs" ON public.clrk_subagent_runs FOR DELETE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_clrk_subagent_runs_updated_at') THEN
    CREATE TRIGGER update_clrk_subagent_runs_updated_at BEFORE UPDATE ON public.clrk_subagent_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.clrk_history_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  source_id TEXT,
  kind TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clrk_history_events_user_time ON public.clrk_history_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_clrk_history_events_user_source ON public.clrk_history_events (user_id, source, kind);
CREATE INDEX IF NOT EXISTS idx_clrk_history_events_content_trgm ON public.clrk_history_events USING gin (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clrk_history_events_embedding ON public.clrk_history_events USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE public.clrk_history_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clrk_history_events' AND policyname = 'Users can view own history events') THEN
    CREATE POLICY "Users can view own history events" ON public.clrk_history_events FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clrk_history_events' AND policyname = 'Users can insert own history events') THEN
    CREATE POLICY "Users can insert own history events" ON public.clrk_history_events FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clrk_history_events' AND policyname = 'Users can update own history events') THEN
    CREATE POLICY "Users can update own history events" ON public.clrk_history_events FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clrk_history_events' AND policyname = 'Users can delete own history events') THEN
    CREATE POLICY "Users can delete own history events" ON public.clrk_history_events FOR DELETE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_clrk_history_events_updated_at') THEN
    CREATE TRIGGER update_clrk_history_events_updated_at BEFORE UPDATE ON public.clrk_history_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.match_clrk_history(
  p_user_id UUID,
  p_query_embedding VECTOR(1536),
  p_match_count INTEGER DEFAULT 12,
  p_sources TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  source TEXT,
  kind TEXT,
  title TEXT,
  content TEXT,
  occurred_at TIMESTAMPTZ,
  similarity REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    h.id,
    h.source,
    h.kind,
    h.title,
    h.content,
    h.occurred_at,
    (1 - (h.embedding <=> p_query_embedding))::REAL AS similarity
  FROM public.clrk_history_events h
  WHERE h.user_id = p_user_id
    AND h.embedding IS NOT NULL
    AND (p_sources IS NULL OR h.source = ANY (p_sources))
  ORDER BY h.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;