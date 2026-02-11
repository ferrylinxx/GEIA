import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import crypto from 'crypto'

// POST — Create a share link for a conversation
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversation_id } = await req.json()
  if (!conversation_id) return NextResponse.json({ error: 'conversation_id required' }, { status: 400 })

  const service = createServiceRoleClient()

  // Verify the user owns this conversation
  const { data: conv } = await service
    .from('conversations')
    .select('id, user_id')
    .eq('id', conversation_id)
    .single()

  if (!conv || conv.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Check if an active share already exists
  const { data: existing } = await service
    .from('shared_chats')
    .select('id, share_token')
    .eq('conversation_id', conversation_id)
    .eq('is_active', true)
    .single()

  if (existing) {
    const url = `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/share/${existing.share_token}`
    return NextResponse.json({ share_token: existing.share_token, url })
  }

  // Create new share
  const share_token = crypto.randomBytes(16).toString('hex')
  const { error } = await service.from('shared_chats').insert({
    conversation_id,
    share_token,
    created_by: user.id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const url = `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/share/${share_token}`
  return NextResponse.json({ share_token, url })
}

// GET — Retrieve a shared conversation by token
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const service = createServiceRoleClient()

  // Find the share
  const { data: share } = await service
    .from('shared_chats')
    .select('*')
    .eq('share_token', token)
    .eq('is_active', true)
    .single()

  if (!share) return NextResponse.json({ error: 'Share not found or expired' }, { status: 404 })

  // Check expiry
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Share expired' }, { status: 410 })
  }

  // Increment view count
  await service
    .from('shared_chats')
    .update({ view_count: (share.view_count || 0) + 1 })
    .eq('id', share.id)

  // Get conversation
  const { data: conv } = await service
    .from('conversations')
    .select('id, title, created_at')
    .eq('id', share.conversation_id)
    .single()

  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  // Get messages
  const { data: messages } = await service
    .from('messages')
    .select('id, role, content, model, meta_json, sources_json, created_at')
    .eq('conversation_id', share.conversation_id)
    .order('created_at', { ascending: true })

  // Get creator name
  const { data: profile } = await service
    .from('profiles')
    .select('name')
    .eq('id', share.created_by)
    .single()

  return NextResponse.json({
    conversation: conv,
    messages: messages || [],
    shared_by: profile?.name || 'Usuario',
    shared_at: share.created_at,
    view_count: (share.view_count || 0) + 1,
  })
}

