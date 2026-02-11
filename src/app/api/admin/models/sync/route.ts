import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

const FRIENDLY_NAMES: Record<string, string> = {
  'gpt-5.3-codex': 'GPT-5.3 Codex', 'gpt-5.2': 'GPT-5.2', 'gpt-5.2-codex': 'GPT-5.2 Codex',
  'gpt-5.1': 'GPT-5.1', 'gpt-5': 'GPT-5', 'gpt-5-mini': 'GPT-5 Mini', 'gpt-5-turbo': 'GPT-5 Turbo',
  'gpt-4.5-preview': 'GPT-4.5 Preview', 'gpt-4.5': 'GPT-4.5',
  'gpt-4o': 'GPT-4o', 'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-4-turbo': 'GPT-4 Turbo', 'gpt-4-turbo-preview': 'GPT-4 Turbo Preview', 'gpt-4': 'GPT-4',
  'gpt-3.5-turbo': 'GPT-3.5 Turbo',
  'o1': 'o1', 'o1-mini': 'o1 Mini', 'o1-preview': 'o1 Preview',
  'o3': 'o3', 'o3-mini': 'o3 Mini', 'o3-pro': 'o3 Pro', 'o4-mini': 'o4 Mini',
  'gpt-4.1': 'GPT-4.1', 'gpt-4.1-mini': 'GPT-4.1 Mini', 'gpt-4.1-nano': 'GPT-4.1 Nano',
}

const CHAT_MODEL_PREFIXES = ['gpt-5', 'gpt-4.5', 'gpt-4', 'gpt-3.5', 'o1', 'o3', 'o4']

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const service = createServiceRoleClient()
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return { user, service }
}

export async function POST() {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    // Fetch models from OpenAI
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    })
    if (!res.ok) return NextResponse.json({ error: 'Failed to fetch from OpenAI' }, { status: 500 })

    const data = await res.json()
    const allModels: { id: string; owned_by: string }[] = data.data || []

    // Filter chat models
    const chatModels = allModels
      .filter(m => CHAT_MODEL_PREFIXES.some(prefix => m.id.startsWith(prefix)))
      .filter(m => !m.id.includes('realtime') && !m.id.includes('audio') && !m.id.includes('search') && !m.id.includes('instruct'))

    // Deduplicate: prefer base model over dated version
    const seen = new Set<string>()
    const deduped = chatModels.filter(m => {
      const dateMatch = m.id.match(/^(.+)-\d{4}-\d{2}-\d{2}$/)
      if (dateMatch && chatModels.some(other => other.id === dateMatch[1])) return false
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })

    // Sort
    const sorted = deduped.sort((a, b) => {
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

    // Get or create default OpenAI provider
    let { data: provider } = await auth.service
      .from('ai_providers')
      .select('id')
      .eq('type', 'openai')
      .limit(1)
      .single()

    if (!provider) {
      const { data: newProvider } = await auth.service
        .from('ai_providers')
        .insert({ name: 'OpenAI', type: 'openai', base_url: 'https://api.openai.com/v1', api_key: process.env.OPENAI_API_KEY || '', is_enabled: true, priority: 0 })
        .select('id')
        .single()
      provider = newProvider
    }

    if (!provider) return NextResponse.json({ error: 'Failed to get/create provider' }, { status: 500 })

    // Get existing model_configs to preserve customizations
    const { data: existing } = await auth.service.from('model_configs').select('model_id, sort_order').eq('provider_id', provider.id)
    const existingMap = new Map((existing || []).map((e: { model_id: string; sort_order: number }) => [e.model_id, e.sort_order]))

    // Upsert models
    let synced = 0
    for (let i = 0; i < sorted.length; i++) {
      const m = sorted[i]
      if (existingMap.has(m.id)) continue // Skip already configured

      await auth.service.from('model_configs').upsert({
        provider_id: provider.id,
        model_id: m.id,
        display_name: FRIENDLY_NAMES[m.id] || m.id,
        description: '',
        icon_url: '',
        system_prompt: '',
        is_visible: true,
        sort_order: existingMap.get(m.id) ?? (existing?.length || 0) + i,
        max_tokens: 4096,
        use_max_tokens: false,
        supports_streaming: true,
        supports_vision: m.id.includes('4o') || m.id.includes('4.1') || m.id.includes('5'),
      }, { onConflict: 'provider_id,model_id', ignoreDuplicates: true })
      synced++
    }

    return NextResponse.json({ synced, total: sorted.length })
  } catch (e) {
    console.error('Sync error:', e)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}

