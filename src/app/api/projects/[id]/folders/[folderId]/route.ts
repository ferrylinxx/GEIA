import { NextRequest, NextResponse } from 'next/server'
import { ensureProjectRole, getProjectApiContext, jsonError } from '@/lib/project-api'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; folderId: string }> }
) {
  const ctx = await getProjectApiContext()
  if (!ctx) return jsonError('Unauthorized', 401)
  const { user, service } = ctx
  const { id: projectId, folderId } = await context.params
  if (!projectId || !folderId) return jsonError('project id and folder id required', 400)

  const { ok } = await ensureProjectRole(service, projectId, user.id, 'editor')
  if (!ok) return jsonError('Forbidden', 403)

  const body = await req.json().catch(() => ({}))
  const payload: Record<string, unknown> = {}
  if (typeof body?.name === 'string' && body.name.trim()) payload.name = body.name.trim()
  if (Number.isFinite(Number(body?.sort_order))) payload.sort_order = Number(body.sort_order)
  if (Object.keys(payload).length === 0) return jsonError('No changes provided', 400)

  const { data, error } = await service
    .from('project_chat_folders')
    .update(payload)
    .eq('id', folderId)
    .eq('project_id', projectId)
    .select('id, project_id, name, sort_order, created_by, created_at')
    .single()

  if (error || !data) return jsonError(error?.message || 'No se pudo actualizar carpeta', 500)
  return NextResponse.json({ folder: data })
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string; folderId: string }> }
) {
  const ctx = await getProjectApiContext()
  if (!ctx) return jsonError('Unauthorized', 401)
  const { user, service } = ctx
  const { id: projectId, folderId } = await context.params
  if (!projectId || !folderId) return jsonError('project id and folder id required', 400)

  const { ok } = await ensureProjectRole(service, projectId, user.id, 'editor')
  if (!ok) return jsonError('Forbidden', 403)

  // Move chats to root before deleting folder.
  await service
    .from('conversations')
    .update({ project_folder_id: null })
    .eq('project_id', projectId)
    .eq('project_folder_id', folderId)

  const { error } = await service
    .from('project_chat_folders')
    .delete()
    .eq('id', folderId)
    .eq('project_id', projectId)

  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ success: true })
}

