import { NextRequest, NextResponse } from 'next/server'
import { verifySharePassword } from '@/lib/project-access'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 60

function expired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false
  const ts = new Date(expiresAt).getTime()
  if (Number.isNaN(ts)) return false
  return ts < Date.now()
}

export async function GET(req: NextRequest) {
  const token = String(req.nextUrl.searchParams.get('token') || '').trim()
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const service = createServiceRoleClient()
  const { data: share } = await service
    .from('project_shares')
    .select('id, project_id, role, expires_at, is_active, password_hash, view_count')
    .eq('share_token', token)
    .single()

  if (!share || !share.is_active) return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  if (expired(share.expires_at)) return NextResponse.json({ error: 'Link expired' }, { status: 410 })

  const { data: project } = await service
    .from('projects')
    .select('id, name, description, created_at, updated_at')
    .eq('id', share.project_id)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  return NextResponse.json({
    project,
    role: share.role,
    requires_password: Boolean(share.password_hash),
    expires_at: share.expires_at,
    is_active: share.is_active,
  })
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const token = String(body?.token || '').trim()
  const password = String(body?.password || '')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const service = createServiceRoleClient()
  const { data: share } = await service
    .from('project_shares')
    .select('id, project_id, role, expires_at, is_active, password_hash, view_count')
    .eq('share_token', token)
    .single()

  if (!share || !share.is_active) return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  if (expired(share.expires_at)) return NextResponse.json({ error: 'Link expired' }, { status: 410 })

  if (!verifySharePassword(password, share.password_hash)) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 403 })
  }

  const { data: project } = await service
    .from('projects')
    .select('id, user_id, name')
    .eq('id', share.project_id)
    .single()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  let grantedRole = 'owner'
  if (project.user_id !== user.id) {
    grantedRole = (share.role || 'viewer').toLowerCase()
    await service
      .from('project_members')
      .upsert(
        {
          project_id: project.id,
          user_id: user.id,
          role: grantedRole,
          invited_by: null,
        },
        { onConflict: 'project_id,user_id' }
      )
  }

  await service
    .from('project_shares')
    .update({ view_count: Number(share.view_count || 0) + 1 })
    .eq('id', share.id)

  return NextResponse.json({
    success: true,
    project: {
      id: project.id,
      name: project.name,
    },
    role: grantedRole,
  })
}

