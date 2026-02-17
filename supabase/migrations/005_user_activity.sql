-- ============================================
-- USER ACTIVITY / PRESENCE
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_activity (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'idle', 'offline')),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_page TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_activity_status ON public.user_activity(status);
CREATE INDEX IF NOT EXISTS idx_user_activity_last_seen ON public.user_activity(last_seen_at DESC);

ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own activity" ON public.user_activity;
CREATE POLICY "Users can view own activity"
  ON public.user_activity
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own activity" ON public.user_activity;
CREATE POLICY "Users can insert own activity"
  ON public.user_activity
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own activity" ON public.user_activity;
CREATE POLICY "Users can update own activity"
  ON public.user_activity
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own activity" ON public.user_activity;
CREATE POLICY "Users can delete own activity"
  ON public.user_activity
  FOR DELETE
  USING (auth.uid() = user_id);
