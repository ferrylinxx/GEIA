import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

function normalizeText(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLen)
}

async function canManageChannel(service: ReturnType<typeof createServiceRoleClient>, channelId: string, userId: string) {
  const { data: channel } = await service
    .from('channels')
    .select('id, created_by')
    .eq('id', channelId)
    .single()

  if (!channel) return { allowed: false as const, channel: null }
  if (channel.created_by === userId) return { allowed: true as const, channel }

  const { data: member } = await service
    .from('channel_members')
    .select('role')
    .eq('channel_id', channelId)
    .eq('user_id', userId)
    .maybeSingle()

  const allowed = member?.role === 'admin'
  return { allowed, channel }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: channelId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceRoleClient()
  const permission = await canManageChannel(service, channelId, user.id)
  if (!permission.channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  if (!permission.allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: Record<string, unknown> = {}
  try {
    const rawBody = await req.json()
    if (rawBody && typeof rawBody === 'object') {
      body = rawBody as Record<string, unknown>
    }
  } catch {
    body = {}
  }

  const nextName = normalizeText(body.name, 50)
  const nextDescription = typeof body.description === 'string' ? body.description.trim().slice(0, 200) : null
  const nextIcon = normalizeText(body.icon, 8)

  if (body.name !== undefined && !nextName) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) updates.name = nextName
  if (body.description !== undefined) updates.description = nextDescription || ''
  if (body.icon !== undefined) updates.icon = nextIcon || '\u{1F4AC}'

  if (Object.keys(updates).length === 1) {
    const { data: current } = await service.from('channels').select('*').eq('id', channelId).single()
    return NextResponse.json(current)
  }

  const { data, error } = await service
    .from('channels')
    .update(updates)
    .eq('id', channelId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: channelId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceRoleClient()
  const permission = await canManageChannel(service, channelId, user.id)
  if (!permission.channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  if (!permission.allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error: messageError } = await service.from('channel_messages').delete().eq('channel_id', channelId)
  if (messageError) return NextResponse.json({ error: messageError.message }, { status: 500 })

  const { error: memberError } = await service.from('channel_members').delete().eq('channel_id', channelId)
  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 })

  const { error: channelError } = await service.from('channels').delete().eq('id', channelId)
  if (channelError) return NextResponse.json({ error: channelError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

