import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { computeEffectiveStatus } from '@/lib/activity'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const service = createServiceRoleClient()
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return { user, service }
}

export async function GET() {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    // Get profiles
    const { data: profiles } = await auth.service
      .from('profiles')
      .select('id, name, role, avatar_url, created_at')
      .order('created_at', { ascending: false })

    // Get emails from auth admin API
    const { data: { users: authUsers } } = await auth.service.auth.admin.listUsers({ perPage: 1000 })
    const emailMap = new Map((authUsers || []).map((u: { id: string; email?: string }) => [u.id, u.email || '']))
    const userIds = (profiles || []).map((profile: { id: string }) => profile.id)
    const { data: activityRows } = await auth.service
      .from('user_activity')
      .select('user_id, status, last_seen_at, last_activity_at')
      .in('user_id', userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000'])
    const nowMs = Date.now()
    const typedRows = (activityRows || []) as Array<{
      user_id: string
      status: 'online' | 'idle' | 'offline'
      last_seen_at: string | null
      last_activity_at: string | null
    }>
    const activityMap = new Map(typedRows.map((row) => [row.user_id, row]))

    const usersWithEmail = (profiles || []).map((u: { id: string; name: string | null; role: string; avatar_url: string | null; created_at: string }) => ({
      ...u,
      email: emailMap.get(u.id) || '',
      activity_status: computeEffectiveStatus(activityMap.get(u.id), nowMs),
      activity_last_seen_at: activityMap.get(u.id)?.last_seen_at || null,
    }))

    return NextResponse.json({ users: usersWithEmail })
  } catch (e) {
    console.error('Error fetching users:', e)
    // Fallback: return profiles without email
    const { data: profiles } = await auth.service
      .from('profiles')
      .select('id, name, role, avatar_url, created_at')
      .order('created_at', { ascending: false })

    return NextResponse.json({
      users: (profiles || []).map((u: { id: string; name: string | null; role: string; avatar_url: string | null; created_at: string }) => ({
        ...u,
        email: '',
        activity_status: 'offline',
        activity_last_seen_at: null,
      })),
    })
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, name, role } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const updates: Record<string, string> = {}
  if (name !== undefined) updates.name = name
  if (role !== undefined) updates.role = role

  const { error } = await auth.service.from('profiles').update(updates).eq('id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  // Don't allow deleting yourself
  if (userId === auth.user.id) {
    return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 })
  }

  // Delete profile (cascades to conversations, messages, etc.)
  await auth.service.from('profiles').delete().eq('id', userId)

  // Delete auth user
  try {
    await auth.service.auth.admin.deleteUser(userId)
  } catch {
    // Profile already deleted, auth user may fail
  }

  return NextResponse.json({ success: true })
}
