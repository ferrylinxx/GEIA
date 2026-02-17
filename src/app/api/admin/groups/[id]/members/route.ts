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

// GET: List members of a group
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id: groupId } = await context.params

    const { data: members, error } = await auth.service
      .from('user_group_members')
      .select('*, profiles:user_id(id, name, email, avatar_url)')
      .eq('group_id', groupId)
      .order('added_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ members })
  } catch (error) {
    console.error('Error fetching group members:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Add member to group
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id: groupId } = await context.params
    const { userId, role } = await req.json()

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    const { data: member, error } = await auth.service
      .from('user_group_members')
      .insert({
        group_id: groupId,
        user_id: userId,
        role: role || 'member',
        added_by: auth.user.id,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log audit action
    await auth.service.from('admin_audit_log').insert({
      admin_user_id: auth.user.id,
      target_user_id: userId,
      action: 'user_added_to_group',
      details: { group_id: groupId, role },
    })

    return NextResponse.json({ member })
  } catch (error) {
    console.error('Error adding group member:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Remove member from group
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id: groupId } = await context.params
    const { userId } = await req.json()

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    const { error } = await auth.service
      .from('user_group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log audit action
    await auth.service.from('admin_audit_log').insert({
      admin_user_id: auth.user.id,
      target_user_id: userId,
      action: 'user_removed_from_group',
      details: { group_id: groupId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing group member:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

