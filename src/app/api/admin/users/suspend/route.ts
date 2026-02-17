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
    const { userId, suspended, suspendedUntil, suspensionReason } = await req.json()

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    // Don't allow suspending yourself
    if (userId === auth.user.id) {
      return NextResponse.json({ error: 'Cannot suspend yourself' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {
      suspended,
      suspended_until: suspendedUntil || null,
      suspension_reason: suspensionReason || null,
    }

    const { error } = await auth.service
      .from('profiles')
      .update(updates)
      .eq('id', userId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log audit action
    await logAuditAction(
      auth.service,
      auth.user.id,
      userId,
      suspended ? 'user_suspended' : 'user_unsuspended',
      {
        suspended,
        suspended_until: suspendedUntil,
        suspension_reason: suspensionReason,
      }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error suspending user:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

