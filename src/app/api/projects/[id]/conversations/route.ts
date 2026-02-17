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
    .from('conversations')
    .select('*')
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ conversations: data || [] })
}

