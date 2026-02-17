import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

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
    // Get all files with user info
    const { data: files } = await auth.service
      .from('files')
      .select('user_id, size')

    if (!files) {
      return NextResponse.json({ total: 0, by_user: [] })
    }

    type FileRecord = { user_id: string; size: number | null }

    // Calculate total storage
    const total = (files as FileRecord[]).reduce((sum: number, f: FileRecord) => sum + (f.size || 0), 0)

    // Group by user
    const byUser = new Map<string, number>()
    ;(files as FileRecord[]).forEach((f: FileRecord) => {
      const current = byUser.get(f.user_id) || 0
      byUser.set(f.user_id, current + (f.size || 0))
    })

    // Get user names
    const userIds = Array.from(byUser.keys())
    const { data: profiles } = await auth.service
      .from('profiles')
      .select('id, name')
      .in('id', userIds)

    const nameMap = new Map((profiles || []).map((p: { id: string; name: string | null }) => [p.id, p.name]))

    // Format response
    const byUserArray = Array.from(byUser.entries())
      .map(([userId, size]) => ({
        user_id: userId,
        user_name: nameMap.get(userId) || null,
        size,
        file_count: (files as FileRecord[]).filter((f: FileRecord) => f.user_id === userId).length,
      }))
      .sort((a, b) => b.size - a.size) // Sort by size descending

    return NextResponse.json({
      total,
      by_user: byUserArray,
    })
  } catch (e) {
    console.error('Error fetching storage stats:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

