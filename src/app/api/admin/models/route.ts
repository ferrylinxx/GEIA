import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const service = createServiceRoleClient()
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return { user, service }
}

export async function GET() {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: models } = await auth.service
    .from('model_configs')
    .select('*, ai_providers(name, type)')
    .order('sort_order', { ascending: true })

  const formatted = (models || []).map((m: Record<string, unknown>) => {
    const provider = m.ai_providers as { name: string; type: string } | null
    return {
      ...m,
      provider_name: provider?.name || '',
      provider_type: provider?.type || '',
      ai_providers: undefined,
    }
  })

  return NextResponse.json({ models: formatted })
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { provider_id, model_id, display_name, description, icon_url, system_prompt, is_visible, sort_order, max_tokens, use_max_tokens, supports_streaming, supports_vision } = body

  if (!provider_id || !model_id || !display_name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data, error } = await auth.service
    .from('model_configs')
    .insert({
      provider_id, model_id, display_name,
      description: description || '',
      icon_url: icon_url || '',
      system_prompt: system_prompt || '',
      is_visible: is_visible ?? true,
      sort_order: sort_order ?? 0,
      max_tokens: max_tokens ?? 4096,
      use_max_tokens: use_max_tokens ?? false,
      supports_streaming: supports_streaming ?? true,
      supports_vision: supports_vision ?? false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ model: data })
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  updates.updated_at = new Date().toISOString()
  const { error } = await auth.service.from('model_configs').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await auth.service.from('model_configs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

