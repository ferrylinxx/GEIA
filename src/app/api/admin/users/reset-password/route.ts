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

async function logAuditAction(service: any, adminUserId: string, targetUserId: string, action: string, details: Record<string, unknown>) {
  await service.from('admin_audit_log').insert({
    admin_user_id: adminUserId,
    target_user_id: targetUserId,
    action,
    details,
  })
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { userId, email } = await req.json()

    if (!userId || !email) {
      return NextResponse.json({ error: 'userId and email required' }, { status: 400 })
    }

    // Send password reset email using Supabase Auth Admin API
    const { error } = await auth.service.auth.admin.generateLink({
      type: 'recovery',
      email,
    })

    if (error) {
      console.error('Error generating password reset link:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log audit action
    await logAuditAction(
      auth.service,
      auth.user.id,
      userId,
      'password_reset_sent',
      { email }
    )

    return NextResponse.json({ 
      success: true,
      message: 'Password reset email sent successfully'
    })
  } catch (error) {
    console.error('Error sending password reset:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

