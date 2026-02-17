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
  const { id: projectId } = await context.params
  if (!projectId) return jsonError('project id required', 400)

  const { ok } = await ensureProjectRole(service, projectId, user.id, 'viewer')
  if (!ok) return jsonError('Forbidden', 403)

  const { data, error } = await service
    .from('project_chat_folders')
    .select('id, project_id, name, sort_order, created_by, created_at')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ folders: data || [] })
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const ctx = await getProjectApiContext()
  if (!ctx) return jsonError('Unauthorized', 401)
  const { user, service } = ctx
  const { id: projectId } = await context.params
  if (!projectId) return jsonError('project id required', 400)

  const { ok } = await ensureProjectRole(service, projectId, user.id, 'editor')
  if (!ok) return jsonError('Forbidden', 403)

  const body = await req.json().catch(() => ({}))
  const name = String(body?.name || '').trim()
  if (!name) return jsonError('name required', 400)

  const sortOrder = Number.isFinite(Number(body?.sort_order))
    ? Number(body.sort_order)
    : 0

  const { data, error } = await service
    .from('project_chat_folders')
    .insert({
      project_id: projectId,
      name,
      sort_order: sortOrder,
      created_by: user.id,
    })
    .select('id, project_id, name, sort_order, created_by, created_at')
    .single()

  if (error || !data) return jsonError(error?.message || 'No se pudo crear carpeta', 500)
  return NextResponse.json({ folder: data })
}

