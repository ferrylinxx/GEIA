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

function toPreview(content: string | null | undefined): string {
  if (!content) return ''
  return content.replace(/\s+/g, ' ').trim().slice(0, 140)
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: userId } = await params
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const { data: profile } = await auth.service
    .from('profiles')
    .select('id, name, avatar_url')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { data: conversations, error } = await auth.service
    .from('conversations')
    .select('id, title, model_default, is_archived, created_at, updated_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(250)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const typedConversations = (conversations || []) as Array<{
    id: string
    title: string
    model_default: string | null
    is_archived: boolean | null
    created_at: string
    updated_at: string
  }>

  const conversationIds = typedConversations.map((item) => item.id)
  const messageCounts = new Map<string, number>()
  const lastMessageByConversation = new Map<string, { created_at: string; preview: string }>()

  if (conversationIds.length > 0) {
    const { data: messages } = await auth.service
      .from('messages')
      .select('conversation_id, content, created_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })
      .limit(8000)

    for (const msg of (messages || []) as Array<{ conversation_id: string; content: string; created_at: string }>) {
      messageCounts.set(msg.conversation_id, (messageCounts.get(msg.conversation_id) || 0) + 1)
      if (!lastMessageByConversation.has(msg.conversation_id)) {
        lastMessageByConversation.set(msg.conversation_id, {
          created_at: msg.created_at,
          preview: toPreview(msg.content),
        })
      }
    }
  }

  return NextResponse.json({
    user: {
      id: profile.id,
      name: profile.name,
      avatar_url: profile.avatar_url,
    },
    conversations: typedConversations.map((conv) => ({
      id: conv.id,
      title: conv.title || 'Sin titulo',
      model_default: conv.model_default || null,
      is_archived: Boolean(conv.is_archived),
      created_at: conv.created_at,
      updated_at: conv.updated_at,
      message_count: messageCounts.get(conv.id) || 0,
      last_message_at: lastMessageByConversation.get(conv.id)?.created_at || null,
      last_message_preview: lastMessageByConversation.get(conv.id)?.preview || '',
    })),
  })
}
