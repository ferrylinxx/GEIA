import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const messageId = typeof body?.message_id === 'string' ? body.message_id : ''
  const conversationIdInput = typeof body?.conversation_id === 'string' ? body.conversation_id : ''
  const newContent = typeof body?.new_content === 'string' ? body.new_content.trim() : ''

  if (!messageId || !newContent) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const service = createServiceRoleClient()

  const { data: currentMessage, error: messageError } = await service
    .from('messages')
    .select('id, conversation_id, user_id, role, content, created_at, edit_version')
    .eq('id', messageId)
    .single()

  if (messageError || !currentMessage) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }

  const resolvedConversationId = conversationIdInput || currentMessage.conversation_id
  if (!resolvedConversationId) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  if (currentMessage.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (conversationIdInput && currentMessage.conversation_id !== conversationIdInput) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (currentMessage.role !== 'user') {
    return NextResponse.json({ error: 'Only user messages can be edited' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const nextVersion = (currentMessage.edit_version || 1) + 1

  const { error: updateError } = await service
    .from('messages')
    .update({
      content: newContent,
      edited_at: now,
      edit_version: nextVersion,
      updated_at: now,
    })
    .eq('id', messageId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  await service
    .from('message_edits')
    .insert({
      message_id: messageId,
      previous_content: currentMessage.content || '',
      new_content: newContent,
      editor_user_id: user.id,
    })

  const { data: conversationMessages } = await service
    .from('messages')
    .select('id, role, created_at')
    .eq('conversation_id', resolvedConversationId)
    .order('created_at', { ascending: true })

  const ordered = (conversationMessages || []) as Array<{ id: string; role: string; created_at: string }>
  const pivotIndex = ordered.findIndex((item) => item.id === messageId)
  const afterEdited = pivotIndex >= 0 ? ordered.slice(pivotIndex + 1) : []

  // Keep the first assistant response as regeneration anchor so versions can be updated.
  const regenTarget = afterEdited.find((item) => item.role === 'assistant')?.id || null
  const idsToDelete = afterEdited
    .filter((item) => item.id !== regenTarget)
    .map((item) => item.id)

  if (idsToDelete.length > 0) {
    await service
      .from('messages')
      .delete()
      .in('id', idsToDelete)
  }

  return NextResponse.json({
    success: true,
    message_id: messageId,
    conversation_id: resolvedConversationId,
    edited_at: now,
    edit_version: nextVersion,
    deleted_count: idsToDelete.length,
    regen_target_message_id: regenTarget,
  })
}
