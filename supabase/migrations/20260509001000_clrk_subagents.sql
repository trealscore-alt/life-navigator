-- CLRK subagent framework — define, deploy, and track specialist agents.
-- Subagents are CLRK-owned specialists created from user intent. They are not
-- external A2A agents; they are internal task executors with scoped roles,
-- tools, guardrails, and deployment runs.

CREATE TYPE public.clrk_subagent_status AS ENUM (
  'draft',
  'ready',
  'deployed',
  'paused',
  'completed',
  'failed',
  'archived'
);

CREATE TYPE public.clrk_subagent_run_status AS ENUM (
  'queued',
  'running',
  'awaiting_user',
  'blocked',
  'completed',
  'failed',
  'cancelled'
);

CREATE TABLE public.clrk_subagents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_task_id UUID REFERENCES public.clrk_tasks(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  role TEXT NOT NULL,
  mission TEXT NOT NULL,
  domain life_domain,

  status clrk_subagent_status NOT NULL DEFAULT 'draft',
  autonomy_level clrk_autonomy_level NOT NULL DEFAULT 'L1_drafting',

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

CREATE INDEX idx_clrk_subagents_user_status ON public.clrk_subagents (user_id, status);
CREATE INDEX idx_clrk_subagents_task ON public.clrk_subagents (parent_task_id);

ALTER TABLE public.clrk_subagents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own subagents" ON public.clrk_subagents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own subagents" ON public.clrk_subagents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own subagents" ON public.clrk_subagents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own subagents" ON public.clrk_subagents FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_clrk_subagents_updated_at
  BEFORE UPDATE ON public.clrk_subagents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.clrk_subagent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subagent_id UUID NOT NULL REFERENCES public.clrk_subagents(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.clrk_tasks(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE SET NULL,

  status clrk_subagent_run_status NOT NULL DEFAULT 'queued',
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

CREATE INDEX idx_clrk_subagent_runs_user_status ON public.clrk_subagent_runs (user_id, status);
CREATE INDEX idx_clrk_subagent_runs_subagent ON public.clrk_subagent_runs (subagent_id);

ALTER TABLE public.clrk_subagent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own subagent runs" ON public.clrk_subagent_runs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own subagent runs" ON public.clrk_subagent_runs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own subagent runs" ON public.clrk_subagent_runs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own subagent runs" ON public.clrk_subagent_runs FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_clrk_subagent_runs_updated_at
  BEFORE UPDATE ON public.clrk_subagent_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
