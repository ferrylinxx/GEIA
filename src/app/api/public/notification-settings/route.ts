import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    
    const { data: settings, error } = await supabase
      .from('notification_settings')
      .select('*')
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('[API] Error fetching notification settings:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // If no settings exist, return defaults
    if (!settings) {
      return NextResponse.json({
        sound_url: null,
        duration_seconds: 5,
        message_template: '🤖 GEIA • {chatTitle}',
        message_body_template: '{modelName} ha respondido:\n\n{preview}'
      })
    }

    return NextResponse.json(settings)
  } catch (error) {
    console.error('[API] Exception fetching notification settings:', error)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

