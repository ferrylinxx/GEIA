import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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

    // Check if already liked
    const { data: existing } = await supabase
      .from('theme_likes')
      .select('id')
      .eq('theme_id', id)
      .eq('user_id', user.id)
      .single()

    if (existing) {
      // Unlike
      const { error } = await supabase
        .from('theme_likes')
        .delete()
        .eq('theme_id', id)
        .eq('user_id', user.id)

      if (error) throw error

      return NextResponse.json({ liked: false })
    } else {
      // Like
      const { error } = await supabase
        .from('theme_likes')
        .insert({
          theme_id: id,
          user_id: user.id
        })

      if (error) throw error

      return NextResponse.json({ liked: true })
    }
  } catch (error) {
    console.error('[Theme Like] Error:', error)
    return NextResponse.json(
      { error: 'Failed to toggle like' },
      { status: 500 }
    )
  }
}

