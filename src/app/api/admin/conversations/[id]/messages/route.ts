import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const service = createServiceRoleClient()
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return { user, service }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: conversationId } = await params
  if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

  const { data: conversation } = await auth.service
    .from('conversations')
    .select('id, user_id, title, model_default, is_archived, created_at, updated_at')
    .eq('id', conversationId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  const { data: owner } = await auth.service
    .from('profiles')
    .select('id, name, avatar_url, role')
    .eq('id', conversation.user_id)
    .maybeSingle()

  const { data: messages, error: messagesError } = await auth.service
    .from('messages')
    .select('id, conversation_id, user_id, role, content, model, attachments_json, created_at, updated_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(1200)

  if (messagesError) return NextResponse.json({ error: messagesError.message }, { status: 500 })

  const typedMessages = (messages || []) as Array<{
    id: string
    conversation_id: string
    user_id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    model: string | null
    attachments_json: unknown
    created_at: string
    updated_at: string
  }>

  const participantIds = Array.from(new Set(typedMessages.map((item) => item.user_id).filter(Boolean)))
  const participantNameMap = new Map<string, string | null>()

  if (participantIds.length > 0) {
    const { data: participants } = await auth.service
      .from('profiles')
      .select('id, name')
      .in('id', participantIds)

    for (const participant of (participants || []) as Array<{ id: string; name: string | null }>) {
      participantNameMap.set(participant.id, participant.name)
    }
  }

  return NextResponse.json({
    conversation: {
      ...conversation,
      owner: owner || null,
    },
    messages: typedMessages.map((msg) => ({
      ...msg,
      user_name: participantNameMap.get(msg.user_id) || null,
    })),
  })
}
