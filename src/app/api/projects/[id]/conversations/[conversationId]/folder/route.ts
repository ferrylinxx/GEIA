import { NextRequest, NextResponse } from 'next/server'
import { ensureProjectRole, getProjectApiContext, jsonError } from '@/lib/project-api'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; conversationId: string }> }
) {
  const ctx = await getProjectApiContext()
  if (!ctx) return jsonError('Unauthorized', 401)
  const { user, service } = ctx
  const { id: projectId, conversationId } = await context.params
  if (!projectId || !conversationId) return jsonError('project id and conversation id required', 400)

  const { ok } = await ensureProjectRole(service, projectId, user.id, 'editor')
  if (!ok) return jsonError('Forbidden', 403)

  const body = await req.json().catch(() => ({}))
  const folderIdRaw = body?.folder_id
  const folderId = folderIdRaw ? String(folderIdRaw) : null

  const { data: conversation } = await service
    .from('conversations')
    .select('id, project_id')
    .eq('id', conversationId)
    .single()
  if (!conversation || conversation.project_id !== projectId) {
    return jsonError('Conversation not found in this project', 404)
  }

  if (folderId) {
    const { data: folder } = await service
      .from('project_chat_folders')
      .select('id')
      .eq('id', folderId)
      .eq('project_id', projectId)
      .single()
    if (!folder) return jsonError('Folder not found', 404)
  }

  const { data, error } = await service
    .from('conversations')
    .update({ project_folder_id: folderId })
    .eq('id', conversationId)
    .eq('project_id', projectId)
    .select('id, project_id, project_folder_id')
    .single()

  if (error || !data) return jsonError(error?.message || 'No se pudo mover chat', 500)
  return NextResponse.json({ conversation: data })
}

