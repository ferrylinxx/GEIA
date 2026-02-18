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

// GET: List all roles with user counts and permissions
export async function GET() {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { data: roles, error } = await auth.service
      .from('roles')
      .select('*')
      .order('is_system', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get user counts for each role
    const roleIds = (roles || []).map((r: { id: string }) => r.id)
    const { data: userRoles } = await auth.service
      .from('user_roles')
      .select('role_id')
      .in('role_id', roleIds.length > 0 ? roleIds : ['00000000-0000-0000-0000-000000000000'])

    const userCounts = new Map<string, number>()
    ;(userRoles || []).forEach((ur: { role_id: string }) => {
      userCounts.set(ur.role_id, (userCounts.get(ur.role_id) || 0) + 1)
    })

    // Get permission counts for each role
    const { data: permissions } = await auth.service
      .from('role_permissions')
      .select('role_id')
      .in('role_id', roleIds.length > 0 ? roleIds : ['00000000-0000-0000-0000-000000000000'])

    const permissionCounts = new Map<string, number>()
    ;(permissions || []).forEach((p: { role_id: string }) => {
      permissionCounts.set(p.role_id, (permissionCounts.get(p.role_id) || 0) + 1)
    })

    const rolesWithCounts = (roles || []).map((r: { id: string }) => ({
      ...r,
      user_count: userCounts.get(r.id) || 0,
      permission_count: permissionCounts.get(r.id) || 0,
    }))

    return NextResponse.json({ roles: rolesWithCounts })
  } catch (error) {
    console.error('Error fetching roles:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Create new role
export async function POST(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { name, description } = await req.json()

    if (!name) {
      return NextResponse.json({ error: 'name required' }, { status: 400 })
    }

    const { data: role, error } = await auth.service
      .from('roles')
      .insert({
        name,
        description: description || null,
        is_system: false,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log audit action
    await auth.service.from('admin_audit_log').insert({
      admin_user_id: auth.user.id,
      action: 'role_created',
      details: { role_id: role.id, name },
    })

    return NextResponse.json({ role })
  } catch (error) {
    console.error('Error creating role:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH: Update role
export async function PATCH(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { roleId, name, description } = await req.json()

    if (!roleId) {
      return NextResponse.json({ error: 'roleId required' }, { status: 400 })
    }

    // Check if role is system role
    const { data: role } = await auth.service
      .from('roles')
      .select('is_system')
      .eq('id', roleId)
      .single()

    if (role?.is_system) {
      return NextResponse.json({ error: 'Cannot edit system roles' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description

    const { error } = await auth.service
      .from('roles')
      .update(updates)
      .eq('id', roleId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating role:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Delete role
export async function DELETE(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { roleId } = await req.json()

    if (!roleId) {
      return NextResponse.json({ error: 'roleId required' }, { status: 400 })
    }

    // Check if role is system role
    const { data: role } = await auth.service
      .from('roles')
      .select('is_system, name')
      .eq('id', roleId)
      .single()

    if (role?.is_system) {
      return NextResponse.json({ error: 'Cannot delete system roles' }, { status: 400 })
    }

    const { error } = await auth.service
      .from('roles')
      .delete()
      .eq('id', roleId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log audit action
    await auth.service.from('admin_audit_log').insert({
      admin_user_id: auth.user.id,
      action: 'role_deleted',
      details: { role_id: roleId, name: role.name },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting role:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

