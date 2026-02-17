import {
  type ActivityAggregate,
  type ActivityPrivacySettings,
  type ActivityRow,
  type ActivityStatus,
  computeEffectiveStatus,
  maskActivityForViewer,
  parseActivityPrivacy,
} from '@/lib/activity'

const EMPTY_UUID = '00000000-0000-0000-0000-000000000000'

interface ChannelMembershipRow {
  channel_id: string
  user_id: string
}

interface ProfilePrivacyRow {
  id: string
  settings_json: unknown
}

interface SelectInQuery {
  in: (column: string, values: string[]) => Promise<{ data: unknown[] | null }>
}

interface ServiceClientLike {
  from: (table: string) => {
    select: (query: string) => SelectInQuery
  }
}

export async function loadActivityRows(service: ServiceClientLike, userIds: string[]): Promise<Map<string, ActivityRow>> {
  if (userIds.length === 0) return new Map<string, ActivityRow>()

  const { data } = await service
    .from('user_activity')
    .select('user_id, status, last_seen_at, last_activity_at')
    .in('user_id', userIds.length > 0 ? userIds : [EMPTY_UUID])

  return new Map<string, ActivityRow>(((data || []) as ActivityRow[]).map((row) => [row.user_id, row]))
}

export async function loadActivityPrivacyMap(service: ServiceClientLike, userIds: string[]): Promise<Map<string, ActivityPrivacySettings>> {
  if (userIds.length === 0) return new Map<string, ActivityPrivacySettings>()

  const { data } = await service
    .from('profiles')
    .select('id, settings_json')
    .in('id', userIds.length > 0 ? userIds : [EMPTY_UUID])

  const map = new Map<string, ActivityPrivacySettings>()
  for (const row of (data || []) as ProfilePrivacyRow[]) {
    map.set(row.id, parseActivityPrivacy(row.settings_json))
  }
  return map
}

export async function loadSharedContextMap(service: ServiceClientLike, viewerUserId: string, targetUserIds: string[]): Promise<Map<string, boolean>> {
  const targetIds = Array.from(new Set(targetUserIds.filter((id) => id !== viewerUserId)))
  const sharedMap = new Map<string, boolean>(targetIds.map((id) => [id, false]))
  if (targetIds.length === 0) return sharedMap

  const userIds = [viewerUserId, ...targetIds]
  const { data } = await service
    .from('channel_members')
    .select('channel_id, user_id')
    .in('user_id', userIds)

  const rows = (data || []) as ChannelMembershipRow[]
  if (rows.length === 0) return sharedMap

  const viewerChannelIds = new Set(rows.filter((row) => row.user_id === viewerUserId).map((row) => row.channel_id))
  if (viewerChannelIds.size === 0) return sharedMap

  for (const row of rows) {
    if (row.user_id === viewerUserId) continue
    if (viewerChannelIds.has(row.channel_id)) {
      sharedMap.set(row.user_id, true)
    }
  }

  return sharedMap
}

export function buildMaskedActivityForViewer(args: {
  viewerUserId: string
  targetUserId: string
  row: ActivityRow | undefined
  privacy: ActivityPrivacySettings | undefined
  hasSharedContext: boolean
  nowMs: number
}): { status: ActivityStatus; last_seen_at: string | null } {
  const { viewerUserId, targetUserId, row, privacy, hasSharedContext, nowMs } = args
  const aggregate: ActivityAggregate = {
    status: computeEffectiveStatus(row, nowMs),
    last_seen_at: row?.last_seen_at || null,
    last_activity_at: row?.last_activity_at || null,
  }

  return maskActivityForViewer({
    viewerUserId,
    targetUserId,
    privacy: privacy || parseActivityPrivacy(undefined),
    aggregate,
    hasSharedContext,
  })
}
