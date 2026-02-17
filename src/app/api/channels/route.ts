import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceRoleClient()

  // Get channels user is a member of, plus all public channels
  const { data: memberChannels } = await service
    .from('channel_members')
    .select('channel_id')
    .eq('user_id', user.id)

  const memberIds = (memberChannels || []).map((m: { channel_id: string }) => m.channel_id)

  const { data: channels, error } = await service
    .from('channels')
    .select('*')
    .or(`is_public.eq.true,id.in.(${memberIds.length > 0 ? memberIds.join(',') : '00000000-0000-0000-0000-000000000000'})`)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get member counts
  const channelIds = (channels || []).map((c: { id: string }) => c.id)
  const { data: memberRows } = await service
    .from('channel_members')
    .select('channel_id, user_id, role')
    .in('channel_id', channelIds.length > 0 ? channelIds : ['00000000-0000-0000-0000-000000000000'])

  const countMap: Record<string, number> = {}
  const roleMap: Record<string, 'admin' | 'member'> = {}
  for (const row of (memberRows || []) as Array<{ channel_id: string; user_id: string; role: 'admin' | 'member' }>) {
    countMap[row.channel_id] = (countMap[row.channel_id] || 0) + 1
    if (row.user_id === user.id) {
      roleMap[row.channel_id] = row.role
    }
  }

  const enriched = (channels || []).map((c: { id: string; created_by?: string | null }) => ({
    ...c,
    member_count: countMap[c.id] || 0,
    is_member: memberIds.includes(c.id),
    can_manage: c.created_by === user.id || roleMap[c.id] === 'admin',
  }))

  return NextResponse.json(enriched)
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, description = '', is_public = true, icon = '💬' } = body

  if (!name || name.trim().length === 0) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const service = createServiceRoleClient()

  // Create channel
  const { data: channel, error } = await service
    .from('channels')
    .insert({ name: name.trim(), description, is_public, icon, created_by: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Add creator as admin member
  await service.from('channel_members').insert({
    channel_id: channel.id,
    user_id: user.id,
    role: 'admin',
  })

  return NextResponse.json(channel)
}
