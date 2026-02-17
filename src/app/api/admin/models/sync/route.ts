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

interface ProviderRow {
  id: string
  name: string
  type: string
  base_url: string
  api_key: string
}

interface RemoteModel {
  id: string
  displayName: string
  supportsVision: boolean
}

interface ProviderSyncResult {
  provider_id: string
  provider_name: string
  provider_type: string
  total: number
  synced: number
  skipped: number
  error?: string
}

const GEMINI_BASE_FALLBACK = 'https://generativelanguage.googleapis.com/v1beta'
const OPENAI_BASE_FALLBACK = 'https://api.openai.com/v1'

function normalizeBaseUrl(baseUrl: string | null | undefined, fallback: string): string {
  const normalized = (baseUrl || '').trim()
  if (!normalized) return fallback
  return normalized.replace(/\/+$/, '')
}

function toFriendlyName(modelId: string): string {
  if (FRIENDLY_NAMES[modelId]) return FRIENDLY_NAMES[modelId]
  return modelId
    .split('-')
    .map(part => {
      if (!part) return part
      if (/^\d+(\.\d+)?$/.test(part)) return part
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(' ')
}

function sortOpenAIModels(a: string, b: string): number {
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

  return order(a) - order(b)
}

function sortGeminiModels(a: string, b: string): number {
  const order = (id: string) => {
    if (id.includes('2.5-pro')) return 0
    if (id.includes('2.5-flash')) return 1
    if (id.includes('2.0-flash')) return 2
    if (id.includes('1.5-pro')) return 3
    if (id.includes('1.5-flash')) return 4
    return 10
  }

  if (order(a) !== order(b)) return order(a) - order(b)
  return a.localeCompare(b)
}

async function fetchOpenAIModels(provider: ProviderRow): Promise<RemoteModel[]> {
  const apiKey = provider.api_key || process.env.OPENAI_API_KEY || ''
  if (!apiKey) throw new Error(`Falta API key para el proveedor ${provider.name}`)

  const baseUrl = normalizeBaseUrl(provider.base_url, OPENAI_BASE_FALLBACK)
  const res = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI API (${provider.name}) devolvio ${res.status}: ${err.slice(0, 300)}`)
  }

  const data = await res.json()
  const allModels = Array.isArray(data?.data) ? data.data as Array<{ id: string }> : []

  const chatModels = allModels
    .filter(model => typeof model?.id === 'string')
    .filter(model => CHAT_MODEL_PREFIXES.some(prefix => model.id.startsWith(prefix)))
    .filter(model => !model.id.includes('realtime') && !model.id.includes('audio') && !model.id.includes('search') && !model.id.includes('instruct'))

  const seen = new Set<string>()
  const deduped = chatModels.filter(model => {
    const dateMatch = model.id.match(/^(.+)-\d{4}-\d{2}-\d{2}$/)
    if (dateMatch && chatModels.some(other => other.id === dateMatch[1])) return false
    if (seen.has(model.id)) return false
    seen.add(model.id)
    return true
  })

  return deduped
    .sort((a, b) => sortOpenAIModels(a.id, b.id))
    .map(model => ({
      id: model.id,
      displayName: FRIENDLY_NAMES[model.id] || toFriendlyName(model.id),
      supportsVision: model.id.includes('4o') || model.id.includes('4.1') || model.id.includes('5'),
    }))
}

async function fetchGeminiModels(provider: ProviderRow): Promise<RemoteModel[]> {
  const apiKey = provider.api_key || ''
  if (!apiKey) throw new Error(`Falta API key para el proveedor ${provider.name}`)

  const baseUrl = normalizeBaseUrl(provider.base_url, GEMINI_BASE_FALLBACK)
  const rawModels: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }> = []
  let nextPageToken = ''
  let guard = 0

  do {
    const url = new URL(`${baseUrl}/models`)
    url.searchParams.set('key', apiKey)
    url.searchParams.set('pageSize', '100')
    if (nextPageToken) url.searchParams.set('pageToken', nextPageToken)

    const res = await fetch(url.toString(), { headers: { 'Content-Type': 'application/json' } })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Gemini API (${provider.name}) devolvio ${res.status}: ${err.slice(0, 300)}`)
    }

    const payload = await res.json() as { models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }>; nextPageToken?: string }
    if (Array.isArray(payload.models)) rawModels.push(...payload.models)
    nextPageToken = payload.nextPageToken || ''
    guard += 1
  } while (nextPageToken && guard < 20)

  const seen = new Set<string>()
  const mapped = rawModels
    .map(model => {
      const name = typeof model.name === 'string' ? model.name : ''
      const modelId = name.replace(/^models\//, '')
      const methods = Array.isArray(model.supportedGenerationMethods) ? model.supportedGenerationMethods : []
      const hasGenerateContent = methods.includes('generateContent') || methods.includes('generateMessage')

      return {
        id: modelId,
        displayName: model.displayName || toFriendlyName(modelId),
        hasGenerateContent,
      }
    })
    .filter(model => Boolean(model.id))
    .filter(model => model.id.startsWith('gemini'))
    .filter(model => model.hasGenerateContent)
    .filter(model => !model.id.includes('embedding'))
    .filter(model => {
      if (seen.has(model.id)) return false
      seen.add(model.id)
      return true
    })
    .sort((a, b) => sortGeminiModels(a.id, b.id))
    .map(model => ({
      id: model.id,
      displayName: model.displayName,
      supportsVision: true,
    }))

  return mapped
}

async function fetchModelsForProvider(provider: ProviderRow): Promise<RemoteModel[]> {
  if (provider.type === 'openai') return fetchOpenAIModels(provider)
  if (provider.type === 'gemini') return fetchGeminiModels(provider)
  return []
}

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
    const { data: providers, error: providersError } = await auth.service
      .from('ai_providers')
      .select('id, name, type, base_url, api_key')
      .eq('is_enabled', true)
      .order('priority', { ascending: true })

    if (providersError) {
      return NextResponse.json({ error: providersError.message }, { status: 500 })
    }

    const providerRows = ((providers || []) as unknown[]) as ProviderRow[]
    const syncableProviders = providerRows.filter((provider: ProviderRow) => provider.type === 'openai' || provider.type === 'gemini')

    if (syncableProviders.length === 0) {
      return NextResponse.json(
        { error: 'No hay proveedores habilitados de tipo OpenAI o Gemini' },
        { status: 400 },
      )
    }

    const results: ProviderSyncResult[] = []
    let totalSynced = 0
    let totalModels = 0

    for (const provider of syncableProviders) {
      try {
        const remoteModels = await fetchModelsForProvider(provider)
        totalModels += remoteModels.length

        const { data: existing } = await auth.service
          .from('model_configs')
          .select('model_id')
          .eq('provider_id', provider.id)

        const existingSet = new Set((existing || []).map((row: { model_id: string }) => row.model_id))
        let syncedForProvider = 0
        let nextSortOrder = existingSet.size

        for (const model of remoteModels) {
          if (existingSet.has(model.id)) continue

          const { error: upsertError } = await auth.service.from('model_configs').upsert({
            provider_id: provider.id,
            model_id: model.id,
            display_name: model.displayName,
            description: '',
            icon_url: '',
            system_prompt: '',
            is_visible: true,
            sort_order: nextSortOrder,
            max_tokens: 4096,
            use_max_tokens: false,
            supports_streaming: true,
            supports_vision: model.supportsVision,
          }, { onConflict: 'provider_id,model_id', ignoreDuplicates: true })

          if (upsertError) {
            console.error(`[ModelSync] Error upserting ${provider.type}:${model.id}`, upsertError.message)
            continue
          }

          existingSet.add(model.id)
          syncedForProvider += 1
          nextSortOrder += 1
        }

        results.push({
          provider_id: provider.id,
          provider_name: provider.name,
          provider_type: provider.type,
          total: remoteModels.length,
          synced: syncedForProvider,
          skipped: remoteModels.length - syncedForProvider,
        })
        totalSynced += syncedForProvider
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error desconocido'
        console.error(`[ModelSync] Error syncing provider ${provider.name}`, message)
        results.push({
          provider_id: provider.id,
          provider_name: provider.name,
          provider_type: provider.type,
          total: 0,
          synced: 0,
          skipped: 0,
          error: message,
        })
      }
    }

    return NextResponse.json({
      synced: totalSynced,
      total: totalModels,
      providers: results,
    })
  } catch (e) {
    console.error('Sync error:', e)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
