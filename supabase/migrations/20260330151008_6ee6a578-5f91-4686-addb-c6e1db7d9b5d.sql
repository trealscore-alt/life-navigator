
-- Social media connected accounts
CREATE TABLE public.social_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('twitter', 'instagram', 'linkedin')),
  account_name TEXT NOT NULL,
  account_handle TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, account_handle)
);

ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own social accounts" ON public.social_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own social accounts" ON public.social_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own social accounts" ON public.social_accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own social accounts" ON public.social_accounts FOR DELETE USING (auth.uid() = user_id);

-- Scheduled/published posts
CREATE TABLE public.scheduled_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  social_account_id UUID REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('twitter', 'instagram', 'linkedin')),
  content TEXT NOT NULL,
  media_urls TEXT[] DEFAULT '{}',
  scheduled_for TIMESTAMP WITH TIME ZONE,
  published_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'failed', 'pending_approval')),
  auto_approved BOOLEAN DEFAULT false,
  engagement_data JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own posts" ON public.scheduled_posts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own posts" ON public.scheduled_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own posts" ON public.scheduled_posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own posts" ON public.scheduled_posts FOR DELETE USING (auth.uid() = user_id);

-- Update triggers
CREATE TRIGGER update_social_accounts_updated_at BEFORE UPDATE ON public.social_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_scheduled_posts_updated_at BEFORE UPDATE ON public.scheduled_posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
