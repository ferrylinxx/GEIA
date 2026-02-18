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

// GET: Get roles assigned to a user
export async function GET(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    const { data: userRoles, error } = await auth.service
      .from('user_roles')
      .select(`
        *,
        role:roles(*)
      `)
      .eq('user_id', userId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ userRoles: userRoles || [] })
  } catch (error) {
    console.error('Error fetching user roles:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Assign role to user
export async function POST(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { userId, roleId } = await req.json()

    if (!userId || !roleId) {
      return NextResponse.json({ error: 'userId and roleId required' }, { status: 400 })
    }

    // Check if assignment already exists
    const { data: existing } = await auth.service
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .eq('role_id', roleId)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'Role already assigned to user' }, { status: 400 })
    }

    const { data: userRole, error } = await auth.service
      .from('user_roles')
      .insert({
        user_id: userId,
        role_id: roleId,
        assigned_by: auth.user.id,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get role name for audit log
    const { data: role } = await auth.service
      .from('roles')
      .select('name')
      .eq('id', roleId)
      .single()

    // Log audit action
    await auth.service.from('admin_audit_log').insert({
      admin_user_id: auth.user.id,
      action: 'role_assigned',
      details: { user_id: userId, role_id: roleId, role_name: role?.name },
    })

    return NextResponse.json({ userRole })
  } catch (error) {
    console.error('Error assigning role:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Remove role from user
export async function DELETE(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { userId, roleId } = await req.json()

    if (!userId || !roleId) {
      return NextResponse.json({ error: 'userId and roleId required' }, { status: 400 })
    }

    const { error } = await auth.service
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .eq('role_id', roleId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get role name for audit log
    const { data: role } = await auth.service
      .from('roles')
      .select('name')
      .eq('id', roleId)
      .single()

    // Log audit action
    await auth.service.from('admin_audit_log').insert({
      admin_user_id: auth.user.id,
      action: 'role_unassigned',
      details: { user_id: userId, role_id: roleId, role_name: role?.name },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing role:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

