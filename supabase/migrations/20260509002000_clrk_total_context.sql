-- CLRK total context layer.
-- Stores permissioned history events that can be searched alongside memory,
-- conversations, tasks, devices, and subagent activity.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE public.clrk_history_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE SET NULL,

  source TEXT NOT NULL,                 -- conversation | import | web | robot | device | task | manual
  source_id TEXT,                       -- external id or local source pointer
  kind TEXT NOT NULL,                   -- note | transcript | observation | file | page | task_result | device_context
  title TEXT,
  content TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding VECTOR(1536),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clrk_history_events_user_time ON public.clrk_history_events (user_id, occurred_at DESC);
CREATE INDEX idx_clrk_history_events_user_source ON public.clrk_history_events (user_id, source, kind);
CREATE INDEX idx_clrk_history_events_content_trgm ON public.clrk_history_events USING gin (content gin_trgm_ops);
CREATE INDEX idx_clrk_history_events_embedding
  ON public.clrk_history_events USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE public.clrk_history_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own history events"   ON public.clrk_history_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own history events" ON public.clrk_history_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own history events" ON public.clrk_history_events FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own history events" ON public.clrk_history_events FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_clrk_history_events_updated_at
  BEFORE UPDATE ON public.clrk_history_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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
