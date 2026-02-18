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

// GET: Get permissions for a specific role OR for a specific resource
export async function GET(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { searchParams } = new URL(req.url)
    const roleId = searchParams.get('roleId')
    const resourceType = searchParams.get('resource_type')
    const resourceId = searchParams.get('resource_id')
    const toolId = searchParams.get('tool_id')

    // If querying by tool (special case for tools)
    if (resourceType === 'tool' && toolId) {
      const { data: permissions, error } = await auth.service
        .from('role_permissions')
        .select('*')
        .eq('resource_type', 'tool')
        .contains('meta_json', { tool_id: toolId })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ permissions: permissions || [] })
    }

    // If querying by resource (for loading permissions when editing a resource)
    if (resourceType && resourceId) {
      const { data: permissions, error } = await auth.service
        .from('role_permissions')
        .select('*')
        .eq('resource_type', resourceType)
        .eq('resource_id', resourceId)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ permissions: permissions || [] })
    }

    // If querying by role (for loading all permissions of a role)
    if (!roleId) {
      return NextResponse.json({ error: 'roleId or resource_type+resource_id required' }, { status: 400 })
    }

    const { data: permissions, error } = await auth.service
      .from('role_permissions')
      .select('*')
      .eq('role_id', roleId)
      .order('resource_type')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ permissions: permissions || [] })
  } catch (error) {
    console.error('Error fetching permissions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Save all permissions for a role (bulk update) OR add permissions for a resource
export async function POST(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { roleId, permissions } = await req.json()

    // If permissions array is provided, do bulk insert (for resource-level permissions)
    if (Array.isArray(permissions)) {
      if (permissions.length > 0) {
        const permissionsToInsert = permissions.map((p: any) => ({
          role_id: p.role_id,
          resource_type: p.resource_type,
          resource_id: p.resource_id || null,
          can_view: p.can_view || false,
          can_create: p.can_create || false,
          can_edit: p.can_edit || false,
          can_delete: p.can_delete || false,
          can_share: p.can_share || false,
          can_admin: p.can_admin || false,
          meta_json: p.meta_json || {},
        }))

        const { error: insertError } = await auth.service
          .from('role_permissions')
          .insert(permissionsToInsert)

        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 500 })
        }
      }

      // Log audit action
      await auth.service.from('admin_audit_log').insert({
        admin_user_id: auth.user.id,
        action: 'permissions_updated',
        details: { permissions_count: permissions.length },
      })

      return NextResponse.json({ success: true, count: permissions.length })
    }

    // Legacy: Role-based bulk update
    if (!roleId) {
      return NextResponse.json({ error: 'roleId or permissions array required' }, { status: 400 })
    }

    // Delete all existing permissions for this role
    await auth.service
      .from('role_permissions')
      .delete()
      .eq('role_id', roleId)

    // Log audit action
    await auth.service.from('admin_audit_log').insert({
      admin_user_id: auth.user.id,
      action: 'permissions_updated',
      details: { role_id: roleId, permissions_count: 0 },
    })

    return NextResponse.json({ success: true, count: 0 })
  } catch (error) {
    console.error('Error in POST permissions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH: Update permission
export async function PATCH(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const {
      permissionId,
      canView,
      canCreate,
      canEdit,
      canDelete,
      canShare,
      canAdmin,
    } = await req.json()

    if (!permissionId) {
      return NextResponse.json({ error: 'permissionId required' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (canView !== undefined) updates.can_view = canView
    if (canCreate !== undefined) updates.can_create = canCreate
    if (canEdit !== undefined) updates.can_edit = canEdit
    if (canDelete !== undefined) updates.can_delete = canDelete
    if (canShare !== undefined) updates.can_share = canShare
    if (canAdmin !== undefined) updates.can_admin = canAdmin

    const { error } = await auth.service
      .from('role_permissions')
      .update(updates)
      .eq('id', permissionId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating permission:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Remove permission(s)
export async function DELETE(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { permissionId, resource_type, resource_id, tool_id } = await req.json()

    // Delete by tool (special case for tools)
    if (resource_type === 'tool' && tool_id) {
      const { error } = await auth.service
        .from('role_permissions')
        .delete()
        .eq('resource_type', 'tool')
        .contains('meta_json', { tool_id })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    // Delete by resource (for bulk delete when editing a resource)
    if (resource_type && resource_id) {
      const { error } = await auth.service
        .from('role_permissions')
        .delete()
        .eq('resource_type', resource_type)
        .eq('resource_id', resource_id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    // Delete by permission ID (for single permission delete)
    if (!permissionId) {
      return NextResponse.json({ error: 'permissionId or resource_type+resource_id required' }, { status: 400 })
    }

    const { error } = await auth.service
      .from('role_permissions')
      .delete()
      .eq('id', permissionId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting permission:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

