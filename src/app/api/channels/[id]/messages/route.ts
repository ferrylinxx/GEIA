import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import {
  buildMaskedActivityForViewer,
  loadActivityPrivacyMap,
  loadActivityRows,
  loadSharedContextMap,
} from '@/lib/activity-server'
import { MODELS } from '@/lib/types'

interface ProfileRow {
  id: string
  name: string | null
  avatar_url: string | null
  role: 'user' | 'admin' | null
  created_at: string | null
  bio: string | null
  gender: string | null
  birth_date: string | null
  settings_json: unknown
}

interface ChannelMemberRow {
  user_id: string
  role: 'admin' | 'member'
  joined_at: string | null
}

interface VisibleModelRow {
  model_id: string
  display_name: string
  system_prompt: string | null
  use_max_tokens: boolean | null
  max_tokens: number | null
  ai_providers: {
    type: string
    base_url: string
    api_key: string
  } | null
}

interface ResolvedModel {
  id: string
  name: string
  systemPrompt: string
  useMaxTokens: boolean
  maxTokens: number
  providerType: string
  providerBaseUrl: string
  providerApiKey: string
}

function extractMentionTokens(content: string): string[] {
  return Array.from(content.matchAll(/@([A-Za-z0-9._-]+)/g))
    .map((m) => m[1]?.toLowerCase())
    .filter((token): token is string => Boolean(token))
}

async function resolveMentionedModel(service: ReturnType<typeof createServiceRoleClient>, content: string): Promise<ResolvedModel | null> {
  const mentionTokens = extractMentionTokens(content)
  if (mentionTokens.length === 0) return null

  const { data: dynamicRows } = await service
    .from('model_configs')
    .select('model_id, display_name, system_prompt, use_max_tokens, max_tokens, ai_providers(type, base_url, api_key)')
    .eq('is_visible', true)

  const dynamicModels: ResolvedModel[] = ((dynamicRows || []) as VisibleModelRow[]).map((row) => ({
    id: row.model_id,
    name: row.display_name || row.model_id,
    systemPrompt: row.system_prompt || '',
    useMaxTokens: row.use_max_tokens === true,
    maxTokens: row.max_tokens || 1200,
    providerType: row.ai_providers?.type || 'openai',
    providerBaseUrl: row.ai_providers?.base_url || '',
    providerApiKey: row.ai_providers?.api_key || '',
  }))

  const normalizedName = (value: string) => value.toLowerCase().replace(/\s+/g, '-')

  for (const token of mentionTokens) {
    const found = dynamicModels.find((model) =>
      model.id.toLowerCase() === token || normalizedName(model.name) === token
    )
    if (found) return found
  }

  for (const token of mentionTokens) {
    const fallback = MODELS.find((model) => model.id.toLowerCase() === token)
    if (fallback) {
      return {
        id: fallback.id,
        name: fallback.name,
        systemPrompt: '',
        useMaxTokens: true,
        maxTokens: fallback.maxTokens || 1200,
        providerType: 'openai',
        providerBaseUrl: 'https://api.openai.com/v1',
        providerApiKey: process.env.OPENAI_API_KEY || '',
      }
    }
  }

  return null
}

async function generateChannelModelReply(args: {
  service: ReturnType<typeof createServiceRoleClient>
  channelId: string
  channelName: string
  requestingUserId: string
  originalInput: string
  model: ResolvedModel
}): Promise<string> {
  const { service, channelId, channelName, requestingUserId, originalInput, model } = args
  const { data: rows } = await service
    .from('channel_messages')
    .select('role, content, user_id, created_at')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(25)

  const historyRows = (rows || []).slice().reverse() as Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
    user_id: string
    created_at: string
  }>

  const userIds = [...new Set(historyRows.map((row) => row.user_id))]
  const { data: profiles } = await service
    .from('profiles')
    .select('id, name')
    .in('id', userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000'])

  const nameMap = new Map<string, string>((profiles || []).map((p: { id: string; name: string | null }) => [p.id, p.name || 'Usuario']))

  const cleanInput = originalInput.replace(/@([A-Za-z0-9._-]+)/g, (full, token: string) => {
    return token.toLowerCase() === model.id.toLowerCase() ? '' : full
  }).trim()
  const effectiveInput = cleanInput || originalInput.trim()

  const historyMessages = historyRows.map((row) => {
    if (row.role === 'assistant') {
      return { role: 'assistant', content: row.content }
    }
    const author = nameMap.get(row.user_id) || 'Usuario'
    return { role: 'user', content: `${author}: ${row.content}` }
  })

  if (historyMessages.length > 0 && historyMessages[historyMessages.length - 1].role === 'user') {
    const requester = nameMap.get(requestingUserId) || 'Usuario'
    historyMessages[historyMessages.length - 1] = {
      role: 'user',
      content: `${requester}: ${effectiveInput}`,
    }
  }

  let systemPrompt = `Eres un asistente de IA participando en el canal #${channelName}. Responde de forma clara, breve y útil. Mantén el idioma del usuario. Si te mencionan con @, responde al último mensaje relevante del canal.`
  if (model.systemPrompt) {
    systemPrompt = `${model.systemPrompt}\n\n${systemPrompt}`
  }

  let apiUrl = model.providerBaseUrl
    ? `${model.providerBaseUrl.replace(/\/$/, '')}/chat/completions`
    : 'https://api.openai.com/v1/chat/completions'
  let headers: Record<string, string> = { 'Content-Type': 'application/json' }
  let responseText = ''

  if (model.providerType === 'anthropic') {
    apiUrl = 'https://api.anthropic.com/v1/messages'
    headers = {
      'Content-Type': 'application/json',
      'x-api-key': model.providerApiKey,
      'anthropic-version': '2023-06-01',
    }

    const anthropicMessages = historyMessages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
    const anthropicRes = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model.id,
        system: systemPrompt,
        messages: anthropicMessages,
        max_tokens: model.useMaxTokens ? model.maxTokens : 1200,
      }),
    })
    if (!anthropicRes.ok) throw new Error(`Anthropic error: ${await anthropicRes.text()}`)
    const anthropicData = await anthropicRes.json() as { content?: Array<{ type?: string; text?: string }> }
    responseText = anthropicData.content?.find((part) => part.type === 'text')?.text?.trim() || ''
  } else {
    if (model.providerType === 'gemini') {
      apiUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
    }
    headers.Authorization = `Bearer ${model.providerApiKey || process.env.OPENAI_API_KEY || ''}`

    const openAiRes = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model.id,
        messages: [{ role: 'system', content: systemPrompt }, ...historyMessages],
        temperature: 0.6,
        ...(model.useMaxTokens ? { max_tokens: model.maxTokens } : {}),
      }),
    })
    if (!openAiRes.ok) throw new Error(`Model error: ${await openAiRes.text()}`)
    const openAiData = await openAiRes.json() as { choices?: Array<{ message?: { content?: string } }> }
    responseText = openAiData.choices?.[0]?.message?.content?.trim() || ''
  }

  return responseText
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: channelId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceRoleClient()

  // Verify membership or public channel
  const { data: channel } = await service.from('channels').select('is_public').eq('id', channelId).single()
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })

  if (!channel.is_public) {
    const { data: member } = await service.from('channel_members')
      .select('id').eq('channel_id', channelId).eq('user_id', user.id).single()
    if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 })
  }

  // Get messages with user profiles
  const { data: messages, error } = await service
    .from('channel_messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich messages with profile data and privacy-aware activity state for each author.
  const userIds = Array.from(new Set<string>(((messages || []) as Array<{ user_id: string }>).map((m) => m.user_id)))
  const lookupIds = userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000']

  const [{ data: profiles }, { data: channelMembers }, activityMap, privacyMap, sharedContextMap] = await Promise.all([
    service
      .from('profiles')
      .select('id, name, avatar_url, role, created_at, bio, gender, birth_date, settings_json')
      .in('id', lookupIds),
    service
      .from('channel_members')
      .select('user_id, role, joined_at')
      .eq('channel_id', channelId)
      .in('user_id', lookupIds),
    loadActivityRows(service, userIds),
    loadActivityPrivacyMap(service, userIds),
    loadSharedContextMap(service, user.id, userIds),
  ])

  const profileMap = new Map<string, ProfileRow>((profiles || []).map((p: ProfileRow) => [p.id, p]))
  const channelMemberMap = new Map<string, ChannelMemberRow>((channelMembers || []).map((m: ChannelMemberRow) => [m.user_id, m]))
  const nowMs = Date.now()

  const enriched = (messages || []).map((m: { user_id: string } & Record<string, unknown>) => {
    const profile = profileMap.get(m.user_id)
    const activity = activityMap.get(m.user_id)
    const channelMemberMeta = channelMemberMap.get(m.user_id)
    const rawContent = typeof m.content === 'string' ? m.content : ''
    const modelNameMatch = rawContent.match(/^\*\*([^*]+)\*\*/)
    const assistantModelName = m.role === 'assistant' && modelNameMatch ? modelNameMatch[1].trim() : null
    const masked = buildMaskedActivityForViewer({
      viewerUserId: user.id,
      targetUserId: m.user_id,
      row: activity,
      privacy: privacyMap.get(m.user_id),
      hasSharedContext: sharedContextMap.get(m.user_id) || false,
      nowMs,
    })

    return {
      ...m,
      user_name: assistantModelName || profile?.name || 'Usuario',
      user_avatar: assistantModelName ? null : profile?.avatar_url || null,
      user_status: masked.status,
      user_last_seen_at: masked.last_seen_at,
      user_role: profile?.role || null,
      user_created_at: profile?.created_at || null,
      user_bio: profile?.bio || null,
      user_gender: profile?.gender || null,
      user_birth_date: profile?.birth_date || null,
      channel_role: channelMemberMeta?.role || null,
      channel_joined_at: channelMemberMeta?.joined_at || null,
    }
  })

  // Update last_read_at for this user in this channel.
  await service
    .from('channel_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('channel_id', channelId)
    .eq('user_id', user.id)

  return NextResponse.json(enriched)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: channelId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { content, role = 'user' } = body

  if (!content || content.trim().length === 0) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 })
  }

  const service = createServiceRoleClient()

  // Verify membership (auto-join public channels)
  const { data: channel } = await service.from('channels').select('is_public').eq('id', channelId).single()
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })

  const { data: member } = await service.from('channel_members')
    .select('id').eq('channel_id', channelId).eq('user_id', user.id).single()

  if (!member) {
    if (channel.is_public) {
      // Auto-join public channel
      await service.from('channel_members').insert({ channel_id: channelId, user_id: user.id, role: 'member' })
    } else {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 })
    }
  }

  // Insert message
  const { data: message, error } = await service
    .from('channel_messages')
    .insert({ channel_id: channelId, user_id: user.id, content: content.trim(), role })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update channel updated_at
  await service
    .from('channels')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', channelId)

  // If the message mentions an available model (e.g. @gpt-4o), generate an assistant reply in-channel.
  if (role === 'user') {
    try {
      const mentionedModel = await resolveMentionedModel(service, content.trim())
      if (mentionedModel) {
        const { data: channelMeta } = await service
          .from('channels')
          .select('name')
          .eq('id', channelId)
          .single()

        const modelReply = await generateChannelModelReply({
          service,
          channelId,
          channelName: channelMeta?.name || 'canal',
          requestingUserId: user.id,
          originalInput: content.trim(),
          model: mentionedModel,
        })

        if (modelReply.trim().length > 0) {
          await service.from('channel_messages').insert({
            channel_id: channelId,
            user_id: user.id,
            role: 'assistant',
            content: `**${mentionedModel.name}**\n\n${modelReply}`,
          })

          await service
            .from('channels')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', channelId)
        }
      }
    } catch (aiErr) {
      console.error('[channels/messages] Model mention response error:', aiErr)
    }
  }

  const [{ data: profile }, { data: channelMemberMeta }, activityRows] = await Promise.all([
    service
      .from('profiles')
      .select('name, avatar_url, role, created_at, bio, gender, birth_date')
      .eq('id', user.id)
      .single(),
    service
      .from('channel_members')
      .select('role, joined_at')
      .eq('channel_id', channelId)
      .eq('user_id', user.id)
      .maybeSingle(),
    loadActivityRows(service, [user.id]),
  ])

  const senderActivity = activityRows.get(user.id)
  const masked = buildMaskedActivityForViewer({
    viewerUserId: user.id,
    targetUserId: user.id,
    row: senderActivity,
    privacy: undefined,
    hasSharedContext: true,
    nowMs: Date.now(),
  })

  return NextResponse.json({
    ...message,
    user_name: profile?.name || 'Usuario',
    user_avatar: profile?.avatar_url || null,
    user_status: masked.status,
    user_last_seen_at: masked.last_seen_at,
    user_role: profile?.role || null,
    user_created_at: profile?.created_at || null,
    user_bio: profile?.bio || null,
    user_gender: profile?.gender || null,
    user_birth_date: profile?.birth_date || null,
    channel_role: channelMemberMeta?.role || null,
    channel_joined_at: channelMemberMeta?.joined_at || null,
  })
}
