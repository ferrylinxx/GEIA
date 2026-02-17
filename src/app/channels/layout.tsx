import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import UserActivityTracker from '@/components/activity/UserActivityTracker'
import { LanguageProvider } from '@/i18n/LanguageContext'

export default async function ChannelsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  return (
    <LanguageProvider>
      <UserActivityTracker />
      {children}
    </LanguageProvider>
  )
}
