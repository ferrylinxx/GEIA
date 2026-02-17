import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get executions for user's agents
    const { data: executions, error } = await supabase
      .from('agent_executions')
      .select(`
        *,
        ai_agents!inner(user_id, name)
      `)
      .eq('ai_agents.user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[Agent Executions] Error fetching executions:', error)
      return NextResponse.json({ error: 'Failed to fetch executions' }, { status: 500 })
    }

    return NextResponse.json({ executions })
  } catch (error) {
    console.error('[Agent Executions] Error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 })
  }
}

