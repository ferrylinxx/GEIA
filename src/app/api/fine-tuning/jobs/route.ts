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
      .from('fine_tuning_jobs')
      .select('*, dataset:fine_tuning_datasets(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ data })
  } catch (error) {
    console.error('[Fine-tuning Jobs] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
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
      dataset_id,
      base_model,
      fine_tuned_model_name,
      hyperparameters
    } = body

    if (!dataset_id || !base_model) {
      return NextResponse.json(
        { error: 'dataset_id and base_model are required' },
        { status: 400 }
      )
    }

    // Insert job
    const { data, error } = await supabase
      .from('fine_tuning_jobs')
      .insert({
        user_id: user.id,
        dataset_id,
        base_model,
        fine_tuned_model_name,
        hyperparameters,
        status: 'pending'
      })
      .select()
      .single()

    if (error) throw error

    // TODO: Start fine-tuning job with OpenAI API
    // This would be done in a background worker

    return NextResponse.json({ data })
  } catch (error) {
    console.error('[Fine-tuning Jobs] Error:', error)
    return NextResponse.json(
      { error: 'Failed to create job' },
      { status: 500 }
    )
  }
}

