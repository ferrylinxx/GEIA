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

// GET: List all notifications
export async function GET() {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { data: notifications, error } = await auth.service
      .from('admin_notifications')
      .select('*, sent_by_profile:sent_by(name), target_user:target_user_id(name), target_group:target_group_id(name)')
      .order('sent_at', { ascending: false })
      .limit(100)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ notifications })
  } catch (error) {
    console.error('Error fetching notifications:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Send notification
export async function POST(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { title, message, type, targetType, targetUserId, targetGroupId } = await req.json()

    if (!title || !message || !targetType) {
      return NextResponse.json({ error: 'title, message, and targetType required' }, { status: 400 })
    }

    if (targetType === 'user' && !targetUserId) {
      return NextResponse.json({ error: 'targetUserId required for user notifications' }, { status: 400 })
    }

    if (targetType === 'group' && !targetGroupId) {
      return NextResponse.json({ error: 'targetGroupId required for group notifications' }, { status: 400 })
    }

    const { data: notification, error } = await auth.service
      .from('admin_notifications')
      .insert({
        title,
        message,
        type: type || 'info',
        target_type: targetType,
        target_user_id: targetUserId || null,
        target_group_id: targetGroupId || null,
        sent_by: auth.user.id,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log audit action
    await auth.service.from('admin_audit_log').insert({
      admin_user_id: auth.user.id,
      action: 'notification_sent',
      details: {
        notification_id: notification.id,
        target_type: targetType,
        target_user_id: targetUserId,
        target_group_id: targetGroupId,
      },
    })

    return NextResponse.json({ notification })
  } catch (error) {
    console.error('Error sending notification:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Delete notification
export async function DELETE(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { notificationId } = await req.json()

    if (!notificationId) {
      return NextResponse.json({ error: 'notificationId required' }, { status: 400 })
    }

    const { error } = await auth.service
      .from('admin_notifications')
      .delete()
      .eq('id', notificationId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting notification:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

