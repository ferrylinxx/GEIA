import { NextRequest, NextResponse } from 'next/server'
import {
  buildMaskedActivityForViewer,
  loadActivityPrivacyMap,
  loadActivityRows,
  loadSharedContextMap,
} from '@/lib/activity-server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

interface MemberRow {
  id: string
  channel_id: string
  user_id: string
  role: 'admin' | 'member'
  joined_at: string | null
}

interface ProfileRow {
  id: string
  name: string | null
  avatar_url: string | null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: channelId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceRoleClient()
  const { data: channel } = await service
    .from('channels')
    .select('is_public')
    .eq('id', channelId)
    .single()

  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  if (!channel.is_public) {
    const { data: isMember } = await service
      .from('channel_members')
      .select('id')
      .eq('channel_id', channelId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!isMember) return NextResponse.json({ error: 'Not a member' }, { status: 403 })
  }

  const { data: members, error } = await service
    .from('channel_members')
    .select('id, channel_id, user_id, role, joined_at')
    .eq('channel_id', channelId)
    .order('joined_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const memberRows = (members || []) as MemberRow[]
  const userIds = memberRows.map((member) => member.user_id)
  const nowMs = Date.now()

  const [{ data: profiles }, activityRows, privacyMap, sharedContextMap] = await Promise.all([
    service
      .from('profiles')
      .select('id, name, avatar_url')
      .in('id', userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000']),
    loadActivityRows(service, userIds),
    loadActivityPrivacyMap(service, userIds),
    loadSharedContextMap(service, user.id, userIds),
  ])

  const profileMap = new Map<string, ProfileRow>(((profiles || []) as ProfileRow[]).map((profile) => [profile.id, profile]))
  const enriched = memberRows.map((member) => {
    const masked = buildMaskedActivityForViewer({
      viewerUserId: user.id,
      targetUserId: member.user_id,
      row: activityRows.get(member.user_id),
      privacy: privacyMap.get(member.user_id),
      hasSharedContext: sharedContextMap.get(member.user_id) || false,
      nowMs,
    })

    return {
      ...member,
      profile: profileMap.get(member.user_id) || { name: null, avatar_url: null },
      status: masked.status,
      last_seen_at: masked.last_seen_at,
    }
  })

  return NextResponse.json(enriched)
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: channelId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceRoleClient()
  const { data: channel } = await service.from('channels').select('is_public').eq('id', channelId).single()
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })

  const { data: existing } = await service
    .from('channel_members')
    .select('id')
    .eq('channel_id', channelId)
    .eq('user_id', user.id)
    .single()
  if (existing) return NextResponse.json({ message: 'Already a member' })

  if (!channel.is_public) {
    return NextResponse.json({ error: 'Channel is private' }, { status: 403 })
  }

  const { data: member, error } = await service
    .from('channel_members')
    .insert({ channel_id: channelId, user_id: user.id, role: 'member' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(member)
}

