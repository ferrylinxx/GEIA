import { NextRequest, NextResponse } from 'next/server'
import { ensureProjectRole, getProjectApiContext, jsonError } from '@/lib/project-api'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const ctx = await getProjectApiContext()
  if (!ctx) return jsonError('Unauthorized', 401)
  const { user, service } = ctx
  const { id } = await context.params
  if (!id) return jsonError('project id required', 400)

  const { ok, role } = await ensureProjectRole(service, id, user.id, 'viewer')
  if (!ok) return jsonError('Forbidden', 403)

  const { data: project } = await service
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (!project) return jsonError('Project not found', 404)
  return NextResponse.json({
    project: {
      ...project,
      my_role: role,
      is_owner: project.user_id === user.id,
    },
  })
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const ctx = await getProjectApiContext()
  if (!ctx) return jsonError('Unauthorized', 401)
  const { user, service } = ctx
  const { id } = await context.params
  if (!id) return jsonError('project id required', 400)

  const { ok } = await ensureProjectRole(service, id, user.id, 'admin')
  if (!ok) return jsonError('Forbidden', 403)

  const body = await req.json().catch(() => ({}))
  const payload: Record<string, unknown> = {}
  if (typeof body?.name === 'string') payload.name = body.name.trim()
  if (typeof body?.description === 'string') payload.description = body.description.trim()
  if (typeof body?.instructions === 'string') payload.instructions = body.instructions
  payload.updated_at = new Date().toISOString()

  if (!payload.name && !Object.prototype.hasOwnProperty.call(payload, 'description') && !Object.prototype.hasOwnProperty.call(payload, 'instructions')) {
    return jsonError('No changes provided', 400)
  }

  const { data, error } = await service
    .from('projects')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()

  if (error || !data) return jsonError(error?.message || 'No se pudo actualizar', 500)
  return NextResponse.json({ project: data })
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const ctx = await getProjectApiContext()
  if (!ctx) return jsonError('Unauthorized', 401)
  const { user, service } = ctx
  const { id } = await context.params
  if (!id) return jsonError('project id required', 400)

  const { ok } = await ensureProjectRole(service, id, user.id, 'owner')
  if (!ok) return jsonError('Forbidden', 403)

  const { error } = await service.from('projects').delete().eq('id', id)
  if (error) return jsonError(error.message, 500)

  return NextResponse.json({ success: true })
}

