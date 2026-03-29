
-- Trust level enum for agent connections
CREATE TYPE public.agent_trust_level AS ENUM ('trusted', 'limited', 'untrusted');

-- Agent registry: external agents that can communicate with CLRK
CREATE TABLE public.agent_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  agent_description TEXT,
  agent_endpoint TEXT,
  agent_api_key TEXT,
  trust_level agent_trust_level NOT NULL DEFAULT 'untrusted',
  allowed_actions TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_seen_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, agent_name)
);

-- Agent messages: log of all inter-agent communications
CREATE TABLE public.agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agent_registry(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT NOT NULL DEFAULT 'request',
  content JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
  clrk_response JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS for agent_registry
ALTER TABLE public.agent_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own agents" ON public.agent_registry FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own agents" ON public.agent_registry FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own agents" ON public.agent_registry FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own agents" ON public.agent_registry FOR DELETE USING (auth.uid() = user_id);

-- RLS for agent_messages
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own agent messages" ON public.agent_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own agent messages" ON public.agent_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own agent messages" ON public.agent_messages FOR UPDATE USING (auth.uid() = user_id);

-- Trigger for updated_at on agent_registry
CREATE TRIGGER update_agent_registry_updated_at
  BEFORE UPDATE ON public.agent_registry
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
