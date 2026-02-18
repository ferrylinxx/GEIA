import { redirect } from 'next/navigation'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import ModernAdminPageClient from '@/components/admin/ModernAdminPageClient'
import UserActivityTracker from '@/components/activity/UserActivityTracker'

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const serviceClient = createServiceRoleClient()
  const { data: profile } = await serviceClient.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/chat')

  // Fetch stats
  const { count: userCount } = await serviceClient.from('profiles').select('*', { count: 'exact', head: true })
  const { count: convCount } = await serviceClient.from('conversations').select('*', { count: 'exact', head: true })
  const { count: msgCount } = await serviceClient.from('messages').select('*', { count: 'exact', head: true })
  const { count: fileCount } = await serviceClient.from('files').select('*', { count: 'exact', head: true })
  const { count: chunkCount } = await serviceClient.from('file_chunks').select('*', { count: 'exact', head: true })

  return (
    <>
      <UserActivityTracker />
      <ModernAdminPageClient
        currentUserId={user.id}
        stats={{ users: userCount || 0, conversations: convCount || 0, messages: msgCount || 0, files: fileCount || 0, chunks: chunkCount || 0 }}
      />
    </>
  )
}
