import { NextRequest, NextResponse } from 'next/server'
import { clampShareExpiry, hashSharePassword } from '@/lib/project-access'
import { ensureProjectRole, getProjectApiContext, jsonError } from '@/lib/project-api'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; shareId: string }> }
) {
  const ctx = await getProjectApiContext()
  if (!ctx) return jsonError('Unauthorized', 401)
  const { user, service } = ctx
  const { id: projectId, shareId } = await context.params
  if (!projectId || !shareId) return jsonError('project id and share id required', 400)

  const { ok } = await ensureProjectRole(service, projectId, user.id, 'admin')
  if (!ok) return jsonError('Forbidden', 403)

  const body = await req.json().catch(() => ({}))
  const payload: Record<string, unknown> = {}

  if (typeof body?.is_active === 'boolean') payload.is_active = body.is_active
  if (typeof body?.role === 'string') {
    const role = body.role.toLowerCase()
    if (role !== 'viewer' && role !== 'editor') return jsonError('invalid role', 400)
    payload.role = role
  }
  if (body?.expires_hours != null) {
    const hours = clampShareExpiry(body.expires_hours)
    payload.expires_at = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
  }
  if (typeof body?.password === 'string') {
    const raw = body.password.trim()
    payload.password_hash = raw ? hashSharePassword(raw) : null
  }

  if (Object.keys(payload).length === 0) return jsonError('No changes provided', 400)

  const { data, error } = await service
    .from('project_shares')
    .update(payload)
    .eq('id', shareId)
    .eq('project_id', projectId)
    .select('id, share_token, role, expires_at, is_active, view_count, created_at, created_by, password_hash')
    .single()

  if (error || !data) return jsonError(error?.message || 'No se pudo actualizar enlace', 500)

  return NextResponse.json({
    share: {
      ...data,
      has_password: Boolean(data.password_hash),
      password_hash: undefined,
    },
  })
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string; shareId: string }> }
) {
  const ctx = await getProjectApiContext()
  if (!ctx) return jsonError('Unauthorized', 401)
  const { user, service } = ctx
  const { id: projectId, shareId } = await context.params
  if (!projectId || !shareId) return jsonError('project id and share id required', 400)

  const { ok } = await ensureProjectRole(service, projectId, user.id, 'admin')
  if (!ok) return jsonError('Forbidden', 403)

  const { error } = await service
    .from('project_shares')
    .delete()
    .eq('id', shareId)
    .eq('project_id', projectId)

  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ success: true })
}

