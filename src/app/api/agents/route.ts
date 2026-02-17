import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CronExpressionParser } from 'cron-parser'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: agents, error } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[Agents] Error fetching agents:', error)
      return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 })
    }

    return NextResponse.json({ agents })
  } catch (error) {
    console.error('[Agents] Error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { name, description, goal, tools, schedule_type, schedule_config, project_id } = body

    if (!name || !goal) {
      return NextResponse.json({ error: 'Name and goal are required' }, { status: 400 })
    }

    // Calculate next_run_at based on schedule
    let next_run_at = null
    if (schedule_type === 'interval' && schedule_config?.interval_minutes) {
      const now = new Date()
      next_run_at = new Date(now.getTime() + schedule_config.interval_minutes * 60 * 1000).toISOString()
    } else if (schedule_type === 'cron' && schedule_config?.cron_expression) {
      try {
        const now = new Date()
        const interval = CronExpressionParser.parse(schedule_config.cron_expression, {
          currentDate: now,
          tz: 'Europe/Madrid'
        })
        next_run_at = interval.next().toDate().toISOString()
      } catch (error) {
        console.error('[Agents] Invalid cron expression:', schedule_config.cron_expression, error)
        next_run_at = null
      }
    } else if (schedule_type === 'daily' && schedule_config?.time) {
      const now = new Date()
      const [hours, minutes] = schedule_config.time.split(':')
      const nextRun = new Date(now)
      nextRun.setHours(parseInt(hours), parseInt(minutes), 0, 0)
      if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1)
      }
      next_run_at = nextRun.toISOString()
    }

    const { data: agent, error } = await supabase
      .from('ai_agents')
      .insert({
        user_id: user.id,
        project_id,
        name,
        description,
        goal,
        tools: tools || [],
        schedule_type,
        schedule_config,
        next_run_at,
      })
      .select()
      .single()

    if (error) {
      console.error('[Agents] Error creating agent:', error)
      return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 })
    }

    return NextResponse.json({ agent })
  } catch (error) {
    console.error('[Agents] Error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { id, schedule_type, schedule_config, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 })
    }

    // Calculate next_run_at if schedule is being updated
    let next_run_at = undefined
    if (schedule_type !== undefined) {
      if (schedule_type === 'interval' && schedule_config?.interval_minutes) {
        const now = new Date()
        next_run_at = new Date(now.getTime() + schedule_config.interval_minutes * 60 * 1000).toISOString()
      } else if (schedule_type === 'cron' && schedule_config?.cron_expression) {
        try {
          const now = new Date()
          const interval = CronExpressionParser.parse(schedule_config.cron_expression, {
            currentDate: now,
            tz: 'Europe/Madrid'
          })
          next_run_at = interval.next().toDate().toISOString()
        } catch (error) {
          console.error('[Agents] Invalid cron expression:', schedule_config.cron_expression, error)
          next_run_at = null
        }
      } else if (schedule_type === 'daily' && schedule_config?.time) {
        const now = new Date()
        const [hours, minutes] = schedule_config.time.split(':')
        const nextRun = new Date(now)
        nextRun.setHours(parseInt(hours), parseInt(minutes), 0, 0)
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1)
        }
        next_run_at = nextRun.toISOString()
      } else if (schedule_type === 'manual') {
        next_run_at = null
      }
    }

    const updateData: any = {
      ...updates,
      updated_at: new Date().toISOString()
    }

    if (schedule_type !== undefined) {
      updateData.schedule_type = schedule_type
    }
    if (schedule_config !== undefined) {
      updateData.schedule_config = schedule_config
    }
    if (next_run_at !== undefined) {
      updateData.next_run_at = next_run_at
    }

    const { data: agent, error } = await supabase
      .from('ai_agents')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('[Agents] Error updating agent:', error)
      return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 })
    }

    console.log('[Agents] Agent updated:', agent.id, 'next_run_at:', agent.next_run_at)

    return NextResponse.json({ agent })
  } catch (error) {
    console.error('[Agents] Error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('ai_agents')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('[Agents] Error deleting agent:', error)
      return NextResponse.json({ error: 'Failed to delete agent' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Agents] Error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 })
  }
}

