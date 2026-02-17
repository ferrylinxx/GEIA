import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { randomBytes } from 'crypto'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const service = createServiceRoleClient()
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return { user, service }
}

// POST: Start impersonation session
export async function POST(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { targetUserId } = await req.json()

    if (!targetUserId) {
      return NextResponse.json({ error: 'targetUserId required' }, { status: 400 })
    }

    // Don't allow impersonating yourself
    if (targetUserId === auth.user.id) {
      return NextResponse.json({ error: 'Cannot impersonate yourself' }, { status: 400 })
    }

    // Don't allow impersonating other admins
    const { data: targetProfile } = await auth.service
      .from('profiles')
      .select('role')
      .eq('id', targetUserId)
      .single()

    if (targetProfile?.role === 'admin') {
      return NextResponse.json({ error: 'Cannot impersonate other admins' }, { status: 403 })
    }

    // End any active impersonation sessions for this admin
    await auth.service
      .from('admin_impersonation_sessions')
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq('admin_user_id', auth.user.id)
      .eq('is_active', true)

    // Create new impersonation session
    const sessionToken = randomBytes(32).toString('hex')

    const { data: session, error } = await auth.service
      .from('admin_impersonation_sessions')
      .insert({
        admin_user_id: auth.user.id,
        target_user_id: targetUserId,
        session_token: sessionToken,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log audit action
    await auth.service.from('admin_audit_log').insert({
      admin_user_id: auth.user.id,
      target_user_id: targetUserId,
      action: 'impersonation_started',
      details: { session_id: session.id },
    })

    return NextResponse.json({ 
      success: true,
      sessionToken,
      targetUserId 
    })
  } catch (error) {
    console.error('Error starting impersonation:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: End impersonation session
export async function DELETE(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { sessionToken } = await req.json()

    if (!sessionToken) {
      return NextResponse.json({ error: 'sessionToken required' }, { status: 400 })
    }

    // Get session details before ending
    const { data: session } = await auth.service
      .from('admin_impersonation_sessions')
      .select('target_user_id')
      .eq('session_token', sessionToken)
      .eq('admin_user_id', auth.user.id)
      .eq('is_active', true)
      .single()

    // End impersonation session
    const { error } = await auth.service
      .from('admin_impersonation_sessions')
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq('session_token', sessionToken)
      .eq('admin_user_id', auth.user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log audit action
    if (session) {
      await auth.service.from('admin_audit_log').insert({
        admin_user_id: auth.user.id,
        target_user_id: session.target_user_id,
        action: 'impersonation_ended',
        details: { session_token: sessionToken },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error ending impersonation:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

