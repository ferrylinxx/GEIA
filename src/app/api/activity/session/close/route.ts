import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : ''

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
    }

    // Delete the specific session
    const { error: deleteError } = await supabase
      .from('user_activity_sessions')
      .delete()
      .eq('user_id', user.id)
      .eq('session_id', sessionId)

    if (deleteError) {
      console.error('[activity/session/close] Error deleting session:', deleteError.message)
      return NextResponse.json({ error: 'Failed to close session' }, { status: 500 })
    }

    console.log(`[activity/session/close] Closed session ${sessionId} for user ${user.id}`)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[activity/session/close] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

