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

    const { data: settings, error } = await serviceClient
      .from('notification_settings')
      .select('*')
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') throw error

    // If no settings exist, return defaults
    if (!settings) {
      return NextResponse.json({
        settings: {
          sound_url: '/halloween.mp3',
          duration_seconds: 5,
          message_template: '🤖 GEIA • {chatTitle}',
          message_body_template: '{modelName} ha respondido:\n\n{preview}'
        }
      })
    }

    return NextResponse.json({ settings })
  } catch (error) {
    console.error('Error fetching notification settings:', error)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
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
    const { sound_url, duration_seconds, message_template, message_body_template } = body

    // Check if settings exist
    const { data: existing } = await serviceClient
      .from('notification_settings')
      .select('id')
      .limit(1)
      .single()

    let settings
    if (existing) {
      // Update existing
      const { data, error } = await serviceClient
        .from('notification_settings')
        .update({
          sound_url,
          duration_seconds,
          message_template,
          message_body_template,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) throw error
      settings = data
    } else {
      // Insert new
      const { data, error } = await serviceClient
        .from('notification_settings')
        .insert({
          sound_url,
          duration_seconds,
          message_template,
          message_body_template
        })
        .select()
        .single()

      if (error) throw error
      settings = data
    }

    return NextResponse.json({ settings })
  } catch (error) {
    console.error('Error updating notification settings:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}

