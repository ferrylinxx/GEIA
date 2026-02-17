-- ============================================
-- CLEANUP STALE SESSIONS (Aggressive)
-- ============================================

-- Function to clean up stale sessions (>1 hour inactive)
CREATE OR REPLACE FUNCTION cleanup_stale_activity_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete sessions that haven't been seen in over 1 hour
  DELETE FROM public.user_activity_sessions
  WHERE last_seen_at < NOW() - INTERVAL '1 hour';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log cleanup
  IF deleted_count > 0 THEN
    RAISE NOTICE 'Cleaned up % stale activity sessions', deleted_count;
  END IF;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to run cleanup every 15 minutes
-- Note: This requires pg_cron extension
-- If pg_cron is not available, you can call this function manually or via a cron job

-- Uncomment if pg_cron is available:
-- SELECT cron.schedule(
--   'cleanup-stale-sessions',
--   '*/15 * * * *',
--   'SELECT cleanup_stale_activity_sessions();'
-- );

-- Alternative: Create a trigger to clean up on each ping (less efficient but works without cron)
CREATE OR REPLACE FUNCTION trigger_cleanup_stale_sessions()
RETURNS TRIGGER AS $$
BEGIN
  -- Only run cleanup 1% of the time to avoid overhead
  IF random() < 0.01 THEN
    PERFORM cleanup_stale_activity_sessions();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cleanup_on_ping ON public.user_activity_sessions;
CREATE TRIGGER trigger_cleanup_on_ping
  AFTER INSERT OR UPDATE ON public.user_activity_sessions
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_cleanup_stale_sessions();

-- Manual cleanup of existing stale sessions
SELECT cleanup_stale_activity_sessions();

