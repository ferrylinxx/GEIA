import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const targetUserId = typeof body?.target_user_id === 'string' ? body.target_user_id : ''
  if (!targetUserId) return NextResponse.json({ error: 'target_user_id is required' }, { status: 400 })
  if (targetUserId === user.id) return NextResponse.json({ error: 'Invalid target user' }, { status: 400 })

  const service = createServiceRoleClient()

  const { data: targetProfile } = await service
    .from('profiles')
    .select('id, name')
    .eq('id', targetUserId)
    .single()
  if (!targetProfile) return NextResponse.json({ error: 'Target user not found' }, { status: 404 })

  // Try to find an existing private DM channel with exactly these two members.
  const { data: myMemberships } = await service
    .from('channel_members')
    .select('channel_id')
    .eq('user_id', user.id)

  const myChannelIds = (myMemberships || []).map((m: { channel_id: string }) => m.channel_id)
  if (myChannelIds.length > 0) {
    const { data: privateChannels } = await service
      .from('channels')
      .select('id, name, description, icon, is_public, created_by, created_at, updated_at')
      .in('id', myChannelIds)
      .eq('is_public', false)

    const privateIds = (privateChannels || []).map((c: { id: string }) => c.id)
    if (privateIds.length > 0) {
      const { data: members } = await service
        .from('channel_members')
        .select('channel_id, user_id')
        .in('channel_id', privateIds)

      const grouped = new Map<string, Set<string>>()
      for (const row of (members || []) as Array<{ channel_id: string; user_id: string }>) {
        if (!grouped.has(row.channel_id)) grouped.set(row.channel_id, new Set<string>())
        grouped.get(row.channel_id)!.add(row.user_id)
      }

      const existing = (privateChannels || []).find((channel: { id: string }) => {
        const users = grouped.get(channel.id)
        if (!users) return false
        return users.size === 2 && users.has(user.id) && users.has(targetUserId)
      })

      if (existing) {
        return NextResponse.json({ ...existing, member_count: 2, is_member: true })
      }
    }
  }

  // Create a new private DM channel.
  const currentProfileRes = await service
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .maybeSingle()
  const currentName = currentProfileRes.data?.name || 'Usuario'
  const targetName = targetProfile.name || 'Usuario'

  const { data: created, error: createErr } = await service
    .from('channels')
    .insert({
      name: `DM ${currentName} / ${targetName}`,
      description: `private:${[user.id, targetUserId].sort().join(':')}`,
      icon: '👤',
      is_public: false,
      created_by: user.id,
    })
    .select()
    .single()

  if (createErr || !created) {
    return NextResponse.json({ error: createErr?.message || 'Failed to create DM channel' }, { status: 500 })
  }

  await service.from('channel_members').insert([
    { channel_id: created.id, user_id: user.id, role: 'admin' },
    { channel_id: created.id, user_id: targetUserId, role: 'member' },
  ])

  return NextResponse.json({ ...created, member_count: 2, is_member: true })
}

