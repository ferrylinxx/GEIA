import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('conversation_participants')
      .select('*, user:profiles(*)')
      .eq('conversation_id', id)
      .eq('is_active', true)

    if (error) throw error

    return NextResponse.json({ data })
  } catch (error) {
    console.error('[Conversation Participants] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch participants' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { user_id, role, can_write, can_invite } = body

    if (!user_id) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
    }

    // Check if current user can invite
    const { data: currentParticipant } = await supabase
      .from('conversation_participants')
      .select('can_invite')
      .eq('conversation_id', id)
      .eq('user_id', user.id)
      .single()

    if (!currentParticipant?.can_invite) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Insert participant
    const { data, error } = await supabase
      .from('conversation_participants')
      .insert({
        conversation_id: id,
        user_id,
        role: role || 'viewer',
        can_write: can_write || false,
        can_invite: can_invite || false,
        invited_by: user.id
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ data })
  } catch (error) {
    console.error('[Conversation Participants] Error:', error)
    return NextResponse.json(
      { error: 'Failed to add participant' },
      { status: 500 }
    )
  }
}

