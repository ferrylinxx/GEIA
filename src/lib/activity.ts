export type ActivityStatus = 'online' | 'idle' | 'offline'
export type ActivityVisibility = 'everyone' | 'shared' | 'nobody'

export interface ActivityRow {
  user_id: string
  status: ActivityStatus
  last_seen_at: string | null
  last_activity_at: string | null
}

export interface ActivitySessionRow {
  user_id: string
  session_id: string
  status: ActivityStatus
  last_seen_at: string | null
  last_activity_at: string | null
}

export interface ActivityAggregate {
  status: ActivityStatus
  last_seen_at: string | null
  last_activity_at: string | null
}

export interface ActivityPrivacySettings {
  showStatus: boolean
  showLastSeen: boolean
  visibility: ActivityVisibility
}

export const OFFLINE_AFTER_MS = 5 * 60_000
export const ONLINE_STALE_MS = OFFLINE_AFTER_MS
export const IDLE_STALE_MS = 5 * 60_000

const DEFAULT_PRIVACY: ActivityPrivacySettings = {
  showStatus: true,
  showLastSeen: true,
  visibility: 'everyone',
}

export function computeEffectiveStatus(row: Pick<ActivityAggregate, 'status' | 'last_seen_at' | 'last_activity_at'> | undefined, nowMs: number): ActivityStatus {
  if (!row?.last_seen_at) return 'offline'

  const lastSeenMs = Date.parse(row.last_seen_at)
  if (!Number.isFinite(lastSeenMs)) return 'offline'
  if (nowMs - lastSeenMs > ONLINE_STALE_MS) return 'offline'

  // Never force an immediate offline state from a transient ping.
  // A user is considered offline only after the stale window passes.
  if (row.status === 'idle' || row.status === 'offline') return 'idle'

  const lastActivityMs = row.last_activity_at ? Date.parse(row.last_activity_at) : lastSeenMs
  if (!Number.isFinite(lastActivityMs)) return 'idle'
  if (nowMs - lastActivityMs > IDLE_STALE_MS) return 'idle'

  return 'online'
}

function pickLatestIso(values: Array<string | null | undefined>): string | null {
  let best: string | null = null
  let bestMs = -1

  for (const value of values) {
    if (!value) continue
    const parsed = Date.parse(value)
    if (!Number.isFinite(parsed)) continue
    if (parsed > bestMs) {
      bestMs = parsed
      best = value
    }
  }

  return best
}

export function aggregateSessions(rows: ActivitySessionRow[], nowMs: number): ActivityAggregate {
  if (!rows || rows.length === 0) {
    return { status: 'offline', last_seen_at: null, last_activity_at: null }
  }

  const latestSeen = pickLatestIso(rows.map((row) => row.last_seen_at))
  const latestActivity = pickLatestIso(rows.map((row) => row.last_activity_at || row.last_seen_at))

  const hasRecentOnline = rows.some((row) => {
    if (row.status !== 'online' || !row.last_seen_at) return false
    const parsed = Date.parse(row.last_seen_at)
    return Number.isFinite(parsed) && nowMs - parsed <= ONLINE_STALE_MS
  })

  const hasRecentIdle = rows.some((row) => {
    if (row.status !== 'idle' || !row.last_seen_at) return false
    const parsed = Date.parse(row.last_seen_at)
    return Number.isFinite(parsed) && nowMs - parsed <= ONLINE_STALE_MS
  })

  const synthesized: ActivityAggregate = {
    status: hasRecentOnline ? 'online' : hasRecentIdle ? 'idle' : 'offline',
    last_seen_at: latestSeen,
    last_activity_at: latestActivity,
  }

  return {
    ...synthesized,
    status: computeEffectiveStatus(synthesized, nowMs),
  }
}

export function aggregateSessionsByUser(rows: ActivitySessionRow[], userIds: string[], nowMs: number): Map<string, ActivityAggregate> {
  const grouped = new Map<string, ActivitySessionRow[]>()
  for (const row of rows || []) {
    if (!grouped.has(row.user_id)) grouped.set(row.user_id, [])
    grouped.get(row.user_id)!.push(row)
  }

  const map = new Map<string, ActivityAggregate>()
  for (const userId of userIds) {
    const sessions = grouped.get(userId) || []
    map.set(userId, aggregateSessions(sessions, nowMs))
  }
  return map
}

export function parseActivityPrivacy(settingsJson: unknown): ActivityPrivacySettings {
  if (!settingsJson || typeof settingsJson !== 'object') return DEFAULT_PRIVACY

  const root = settingsJson as Record<string, unknown>
  const privacy = root.activity_privacy
  if (!privacy || typeof privacy !== 'object') return DEFAULT_PRIVACY

  const p = privacy as Record<string, unknown>
  const visibilityRaw = typeof p.visibility === 'string' ? p.visibility : DEFAULT_PRIVACY.visibility
  const visibility: ActivityVisibility = visibilityRaw === 'everyone' || visibilityRaw === 'shared' || visibilityRaw === 'nobody'
    ? visibilityRaw
    : DEFAULT_PRIVACY.visibility

  return {
    showStatus: typeof p.show_status === 'boolean' ? p.show_status : DEFAULT_PRIVACY.showStatus,
    showLastSeen: typeof p.show_last_seen === 'boolean' ? p.show_last_seen : DEFAULT_PRIVACY.showLastSeen,
    visibility,
  }
}

export function maskActivityForViewer(args: {
  viewerUserId: string
  targetUserId: string
  privacy: ActivityPrivacySettings
  aggregate: ActivityAggregate
  hasSharedContext: boolean
}): { status: ActivityStatus; last_seen_at: string | null } {
  const { viewerUserId, targetUserId, privacy, aggregate, hasSharedContext } = args

  if (viewerUserId === targetUserId) {
    return { status: aggregate.status, last_seen_at: aggregate.last_seen_at }
  }

  const allowedByVisibility =
    privacy.visibility === 'everyone' ||
    (privacy.visibility === 'shared' && hasSharedContext)

  if (!privacy.showStatus || privacy.visibility === 'nobody' || !allowedByVisibility) {
    return { status: 'offline', last_seen_at: null }
  }

  if (!privacy.showLastSeen) {
    return { status: aggregate.status, last_seen_at: null }
  }

  return { status: aggregate.status, last_seen_at: aggregate.last_seen_at }
}
