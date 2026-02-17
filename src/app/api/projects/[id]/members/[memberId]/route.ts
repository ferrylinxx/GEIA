import { NextRequest, NextResponse } from 'next/server'
import { ensureProjectRole, getProjectApiContext, jsonError } from '@/lib/project-api'
import { ProjectRole } from '@/lib/project-access'

const ROLES: ProjectRole[] = ['admin', 'editor', 'viewer']

export const runtime = 'nodejs'
export const maxDuration = 60

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; memberId: string }> }
) {
  const ctx = await getProjectApiContext()
  if (!ctx) return jsonError('Unauthorized', 401)
  const { user, service } = ctx
  const { id: projectId, memberId } = await context.params
  if (!projectId || !memberId) return jsonError('project id and member id required', 400)

  const access = await ensureProjectRole(service, projectId, user.id, 'admin')
  if (!access.ok) return jsonError('Forbidden', 403)

  const { data: member } = await service
    .from('project_members')
    .select('id, user_id, role')
    .eq('id', memberId)
    .eq('project_id', projectId)
    .single()
  if (!member) return jsonError('Member not found', 404)

  const body = await req.json().catch(() => ({}))
  const nextRole = String(body?.role || '').toLowerCase() as ProjectRole
  if (!ROLES.includes(nextRole)) return jsonError('invalid role', 400)

  if (access.role !== 'owner') {
    if ((member.role || '').toLowerCase() === 'admin') return jsonError('Only owner can change admins', 403)
    if (nextRole === 'admin') return jsonError('Only owner can assign admin role', 403)
  }

  const { data, error } = await service
    .from('project_members')
    .update({ role: nextRole })
    .eq('id', memberId)
    .eq('project_id', projectId)
    .select('id, user_id, role, invited_by, created_at')
    .single()

  if (error || !data) return jsonError(error?.message || 'No se pudo actualizar rol', 500)
  return NextResponse.json({ member: data })
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string; memberId: string }> }
) {
  const ctx = await getProjectApiContext()
  if (!ctx) return jsonError('Unauthorized', 401)
  const { user, service } = ctx
  const { id: projectId, memberId } = await context.params
  if (!projectId || !memberId) return jsonError('project id and member id required', 400)

  const access = await ensureProjectRole(service, projectId, user.id, 'admin')
  if (!access.ok) return jsonError('Forbidden', 403)

  const { data: member } = await service
    .from('project_members')
    .select('id, user_id, role')
    .eq('id', memberId)
    .eq('project_id', projectId)
    .single()
  if (!member) return jsonError('Member not found', 404)

  if (member.user_id === user.id && access.role !== 'owner') {
    return jsonError('No puedes eliminarte siendo admin. Debe hacerlo el owner.', 400)
  }

  if (access.role !== 'owner' && (member.role || '').toLowerCase() === 'admin') {
    return jsonError('Only owner can remove admins', 403)
  }

  const { error } = await service
    .from('project_members')
    .delete()
    .eq('id', memberId)
    .eq('project_id', projectId)

  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ success: true })
}

