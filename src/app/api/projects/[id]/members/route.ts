import { NextRequest, NextResponse } from 'next/server'
import { ensureProjectRole, getProjectApiContext, jsonError } from '@/lib/project-api'
import { ProjectRole } from '@/lib/project-access'

const EDITABLE_ROLES: ProjectRole[] = ['admin', 'editor', 'viewer']

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

  const { data: project } = await service
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .single()
  if (!project) return jsonError('Project not found', 404)

  const { data: ownerProfile } = await service
    .from('profiles')
    .select('id, name, avatar_url')
    .eq('id', project.user_id)
    .maybeSingle()

  const { data: memberRows } = await service
    .from('project_members')
    .select('id, user_id, role, invited_by, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  const memberUserIds = Array.from(new Set((memberRows || []).map((row: { user_id: string }) => row.user_id).filter(Boolean)))
  const { data: profiles } = memberUserIds.length > 0
    ? await service.from('profiles').select('id, name, avatar_url').in('id', memberUserIds)
    : { data: [] as Array<{ id: string; name: string | null; avatar_url: string | null }> }
  const profileMap = new Map((profiles || []).map((p: { id: string; name: string | null; avatar_url: string | null }) => [p.id, p]))

  const owner = {
    id: `owner-${project.user_id}`,
    user_id: project.user_id,
    role: 'owner' as const,
    created_at: null,
    invited_by: null,
    profile: ownerProfile || profileMap.get(project.user_id) || null,
    is_owner: true,
  }

  const members = (memberRows || [])
    .filter((row: { user_id: string }) => row.user_id !== project.user_id)
    .map((row: { id: string; user_id: string; role: string; invited_by: string | null; created_at: string }) => ({
      ...row,
      role: (row.role || 'viewer').toLowerCase(),
      profile: profileMap.get(row.user_id) || null,
      is_owner: false,
    }))

  return NextResponse.json({ members: [owner, ...members] })
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

  const { ok } = await ensureProjectRole(service, projectId, user.id, 'admin')
  if (!ok) return jsonError('Forbidden', 403)

  const body = await req.json().catch(() => ({}))
  const userId = String(body?.user_id || '').trim()
  const role = String(body?.role || 'viewer').toLowerCase() as ProjectRole

  if (!userId) return jsonError('user_id required', 400)
  if (!EDITABLE_ROLES.includes(role)) return jsonError('invalid role', 400)

  const { data: project } = await service
    .from('projects')
    .select('user_id')
    .eq('id', projectId)
    .single()
  if (!project) return jsonError('Project not found', 404)
  if (project.user_id === userId) return jsonError('Owner already has full access', 400)

  const { data, error } = await service
    .from('project_members')
    .upsert(
      {
        project_id: projectId,
        user_id: userId,
        role,
        invited_by: user.id,
      },
      { onConflict: 'project_id,user_id' }
    )
    .select('id, user_id, role, invited_by, created_at')
    .single()

  if (error || !data) return jsonError(error?.message || 'No se pudo anadir miembro', 500)
  return NextResponse.json({ member: data })
}

