import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { searchWeb } from '@/lib/web-search'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { query, num_results = 5 } = await req.json()
  if (!query) return NextResponse.json({ error: 'Missing query' }, { status: 400 })

  try {
    const results = await searchWeb(query, num_results)
    return NextResponse.json({ results })
  } catch (e) {
    console.error('Web search error:', e)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}

