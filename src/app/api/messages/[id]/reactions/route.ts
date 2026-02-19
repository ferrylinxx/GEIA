import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id } = await params
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('message_reactions')
      .select('*, user:profiles(id, name, avatar_url)')
      .eq('message_id', id)

    if (error) throw error

    return NextResponse.json({ data })
  } catch (error) {
    console.error('[Message Reactions] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch reactions' },
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
    const { emoji } = body

    if (!emoji) {
      return NextResponse.json({ error: 'emoji is required' }, { status: 400 })
    }

    // Check if already reacted with this emoji
    const { data: existing } = await supabase
      .from('message_reactions')
      .select('id')
      .eq('message_id', id)
      .eq('user_id', user.id)
      .eq('emoji', emoji)
      .single()

    if (existing) {
      // Remove reaction
      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('id', existing.id)

      if (error) throw error

      return NextResponse.json({ removed: true })
    } else {
      // Add reaction
      const { data, error } = await supabase
        .from('message_reactions')
        .insert({
          message_id: id,
          user_id: user.id,
          emoji
        })
        .select()
        .single()

      if (error) throw error

      return NextResponse.json({ data })
    }
  } catch (error) {
    console.error('[Message Reactions] Error:', error)
    return NextResponse.json(
      { error: 'Failed to toggle reaction' },
      { status: 500 }
    )
  }
}

