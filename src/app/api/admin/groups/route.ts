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

// GET: List all groups with member counts
export async function GET() {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { data: groups, error } = await auth.service
      .from('user_groups')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get member counts for each group
    const groupIds = (groups || []).map((g: { id: string }) => g.id)
    const { data: members } = await auth.service
      .from('user_group_members')
      .select('group_id')
      .in('group_id', groupIds.length > 0 ? groupIds : ['00000000-0000-0000-0000-000000000000'])

    const memberCounts = new Map<string, number>()
    ;(members || []).forEach((m: { group_id: string }) => {
      memberCounts.set(m.group_id, (memberCounts.get(m.group_id) || 0) + 1)
    })

    const groupsWithCounts = (groups || []).map((g: { id: string }) => ({
      ...g,
      member_count: memberCounts.get(g.id) || 0,
    }))

    return NextResponse.json({ groups: groupsWithCounts })
  } catch (error) {
    console.error('Error fetching groups:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Create new group
export async function POST(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { name, description, color } = await req.json()

    if (!name) {
      return NextResponse.json({ error: 'name required' }, { status: 400 })
    }

    const { data: group, error } = await auth.service
      .from('user_groups')
      .insert({
        name,
        description: description || null,
        color: color || '#6366f1',
        created_by: auth.user.id,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log audit action
    await auth.service.from('admin_audit_log').insert({
      admin_user_id: auth.user.id,
      action: 'group_created',
      details: { group_id: group.id, name },
    })

    return NextResponse.json({ group })
  } catch (error) {
    console.error('Error creating group:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH: Update group
export async function PATCH(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { groupId, name, description, color } = await req.json()

    if (!groupId) {
      return NextResponse.json({ error: 'groupId required' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (color !== undefined) updates.color = color

    const { error } = await auth.service
      .from('user_groups')
      .update(updates)
      .eq('id', groupId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating group:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Delete group
export async function DELETE(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { groupId } = await req.json()

    if (!groupId) {
      return NextResponse.json({ error: 'groupId required' }, { status: 400 })
    }

    const { error } = await auth.service
      .from('user_groups')
      .delete()
      .eq('id', groupId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log audit action
    await auth.service.from('admin_audit_log').insert({
      admin_user_id: auth.user.id,
      action: 'group_deleted',
      details: { group_id: groupId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting group:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

