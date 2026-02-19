import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const isAdmin = profile?.role === 'admin'

    // Get analytics data
    if (isAdmin) {
      // Admins can see all users' analytics
      const { data, error } = await supabase
        .from('analytics_dashboard')
        .select('*')
        .order('total_cost_usd', { ascending: false })

      if (error) throw error

      return NextResponse.json({ data })
    } else {
      // Regular users can only see their own analytics
      const { data, error } = await supabase
        .from('analytics_dashboard')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (error) throw error

      return NextResponse.json({ data })
    }
  } catch (error) {
    console.error('[Analytics Dashboard] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}

