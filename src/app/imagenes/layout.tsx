import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import ChatShell from '@/components/chat/ChatShell'

export default async function ImagenesLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Keep the same app chrome (header, sidebar, modals) on the Images page.
  return <ChatShell userId={user.id}>{children}</ChatShell>
}

