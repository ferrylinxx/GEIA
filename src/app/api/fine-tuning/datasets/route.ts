import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('fine_tuning_datasets')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ data })
  } catch (error) {
    console.error('[Fine-tuning Datasets] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch datasets' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      name,
      description,
      training_data,
      validation_data,
      file_url
    } = body

    if (!name || !training_data) {
      return NextResponse.json(
        { error: 'name and training_data are required' },
        { status: 400 }
      )
    }

    // Calculate stats
    const total_examples = Array.isArray(training_data) ? training_data.length : 0

    // Insert dataset
    const { data, error } = await supabase
      .from('fine_tuning_datasets')
      .insert({
        user_id: user.id,
        name,
        description,
        training_data,
        validation_data,
        file_url,
        total_examples
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ data })
  } catch (error) {
    console.error('[Fine-tuning Datasets] Error:', error)
    return NextResponse.json(
      { error: 'Failed to create dataset' },
      { status: 500 }
    )
  }
}

