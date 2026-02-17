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

  const { data, error } = await auth.service.from('banners').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const {
    title,
    message = '',
    type = 'info',
    is_active = true,
    start_date = null,
    end_date = null,
    display_mode = 'banner',
    priority = 0,
    dismissible = true,
    show_once = true,
    cta_label = null,
    cta_url = null,
    image_url = null,
    accent_color = null,
  } = body

  if (!title || title.trim().length === 0) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const advancedInsert = await auth.service.from('banners')
    .insert({
      title: title.trim(),
      message,
      type,
      is_active,
      start_date,
      end_date,
      display_mode,
      priority: Number.isFinite(Number(priority)) ? Number(priority) : 0,
      dismissible: Boolean(dismissible),
      show_once: Boolean(show_once),
      cta_label: cta_label || null,
      cta_url: cta_url || null,
      image_url: image_url || null,
      accent_color: accent_color || null,
      created_by: auth.user.id,
    })
    .select().single()

  if (!advancedInsert.error) return NextResponse.json(advancedInsert.data)

  const advancedError = advancedInsert.error.message || ''
  if (!advancedError.toLowerCase().includes('column')) {
    return NextResponse.json({ error: advancedError }, { status: 500 })
  }

  // Backward-compatible fallback for old schemas without popup columns.
  const legacyInsert = await auth.service.from('banners')
    .insert({
      title: title.trim(),
      message,
      type,
      is_active,
      start_date,
      end_date,
      created_by: auth.user.id,
    })
    .select().single()

  if (legacyInsert.error) return NextResponse.json({ error: legacyInsert.error.message }, { status: 500 })
  return NextResponse.json(legacyInsert.data)
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const allowed: Record<string, unknown> = {}
  if (updates.title !== undefined) allowed.title = updates.title
  if (updates.message !== undefined) allowed.message = updates.message
  if (updates.type !== undefined) allowed.type = updates.type
  if (updates.is_active !== undefined) allowed.is_active = updates.is_active
  if (updates.start_date !== undefined) allowed.start_date = updates.start_date
  if (updates.end_date !== undefined) allowed.end_date = updates.end_date
  if (updates.display_mode !== undefined) allowed.display_mode = updates.display_mode
  if (updates.priority !== undefined) allowed.priority = Number.isFinite(Number(updates.priority)) ? Number(updates.priority) : 0
  if (updates.dismissible !== undefined) allowed.dismissible = Boolean(updates.dismissible)
  if (updates.show_once !== undefined) allowed.show_once = Boolean(updates.show_once)
  if (updates.cta_label !== undefined) allowed.cta_label = updates.cta_label || null
  if (updates.cta_url !== undefined) allowed.cta_url = updates.cta_url || null
  if (updates.image_url !== undefined) allowed.image_url = updates.image_url || null
  if (updates.accent_color !== undefined) allowed.accent_color = updates.accent_color || null
  allowed.updated_at = new Date().toISOString()

  const advancedUpdate = await auth.service.from('banners').update(allowed).eq('id', id)
  if (!advancedUpdate.error) return NextResponse.json({ success: true })

  const advancedError = advancedUpdate.error.message || ''
  if (!advancedError.toLowerCase().includes('column')) {
    return NextResponse.json({ error: advancedError }, { status: 500 })
  }

  // Backward-compatible fallback for old schemas without popup columns.
  const legacyAllowed: Record<string, unknown> = {}
  if (updates.title !== undefined) legacyAllowed.title = updates.title
  if (updates.message !== undefined) legacyAllowed.message = updates.message
  if (updates.type !== undefined) legacyAllowed.type = updates.type
  if (updates.is_active !== undefined) legacyAllowed.is_active = updates.is_active
  if (updates.start_date !== undefined) legacyAllowed.start_date = updates.start_date
  if (updates.end_date !== undefined) legacyAllowed.end_date = updates.end_date
  legacyAllowed.updated_at = new Date().toISOString()

  const legacyUpdate = await auth.service.from('banners').update(legacyAllowed).eq('id', id)
  if (legacyUpdate.error) return NextResponse.json({ error: legacyUpdate.error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await auth.service.from('banners').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
