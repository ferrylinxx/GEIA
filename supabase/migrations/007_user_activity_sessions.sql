-- ============================================
-- USER ACTIVITY SESSIONS (multi-device presence)
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_activity_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'typing', 'read', 'offline')),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_page TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_user_activity_sessions_user ON public.user_activity_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_sessions_seen ON public.user_activity_sessions(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_sessions_status ON public.user_activity_sessions(status);

ALTER TABLE public.user_activity_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own activity sessions" ON public.user_activity_sessions;
CREATE POLICY "Users can view own activity sessions"
  ON public.user_activity_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own activity sessions" ON public.user_activity_sessions;
CREATE POLICY "Users can insert own activity sessions"
  ON public.user_activity_sessions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own activity sessions" ON public.user_activity_sessions;
CREATE POLICY "Users can update own activity sessions"
  ON public.user_activity_sessions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own activity sessions" ON public.user_activity_sessions;
CREATE POLICY "Users can delete own activity sessions"
  ON public.user_activity_sessions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Realtime support (best effort; ignore if already added).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.user_activity_sessions;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

