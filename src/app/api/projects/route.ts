import { NextRequest, NextResponse } from 'next/server'
import { getProjectApiContext, jsonError } from '@/lib/project-api'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  const ctx = await getProjectApiContext()
  if (!ctx) return jsonError('Unauthorized', 401)
  const { user, service } = ctx

  const [{ data: owned }, { data: memberships }] = await Promise.all([
    service
      .from('projects')
      .select('*')
      .eq('user_id', user.id),
    service
      .from('project_members')
      .select('project_id, role')
      .eq('user_id', user.id),
  ])

  const roleMap = new Map<string, string>()
  for (const p of owned || []) {
    roleMap.set(p.id, 'owner')
  }
  const memberIds = Array.from(new Set((memberships || []).map((m: { project_id: string }) => m.project_id).filter(Boolean)))

  let sharedProjects: Record<string, unknown>[] = []
  if (memberIds.length > 0) {
    const { data } = await service
      .from('projects')
      .select('*')
      .in('id', memberIds)
    sharedProjects = (data || []) as Record<string, unknown>[]
    for (const member of memberships || []) {
      const projectId = member.project_id
      if (!projectId || roleMap.has(projectId)) continue
      roleMap.set(projectId, (member.role || 'viewer').toLowerCase())
    }
  }

  const merged = new Map<string, Record<string, unknown>>()
  for (const row of owned || []) merged.set(row.id, row as Record<string, unknown>)
  for (const row of sharedProjects) merged.set(String(row.id), row)

  const projects = (Array.from(merged.values()) as Record<string, unknown>[])
    .map((project) => ({
      ...project,
      my_role: roleMap.get(String(project.id)) || 'viewer',
      is_owner: String(project.user_id) === user.id,
    }))
    .sort((a, b) => {
      const aUpdated = (a as Record<string, unknown>).updated_at
      const aCreated = (a as Record<string, unknown>).created_at
      const bUpdated = (b as Record<string, unknown>).updated_at
      const bCreated = (b as Record<string, unknown>).created_at
      return new Date(String(bUpdated || bCreated || 0)).getTime() - new Date(String(aUpdated || aCreated || 0)).getTime()
    })

  return NextResponse.json({ projects })
}

export async function POST(req: NextRequest) {
  const ctx = await getProjectApiContext()
  if (!ctx) return jsonError('Unauthorized', 401)
  const { user, service } = ctx

  const body = await req.json().catch(() => ({}))
  const name = String(body?.name || '').trim()
  const description = String(body?.description || '').trim()
  if (!name) return jsonError('name required', 400)

  const { data, error } = await service
    .from('projects')
    .insert({
      user_id: user.id,
      name,
      description,
      instructions: '',
    })
    .select('*')
    .single()

  if (error || !data) {
    return jsonError(error?.message || 'No se pudo crear el proyecto', 500)
  }

  return NextResponse.json({
    project: {
      ...data,
      my_role: 'owner',
      is_owner: true,
    },
  })
}
