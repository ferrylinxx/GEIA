import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

/**
 * PATCH /api/admin/app-settings
 * Actualiza la configuración global de la aplicación
 * Solo admins
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const serviceClient = createServiceRoleClient()
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { key, value } = body

    if (!key || !value) {
      return NextResponse.json({ error: 'Missing key or value' }, { status: 400 })
    }

    // Validar keys permitidas
    const allowedKeys = ['active_theme', 'notification_sound']
    if (!allowedKeys.includes(key)) {
      return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
    }

    // Upsert (insert or update)
    const { data, error } = await serviceClient
      .from('app_settings')
      .upsert({
        key,
        value,
        updated_by: user.id,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'key'
      })
      .select()
      .single()

    if (error) {
      console.error('[API] Error updating app settings:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[API] App setting updated: ${key}`, value)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[API] Exception updating app settings:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

