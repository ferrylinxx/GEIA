import { NextResponse } from 'next/server'
import {
  buildMaskedActivityForViewer,
  loadActivityPrivacyMap,
  loadActivityRows,
  loadSharedContextMap,
} from '@/lib/activity-server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { type ActivityStatus } from '@/lib/activity'

interface DirectoryUser {
  id: string
  name: string | null
  avatar_url: string | null
  role: string | null
  status: ActivityStatus
  last_seen_at: string | null
}

interface ProfileRow {
  id: string
  name: string | null
  avatar_url: string | null
  role: string | null
}

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceRoleClient()
  const { data: profiles, error: profilesErr } = await service
    .from('profiles')
    .select('id, name, avatar_url, role')
    .neq('id', user.id)
    .order('name', { ascending: true })

  if (profilesErr) return NextResponse.json({ error: profilesErr.message }, { status: 500 })

  const profileRows = (profiles || []) as ProfileRow[]
  const userIds = profileRows.map((profile) => profile.id)
  const nowMs = Date.now()

  const [activityRows, privacyMap, sharedContextMap] = await Promise.all([
    loadActivityRows(service, userIds),
    loadActivityPrivacyMap(service, userIds),
    loadSharedContextMap(service, user.id, userIds),
  ])

  const priority: Record<ActivityStatus, number> = { online: 0, typing: 1, read: 2, offline: 3 }
  const users: DirectoryUser[] = profileRows.map((profile) => {
    const masked = buildMaskedActivityForViewer({
      viewerUserId: user.id,
      targetUserId: profile.id,
      row: activityRows.get(profile.id),
      privacy: privacyMap.get(profile.id),
      hasSharedContext: sharedContextMap.get(profile.id) || false,
      nowMs,
    })

    return {
      id: profile.id,
      name: profile.name,
      avatar_url: profile.avatar_url,
      role: profile.role,
      status: masked.status,
      last_seen_at: masked.last_seen_at,
    }
  })

  users.sort((a: DirectoryUser, b: DirectoryUser) => {
    if (priority[a.status] !== priority[b.status]) return priority[a.status] - priority[b.status]
    return (a.name || '').localeCompare(b.name || '')
  })

  return NextResponse.json(users)
}

