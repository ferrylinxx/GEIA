import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * GET /api/public/app-settings
 * Obtiene la configuración global de la aplicación (tema activo, sonido de notificaciones, etc.)
 * Público - Todos los usuarios pueden leer
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    
    const { data: settings, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['active_theme', 'notification_sound'])

    if (error) {
      console.error('[API] Error fetching app settings:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Convertir array a objeto
    const settingsObj: Record<string, any> = {}
    settings?.forEach(setting => {
      settingsObj[setting.key] = setting.value
    })

    // Valores por defecto si no existen
    if (!settingsObj.active_theme) {
      settingsObj.active_theme = { slug: 'liquid-glass', name: 'Liquid Glass' }
    }
    if (!settingsObj.notification_sound) {
      settingsObj.notification_sound = { sound_url: null, duration_seconds: 5 }
    }

    return NextResponse.json(settingsObj, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    })
  } catch (err) {
    console.error('[API] Exception fetching app settings:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

