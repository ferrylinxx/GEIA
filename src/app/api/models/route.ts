import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// Cache models for 5 minutes
let cachedModels: { id: string; name: string; owned_by: string }[] | null = null
let cacheTime = 0
const CACHE_DURATION = 5 * 60 * 1000

// Friendly names for known models
const FRIENDLY_NAMES: Record<string, string> = {
  'gpt-5': 'GPT-5',
  'gpt-5-mini': 'GPT-5 Mini',
  'gpt-5-turbo': 'GPT-5 Turbo',
  'gpt-4.5-preview': 'GPT-4.5 Preview',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-4-turbo': 'GPT-4 Turbo',
  'gpt-4-turbo-preview': 'GPT-4 Turbo Preview',
  'gpt-4': 'GPT-4',
  'gpt-3.5-turbo': 'GPT-3.5 Turbo',
  'o1': 'o1',
  'o1-mini': 'o1 Mini',
  'o1-preview': 'o1 Preview',
  'o3': 'o3',
  'o3-mini': 'o3 Mini',
  'o3-pro': 'o3 Pro',
  'o4-mini': 'o4 Mini',
  'gpt-4.1': 'GPT-4.1',
  'gpt-4.1-mini': 'GPT-4.1 Mini',
  'gpt-4.1-nano': 'GPT-4.1 Nano',
  'gpt-4o-2024-11-20': 'GPT-4o (Nov 2024)',
  'gpt-4o-2024-08-06': 'GPT-4o (Aug 2024)',
  'gpt-4o-mini-2024-07-18': 'GPT-4o Mini (Jul 2024)',
}

// Models we care about (chat-capable) - include gpt-5+ for future models
const CHAT_MODEL_PREFIXES = ['gpt-5', 'gpt-4.5', 'gpt-4', 'gpt-3.5', 'o1', 'o3', 'o4']

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Return cached if fresh
  if (cachedModels && Date.now() - cacheTime < CACHE_DURATION) {
    return NextResponse.json({ models: cachedModels })
  }

  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: `OpenAI error: ${err}` }, { status: 500 })
    }

    const data = await res.json()
    const allModels: { id: string; owned_by: string }[] = data.data || []

    // Filter to chat models only
    const chatModels = allModels
      .filter(m => CHAT_MODEL_PREFIXES.some(prefix => m.id.startsWith(prefix)))
      .filter(m => !m.id.includes('realtime') && !m.id.includes('audio') && !m.id.includes('search') && !m.id.includes('instruct'))
      .map(m => ({
        id: m.id,
        name: FRIENDLY_NAMES[m.id] || m.id,
        owned_by: m.owned_by,
      }))
      .sort((a, b) => {
        // Sort: newest/best first
        const order = (id: string) => {
          if (id.startsWith('gpt-5')) return 0
          if (id.startsWith('gpt-4.5')) return 1
          if (id.startsWith('o4')) return 2
          if (id.startsWith('o3')) return 3
          if (id.startsWith('o1')) return 4
          if (id === 'gpt-4o-mini') return 6
          if (id.startsWith('gpt-4o')) return 5
          if (id.startsWith('gpt-4.1-nano')) return 9
          if (id.startsWith('gpt-4.1-mini')) return 8
          if (id.startsWith('gpt-4.1')) return 7
          if (id.startsWith('gpt-4-turbo')) return 10
          if (id.startsWith('gpt-4')) return 11
          if (id.startsWith('gpt-3.5')) return 12
          return 13
        }
        return order(a.id) - order(b.id)
      })

    // Deduplicate: keep the base name if a dated version exists
    const seen = new Set<string>()
    const deduped = chatModels.filter(m => {
      // If it's a dated version (has -20XX) and the base model exists, skip
      const dateMatch = m.id.match(/^(.+)-\d{4}-\d{2}-\d{2}$/)
      if (dateMatch) {
        const base = dateMatch[1]
        if (chatModels.some(other => other.id === base)) return false
      }
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })

    cachedModels = deduped
    cacheTime = Date.now()

    return NextResponse.json({ models: deduped })
  } catch (e) {
    console.error('Error fetching models:', e)
    return NextResponse.json({ error: 'Failed to fetch models' }, { status: 500 })
  }
}

