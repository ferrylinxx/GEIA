import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceRoleClient()

  // Get all channels the user is a member of with their last_read_at
  const { data: memberships, error: memErr } = await service
    .from('channel_members')
    .select('channel_id, last_read_at')
    .eq('user_id', user.id)

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })
  if (!memberships || memberships.length === 0) return NextResponse.json({ total: 0, channels: {} })

  // For each channel, count messages after last_read_at
  const unreadMap: Record<string, number> = {}
  let total = 0

  for (const mem of memberships) {
    const { count, error: cErr } = await service
      .from('channel_messages')
      .select('*', { count: 'exact', head: true })
      .eq('channel_id', mem.channel_id)
      .gt('created_at', mem.last_read_at || '1970-01-01T00:00:00Z')

    if (!cErr && count && count > 0) {
      unreadMap[mem.channel_id] = count
      total += count
    }
  }

  return NextResponse.json({ total, channels: unreadMap })
}

