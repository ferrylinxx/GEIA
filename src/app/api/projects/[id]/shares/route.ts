import { NextRequest, NextResponse } from 'next/server'
import { clampShareExpiry, generateShareToken, hashSharePassword } from '@/lib/project-access'
import { ensureProjectRole, getProjectApiContext, jsonError } from '@/lib/project-api'

export const runtime = 'nodejs'
export const maxDuration = 60

function getBaseUrl(req: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
}

export async function GET(
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

  const { data, error } = await service
    .from('project_shares')
    .select('id, share_token, role, expires_at, is_active, view_count, created_at, created_by, password_hash')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) return jsonError(error.message, 500)

  const shares = (data || []).map((row: Record<string, unknown>) => ({
    ...row,
    has_password: Boolean(row.password_hash),
    password_hash: undefined,
    url: `${getBaseUrl(req)}/project-share/${row.share_token}`,
  }))

  return NextResponse.json({ shares })
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
  const role = String(body?.role || 'viewer').toLowerCase()
  if (role !== 'viewer' && role !== 'editor') return jsonError('invalid role', 400)

  const expiresHours = clampShareExpiry(body?.expires_hours)
  const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000).toISOString()
  const rawPassword = String(body?.password || '').trim()
  const passwordHash = rawPassword ? hashSharePassword(rawPassword) : null
  const token = generateShareToken(20)

  const { data, error } = await service
    .from('project_shares')
    .insert({
      project_id: projectId,
      share_token: token,
      created_by: user.id,
      role,
      password_hash: passwordHash,
      expires_at: expiresAt,
      is_active: true,
    })
    .select('id, share_token, role, expires_at, is_active, view_count, created_at, created_by, password_hash')
    .single()

  if (error || !data) return jsonError(error?.message || 'No se pudo crear enlace', 500)

  return NextResponse.json({
    share: {
      ...data,
      has_password: Boolean(passwordHash),
      password_hash: undefined,
      url: `${getBaseUrl(req)}/project-share/${data.share_token}`,
    },
  })
}

