import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * Debug endpoint to check agent status
 */
export async function GET(req: NextRequest) {
  try {
    const serviceClient = createServiceRoleClient()
    const now = new Date()

    // Get all active agents with their next_run_at
    const { data: agents, error } = await serviceClient
      .from('ai_agents')
      .select('id, name, schedule_type, schedule_config, next_run_at, last_run_at, is_active, run_count')
      .eq('is_active', true)
      .order('next_run_at', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const agentsWithStatus = agents?.map((agent: any) => {
      const nextRun = agent.next_run_at ? new Date(agent.next_run_at) : null
      const lastRun = agent.last_run_at ? new Date(agent.last_run_at) : null
      const isDue = nextRun ? nextRun <= now : false
      const minutesUntilRun = nextRun ? Math.round((nextRun.getTime() - now.getTime()) / 60000) : null

      return {
        id: agent.id,
        name: agent.name,
        schedule_type: agent.schedule_type,
        schedule_config: agent.schedule_config,
        next_run_at: agent.next_run_at,
        last_run_at: agent.last_run_at,
        run_count: agent.run_count,
        is_due: isDue,
        minutes_until_run: minutesUntilRun,
        status: isDue ? '🟢 READY TO RUN' : minutesUntilRun !== null ? `⏳ ${minutesUntilRun} min` : '⏸️ Not scheduled'
      }
    })

    return NextResponse.json({
      current_time: now.toISOString(),
      current_time_local: now.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }),
      total_active_agents: agents?.length || 0,
      agents_due_now: agentsWithStatus?.filter((a: any) => a.is_due).length || 0,
      agents: agentsWithStatus,
    })

  } catch (error) {
    console.error('[AgentDebug] Error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 })
  }
}

