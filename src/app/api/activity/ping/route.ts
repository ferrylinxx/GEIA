import { NextRequest, NextResponse } from 'next/server'
import { aggregateSessions, type ActivitySessionRow, type ActivityStatus } from '@/lib/activity'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const VALID_STATUSES = new Set<ActivityStatus>(['online', 'typing', 'read', 'offline'])

function normalizeStatus(value: unknown): ActivityStatus {
  if (typeof value !== 'string') return 'online'
  const status = value.toLowerCase() as ActivityStatus
  return VALID_STATUSES.has(status) ? status : 'online'
}

function normalizeLastPage(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.slice(0, 500) : null
}

function normalizeSessionId(value: unknown): string {
  if (typeof value !== 'string') return 'legacy'
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.slice(0, 120) : 'legacy'
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let rawBody: unknown = {}
  try {
    rawBody = await req.json()
  } catch {
    rawBody = {}
  }

  const body = typeof rawBody === 'object' && rawBody !== null
    ? rawBody as Record<string, unknown>
    : {}

  const status = normalizeStatus(body.status)
  const lastPage = normalizeLastPage(body.last_page)
  const sessionId = normalizeSessionId(body.session_id)
  const nowIso = new Date().toISOString()
  const userAgent = req.headers.get('user-agent')?.slice(0, 500) || null

  const sessionPayload: {
    user_id: string
    session_id: string
    status: ActivityStatus
    last_seen_at: string
    updated_at: string
    last_page: string | null
    user_agent: string | null
    last_activity_at?: string
  } = {
    user_id: user.id,
    session_id: sessionId,
    status,
    last_seen_at: nowIso,
    updated_at: nowIso,
    last_page: lastPage,
    user_agent: userAgent,
  }

  if (status === 'online') {
    sessionPayload.last_activity_at = nowIso
  }

  const { error: sessionError } = await supabase
    .from('user_activity_sessions')
    .upsert(sessionPayload, { onConflict: 'user_id,session_id' })

  if (sessionError) {
    console.error('[activity/ping] Error updating session status:', sessionError.message)
  }

  const nowMs = Date.now()
  let aggregateStatus: ActivityStatus = status
  let aggregateLastSeen: string | null = nowIso
  let aggregateLastActivity: string | null = status === 'online' ? nowIso : null

  if (!sessionError) {
    const staleBeforeIso = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString()
    await supabase
      .from('user_activity_sessions')
      .delete()
      .eq('user_id', user.id)
      .lt('last_seen_at', staleBeforeIso)

    const { data: sessionRows, error: sessionsLoadError } = await supabase
      .from('user_activity_sessions')
      .select('user_id, session_id, status, last_seen_at, last_activity_at')
      .eq('user_id', user.id)

    if (sessionsLoadError) {
      console.error('[activity/ping] Error loading sessions:', sessionsLoadError.message)
    } else {
      const aggregate = aggregateSessions((sessionRows || []) as ActivitySessionRow[], nowMs)
      aggregateStatus = aggregate.status
      aggregateLastSeen = aggregate.last_seen_at || nowIso
      aggregateLastActivity = aggregate.last_activity_at
    }
  }

  const { error: snapshotError } = await supabase
    .from('user_activity')
    .upsert({
      user_id: user.id,
      status: aggregateStatus,
      last_seen_at: aggregateLastSeen || nowIso,
      last_activity_at: aggregateLastActivity,
      last_page: lastPage,
      updated_at: nowIso,
    }, { onConflict: 'user_id' })

  if (snapshotError) {
    console.error('[activity/ping] Error updating global snapshot:', snapshotError.message)
    return NextResponse.json({ error: 'Failed to update activity status' }, { status: 500 })
  }

  const eventSeq = nowMs
  const { error: eventError } = await supabase
    .from('user_activity_events')
    .upsert({
      user_id: user.id,
      sequence: eventSeq,
      updated_at: nowIso,
    }, { onConflict: 'user_id' })

  if (eventError) {
    console.warn('[activity/ping] Activity event update skipped:', eventError.message)
  }

  return NextResponse.json({
    success: true,
    status: aggregateStatus,
    last_seen_at: aggregateLastSeen,
  })
}

