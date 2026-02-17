import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const service = createServiceRoleClient()
  const { data: profile } = await service
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return null
  return { user, service }
}

export async function GET() {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await auth.service
    .from('doc_analysis_config')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Return default config if none exists
  if (!data) {
    return NextResponse.json({
      extraction_engine: 'hybrid',
      tika_server_url: 'https://tika.fgarola.es/',
      tika_timeout: 30000,
      embedding_model: 'text-embedding-3-large',
      embedding_dimensions: 1536,
      embedding_batch_size: 100,
      chunk_size: 1500,
      chunk_overlap: 200,
      chunking_strategy: 'semantic',
      ocr_enabled: true,
      ocr_languages: 'spa+eng',
      ocr_min_text_length: 100,
      llm_analysis_enabled: true,
      llm_analysis_model: 'gpt-4o-mini',
      llm_analysis_temperature: 0.3,
      embedding_cache_enabled: true,
      retry_enabled: true,
      retry_attempts: 3,
      retry_backoff_ms: 2000,
    })
  }

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()

  // Delete old configs and insert new one
  await auth.service.from('doc_analysis_config').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  const { data, error } = await auth.service
    .from('doc_analysis_config')
    .insert({
      extraction_engine: body.extractionEngine,
      tika_server_url: body.tikaServerUrl,
      tika_timeout: body.tikaTimeout,
      embedding_model: body.embeddingModel,
      embedding_dimensions: body.embeddingDimensions,
      embedding_batch_size: body.embeddingBatchSize,
      chunk_size: body.chunkSize,
      chunk_overlap: body.chunkOverlap,
      chunking_strategy: body.chunkingStrategy,
      ocr_enabled: body.ocrEnabled,
      ocr_languages: body.ocrLanguages,
      ocr_min_text_length: body.ocrMinTextLength,
      llm_analysis_enabled: body.llmAnalysisEnabled,
      llm_analysis_model: body.llmAnalysisModel,
      llm_analysis_temperature: body.llmAnalysisTemperature,
      embedding_cache_enabled: body.embeddingCacheEnabled,
      retry_enabled: body.retryEnabled,
      retry_attempts: body.retryAttempts,
      retry_backoff_ms: body.retryBackoffMs,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

