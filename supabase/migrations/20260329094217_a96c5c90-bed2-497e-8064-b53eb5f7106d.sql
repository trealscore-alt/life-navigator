
-- Device data logs for storing readings from Bluetooth devices
CREATE TABLE public.device_data_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  device_name TEXT,
  data_type TEXT NOT NULL,
  value NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast querying by user + type + time
CREATE INDEX idx_device_data_user_type ON public.device_data_logs (user_id, data_type, created_at DESC);

ALTER TABLE public.device_data_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own device data" ON public.device_data_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own device data" ON public.device_data_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own device data" ON public.device_data_logs FOR DELETE USING (auth.uid() = user_id);
