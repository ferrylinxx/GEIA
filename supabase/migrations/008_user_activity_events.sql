-- ============================================
-- USER ACTIVITY EVENTS (realtime trigger table)
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_activity_events (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sequence BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_activity_events_updated_at
  ON public.user_activity_events(updated_at DESC);

ALTER TABLE public.user_activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read activity events" ON public.user_activity_events;
CREATE POLICY "Authenticated can read activity events"
  ON public.user_activity_events
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can insert own activity events" ON public.user_activity_events;
CREATE POLICY "Users can insert own activity events"
  ON public.user_activity_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own activity events" ON public.user_activity_events;
CREATE POLICY "Users can update own activity events"
  ON public.user_activity_events
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own activity events" ON public.user_activity_events;
CREATE POLICY "Users can delete own activity events"
  ON public.user_activity_events
  FOR DELETE
  USING (auth.uid() = user_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.user_activity_events;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

