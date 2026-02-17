import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceRoleClient()
  const { data, error } = await service
    .from('webhook_configs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name = 'Mi webhook', webhook_type, webhook_url, enabled = true, min_messages = 10 } = body

  if (!webhook_type || !['discord', 'slack'].includes(webhook_type)) {
    return NextResponse.json({ error: 'Invalid webhook_type (discord/slack)' }, { status: 400 })
  }
  if (!webhook_url || !webhook_url.startsWith('https://')) {
    return NextResponse.json({ error: 'Invalid webhook_url' }, { status: 400 })
  }

  const service = createServiceRoleClient()
  const { data, error } = await service
    .from('webhook_configs')
    .insert({ user_id: user.id, name, webhook_type, webhook_url, enabled, min_messages })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Only allow updating certain fields
  const allowed: Record<string, unknown> = {}
  if (updates.name !== undefined) allowed.name = updates.name
  if (updates.webhook_url !== undefined) allowed.webhook_url = updates.webhook_url
  if (updates.enabled !== undefined) allowed.enabled = updates.enabled
  if (updates.min_messages !== undefined) allowed.min_messages = updates.min_messages
  allowed.updated_at = new Date().toISOString()

  const service = createServiceRoleClient()
  const { error } = await service
    .from('webhook_configs')
    .update(allowed)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const service = createServiceRoleClient()
  const { error } = await service
    .from('webhook_configs')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

