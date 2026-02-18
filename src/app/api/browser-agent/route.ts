import { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { BrowserAgent } from '@/lib/browser-agent'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { query, action = 'search' } = await req.json()

  if (!query) {
    return new Response('Missing query', { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const agent = new BrowserAgent((type, message, data, url, progress, screenshot) => {
        try {
          const event = {
            type: 'browser_event',
            data: { type, message, data, url, progress, screenshot, timestamp: Date.now() }
          }
          console.log('[BrowserAgent API] Sending event:', type, message)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch (err) {
          console.error('[BrowserAgent] Failed to send event:', err)
        }
      })

      try {
        await agent.initialize()

        if (action === 'search') {
          const result = await agent.searchGoogle(query)
          
          // Enviar resultado final
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'browser_result',
            data: result
          })}\n\n`))
        } else if (action === 'visit') {
          const result = await agent.visitPage(query)
          
          // Enviar resultado final
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'browser_result',
            data: result
          })}\n\n`))
        }

        await agent.close()
        
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'done'
        })}\n\n`))
        
        controller.close()
      } catch (error) {
        console.error('[BrowserAgent] Error:', error)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'error',
          error: String(error)
        })}\n\n`))
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

