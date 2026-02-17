import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { CronExpressionParser } from 'cron-parser'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes

/**
 * Agent Scheduler - Executes agents based on their schedule
 * 
 * This endpoint should be called periodically (every 1-5 minutes) by:
 * - Vercel Cron (vercel.json)
 * - External cron service (cron-job.org, EasyCron, etc.)
 * - GitHub Actions scheduled workflow
 * 
 * Security: Uses CRON_SECRET to prevent unauthorized access
 */
export async function GET(req: NextRequest) {
  try {
    // Security: Verify cron secret
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.error('[AgentScheduler] Unauthorized access attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[AgentScheduler] Starting scheduled agent execution check...')
    
    const serviceClient = createServiceRoleClient()
    const now = new Date()

    // Find all active agents that are due for execution
    const { data: agents, error: fetchError } = await serviceClient
      .from('ai_agents')
      .select('*')
      .eq('is_active', true)
      .not('schedule_type', 'eq', 'manual')
      .lte('next_run_at', now.toISOString())
      .order('next_run_at', { ascending: true })
      .limit(10) // Process max 10 agents per run

    if (fetchError) {
      console.error('[AgentScheduler] Error fetching agents:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 })
    }

    if (!agents || agents.length === 0) {
      console.log('[AgentScheduler] No agents due for execution')
      return NextResponse.json({ 
        success: true, 
        message: 'No agents due for execution',
        executed: 0 
      })
    }

    console.log(`[AgentScheduler] Found ${agents.length} agents due for execution`)

    const results = []

    for (const agent of agents) {
      try {
        console.log(`[AgentScheduler] Executing agent: ${agent.name} (${agent.id})`)

        // Create execution record
        const { data: execution, error: execError } = await serviceClient
          .from('agent_executions')
          .insert({
            agent_id: agent.id,
            user_id: agent.user_id,
            status: 'running',
          })
          .select()
          .single()

        if (execError || !execution) {
          console.error(`[AgentScheduler] Failed to create execution for ${agent.name}:`, execError)
          results.push({ agent_id: agent.id, success: false, error: 'Failed to create execution' })
          continue
        }

        const startTime = Date.now()

        // Execute agent (import the function from execute route)
        const executeModule = await import('../execute/route')
        const result = await executeModule.executeAgent(agent, agent.user_id, serviceClient)

        // Update execution record
        await serviceClient
          .from('agent_executions')
          .update({
            status: 'completed',
            result: result.output,
            tools_used: result.tools_used,
            execution_time_ms: Date.now() - startTime,
            completed_at: new Date().toISOString(),
          })
          .eq('id', execution.id)

        // Calculate next run time
        const nextRunAt = calculateNextRun(agent.schedule_type, agent.schedule_config)

        // Update agent stats and next_run_at
        await serviceClient
          .from('ai_agents')
          .update({
            last_run_at: new Date().toISOString(),
            next_run_at: nextRunAt,
            run_count: agent.run_count + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', agent.id)

        console.log(`[AgentScheduler] ✅ Successfully executed ${agent.name}. Next run: ${nextRunAt}`)
        results.push({ 
          agent_id: agent.id, 
          agent_name: agent.name,
          success: true, 
          next_run_at: nextRunAt 
        })

      } catch (error) {
        console.error(`[AgentScheduler] Error executing agent ${agent.name}:`, error)
        results.push({ 
          agent_id: agent.id, 
          agent_name: agent.name,
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    console.log(`[AgentScheduler] Completed. ${successCount}/${results.length} agents executed successfully`)

    return NextResponse.json({
      success: true,
      executed: results.length,
      successful: successCount,
      failed: results.length - successCount,
      results,
    })

  } catch (error) {
    console.error('[AgentScheduler] Fatal error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 })
  }
}

function calculateNextRun(scheduleType: string, scheduleConfig: any): string | null {
  const now = new Date()

  if (scheduleType === 'interval' && scheduleConfig?.interval_minutes) {
    return new Date(now.getTime() + scheduleConfig.interval_minutes * 60 * 1000).toISOString()
  }

  if (scheduleType === 'daily' && scheduleConfig?.time) {
    const [hours, minutes] = scheduleConfig.time.split(':')
    const nextRun = new Date(now)
    nextRun.setHours(parseInt(hours), parseInt(minutes), 0, 0)
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1)
    }
    return nextRun.toISOString()
  }

  if (scheduleType === 'cron' && scheduleConfig?.cron_expression) {
    try {
      const interval = CronExpressionParser.parse(scheduleConfig.cron_expression, {
        currentDate: now,
        tz: 'Europe/Madrid' // Timezone de España
      })
      return interval.next().toDate().toISOString()
    } catch (error) {
      console.error('[AgentScheduler] Invalid cron expression:', scheduleConfig.cron_expression, error)
      return null
    }
  }

  return null
}

