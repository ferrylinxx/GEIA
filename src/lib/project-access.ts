import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export type ProjectRole = 'owner' | 'admin' | 'editor' | 'viewer'

const ROLE_WEIGHT: Record<ProjectRole, number> = {
  owner: 4,
  admin: 3,
  editor: 2,
  viewer: 1,
}

export function hasProjectRole(role: ProjectRole | null | undefined, minRole: ProjectRole): boolean {
  if (!role) return false
  return ROLE_WEIGHT[role] >= ROLE_WEIGHT[minRole]
}

export async function resolveProjectRole(
  service: SupabaseClient,
  projectId: string,
  userId: string
): Promise<ProjectRole | null> {
  if (!projectId || !userId) return null

  const { data: project } = await service
    .from('projects')
    .select('user_id')
    .eq('id', projectId)
    .single()

  if (!project?.user_id) return null
  if (project.user_id === userId) return 'owner'

  const { data: member } = await service
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()

  const rawRole = (member?.role || '').toLowerCase()
  if (rawRole === 'admin' || rawRole === 'editor' || rawRole === 'viewer') return rawRole
  return null
}

export async function requireProjectRole(
  service: SupabaseClient,
  projectId: string,
  userId: string,
  minRole: ProjectRole
): Promise<{ ok: boolean; role: ProjectRole | null }> {
  const role = await resolveProjectRole(service, projectId, userId)
  return { ok: hasProjectRole(role, minRole), role }
}

export async function listAccessibleProjectIds(
  service: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data: memberships } = await service
    .from('project_members')
    .select('project_id')
    .eq('user_id', userId)

  return Array.from(
    new Set(
      (memberships || [])
        .map((m: { project_id: string }) => m.project_id)
        .filter(Boolean)
    )
  )
}

export function generateShareToken(bytes = 20): string {
  return crypto.randomBytes(bytes).toString('hex')
}

export function hashSharePassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const digest = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${digest}`
}

export function verifySharePassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return true
  const [salt, digest] = storedHash.split(':')
  if (!salt || !digest) return false
  const incoming = crypto.scryptSync(password, salt, 64).toString('hex')
  const left = Buffer.from(digest, 'hex')
  const right = Buffer.from(incoming, 'hex')
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

export function clampShareExpiry(hours: number | null | undefined): number {
  const n = Number(hours)
  if (!Number.isFinite(n)) return 168 // 7 days
  return Math.max(1, Math.min(24 * 30, Math.floor(n)))
}
