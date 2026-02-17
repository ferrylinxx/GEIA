import { NextRequest, NextResponse } from 'next/server'
import {
  buildMaskedActivityForViewer,
  loadActivityPrivacyMap,
  loadActivityRows,
  loadSharedContextMap,
} from '@/lib/activity-server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rawIds = req.nextUrl.searchParams.get('user_ids') || ''
  const parsedIds = rawIds
    .split(',')
    .map((id) => id.trim())
    .filter((id) => UUID_RE.test(id))

  const requestedUserIds = Array.from(new Set(parsedIds.length > 0 ? parsedIds : [user.id])).slice(0, 200)
  const service = createServiceRoleClient()
  const nowMs = Date.now()

  const [activityRows, privacyMap, sharedContextMap] = await Promise.all([
    loadActivityRows(service, requestedUserIds),
    loadActivityPrivacyMap(service, requestedUserIds),
    loadSharedContextMap(service, user.id, requestedUserIds),
  ])

  const statuses: Record<string, { status: 'online' | 'idle' | 'offline'; last_seen_at: string | null }> = {}
  for (const userId of requestedUserIds) {
    statuses[userId] = buildMaskedActivityForViewer({
      viewerUserId: user.id,
      targetUserId: userId,
      row: activityRows.get(userId),
      privacy: privacyMap.get(userId),
      hasSharedContext: sharedContextMap.get(userId) || false,
      nowMs,
    })
  }

  return NextResponse.json({ statuses })
}

