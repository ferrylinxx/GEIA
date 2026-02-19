import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const include_public = searchParams.get('include_public') === 'true'
    const sort_by = searchParams.get('sort_by') || 'created_at'

    let query = supabase
      .from('user_themes')
      .select('*')
      .eq('user_id', user.id)

    // If include_public, also get public themes
    if (include_public) {
      query = supabase
        .from('user_themes')
        .select('*')
        .or(`user_id.eq.${user.id},is_public.eq.true`)
    }

    // Sort
    if (sort_by === 'likes') {
      query = query.order('likes_count', { ascending: false })
    } else if (sort_by === 'usage') {
      query = query.order('usage_count', { ascending: false })
    } else {
      query = query.order('created_at', { ascending: false })
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ data })
  } catch (error) {
    console.error('[Themes] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch themes' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      name,
      description,
      colors,
      gradients,
      effects,
      typography,
      custom_css,
      is_public
    } = body

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    // Insert theme
    const { data, error } = await supabase
      .from('user_themes')
      .insert({
        user_id: user.id,
        name,
        description,
        colors,
        gradients,
        effects,
        typography,
        custom_css,
        is_public: is_public || false
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ data })
  } catch (error) {
    console.error('[Themes] Error:', error)
    return NextResponse.json(
      { error: 'Failed to create theme' },
      { status: 500 }
    )
  }
}

