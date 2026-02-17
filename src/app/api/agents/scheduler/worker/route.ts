import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Internal Scheduler Worker
 * 
 * This endpoint starts a background polling mechanism that calls the scheduler
 * every 2 minutes to check for agents that need to be executed.
 * 
 * This is a self-contained solution that doesn't require external cron services.
 * 
 * Usage:
 * 1. Call GET /api/agents/scheduler/worker once to start the worker
 * 2. The worker will keep running and polling every 2 minutes
 * 3. Call POST /api/agents/scheduler/worker to stop the worker
 */

let workerInterval: NodeJS.Timeout | null = null
let isRunning = false
let lastRun: Date | null = null
let runCount = 0

export async function GET(req: NextRequest) {
  if (isRunning) {
    return NextResponse.json({
      success: true,
      message: 'Worker is already running',
      status: 'running',
      last_run: lastRun,
      run_count: runCount,
    })
  }

  // Start the worker
  isRunning = true
  runCount = 0

  const runScheduler = async () => {
    if (!isRunning) return

    try {
      console.log('[SchedulerWorker] Running scheduler...')
      lastRun = new Date()
      runCount++

      const cronSecret = process.env.CRON_SECRET || 'internal-worker'
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

      const response = await fetch(`${baseUrl}/api/agents/scheduler`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${cronSecret}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        console.log(`[SchedulerWorker] ✅ Scheduler completed. Executed: ${data.executed}, Successful: ${data.successful}`)
      } else {
        console.error('[SchedulerWorker] ❌ Scheduler failed:', await response.text())
      }
    } catch (error) {
      console.error('[SchedulerWorker] Error running scheduler:', error)
    }
  }

  // Run immediately
  runScheduler()

  // Then run every 2 minutes
  workerInterval = setInterval(runScheduler, 2 * 60 * 1000)

  console.log('[SchedulerWorker] ✅ Worker started. Will run every 2 minutes.')

  return NextResponse.json({
    success: true,
    message: 'Worker started successfully',
    status: 'running',
    interval_minutes: 2,
  })
}

export async function POST(req: NextRequest) {
  if (!isRunning) {
    return NextResponse.json({
      success: true,
      message: 'Worker is not running',
      status: 'stopped',
    })
  }

  // Stop the worker
  if (workerInterval) {
    clearInterval(workerInterval)
    workerInterval = null
  }

  isRunning = false

  console.log('[SchedulerWorker] ⏹️ Worker stopped.')

  return NextResponse.json({
    success: true,
    message: 'Worker stopped successfully',
    status: 'stopped',
    total_runs: runCount,
    last_run: lastRun,
  })
}

export async function DELETE(req: NextRequest) {
  // Alias for POST (stop worker)
  return POST(req)
}

