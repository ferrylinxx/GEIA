import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const serviceClient = createServiceRoleClient()
    const { data: profile } = await serviceClient.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: themes, error } = await serviceClient
      .from('app_themes')
      .select('*')
      .order('name')

    if (error) throw error

    return NextResponse.json({ themes: themes || [] })
  } catch (error) {
    console.error('Error fetching themes:', error)
    return NextResponse.json({ error: 'Failed to fetch themes' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const serviceClient = createServiceRoleClient()
    const { data: profile } = await serviceClient.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { name, slug, config_json } = body

    const { data: theme, error } = await serviceClient
      .from('app_themes')
      .insert({ name, slug, config_json })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ theme })
  } catch (error) {
    console.error('Error creating theme:', error)
    return NextResponse.json({ error: 'Failed to create theme' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const serviceClient = createServiceRoleClient()
    const { data: profile } = await serviceClient.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { id, is_active } = body

    // If activating a theme, deactivate all others first
    if (is_active) {
      await serviceClient
        .from('app_themes')
        .update({ is_active: false })
        .neq('id', id)
    }

    const { data: theme, error } = await serviceClient
      .from('app_themes')
      .update({ is_active, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ theme })
  } catch (error) {
    console.error('Error updating theme:', error)
    return NextResponse.json({ error: 'Failed to update theme' }, { status: 500 })
  }
}

