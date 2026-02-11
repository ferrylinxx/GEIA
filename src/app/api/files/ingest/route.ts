import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 120

// Chunking config
const CHUNK_SIZE = 1000 // chars (~250 tokens)
const CHUNK_OVERLAP = 200

function chunkText(text: string): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    let end = start + CHUNK_SIZE
    if (end < text.length) {
      // Try to break at sentence/paragraph boundary
      const slice = text.substring(start, end + 200)
      const breakpoints = ['\n\n', '.\n', '. ', ';\n', '; ', '\n']
      for (const bp of breakpoints) {
        const idx = slice.lastIndexOf(bp, CHUNK_SIZE + 100)
        if (idx > CHUNK_SIZE * 0.5) { end = start + idx + bp.length; break }
      }
    } else {
      end = text.length
    }
    const chunk = text.substring(start, end).trim()
    if (chunk.length > 50) chunks.push(chunk)
    start = end - CHUNK_OVERLAP
    if (start < 0) start = 0
    if (end >= text.length) break
  }
  return chunks
}

async function extractText(buffer: Buffer, mime: string, filename: string): Promise<{ text: string; pages?: number }> {
  if (mime === 'application/pdf') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse')
    const data = await pdfParse(buffer)
    return { text: data.text, pages: data.numpages }
  }
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || filename.endsWith('.docx')) {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return { text: result.value }
  }
  if (mime?.startsWith('text/') || ['application/json', 'application/xml', 'application/javascript'].includes(mime)) {
    return { text: buffer.toString('utf-8') }
  }
  if (filename.match(/\.(txt|md|csv|log|py|js|ts|jsx|tsx|html|css|sql|yaml|yml|json|xml|sh|bat)$/i)) {
    return { text: buffer.toString('utf-8') }
  }
  throw new Error(`Unsupported file type: ${mime}`)
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const batchSize = 20
  const allEmbeddings: number[][] = []
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: batch, model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small' }),
    })
    if (!res.ok) throw new Error(`Embeddings API error: ${await res.text()}`)
    const data = await res.json()
    allEmbeddings.push(...data.data.map((d: { embedding: number[] }) => d.embedding))
  }
  return allEmbeddings
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { file_id } = await req.json()
  if (!file_id) return NextResponse.json({ error: 'file_id required' }, { status: 400 })

  const serviceClient = createServiceRoleClient()

  // Get file record
  const { data: file } = await serviceClient.from('files').select('*').eq('id', file_id).eq('user_id', user.id).single()
  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  // Update status to processing
  await serviceClient.from('files').update({ ingest_status: 'processing' }).eq('id', file_id)

  try {
    // Download file from storage
    const { data: fileData, error: dlError } = await serviceClient.storage.from('user-files').download(file.storage_path)
    if (dlError || !fileData) throw new Error(`Download error: ${dlError?.message}`)

    const buffer = Buffer.from(await fileData.arrayBuffer())
    const { text, pages } = await extractText(buffer, file.mime || '', file.filename)

    if (!text || text.trim().length < 10) throw new Error('No text extracted')

    // Chunk
    const chunks = chunkText(text)
    if (chunks.length === 0) throw new Error('No chunks generated')

    // Generate embeddings
    const embeddings = await generateEmbeddings(chunks)

    // Delete old chunks
    await serviceClient.from('file_chunks').delete().eq('file_id', file_id)

    // Insert chunks with embeddings
    const chunkRows = chunks.map((content, i) => ({
      file_id, project_id: file.project_id, user_id: user.id,
      chunk_index: i, content, embedding: embeddings[i],
      page: pages ? Math.min(Math.floor((i / chunks.length) * pages) + 1, pages) : null,
      content_hash: null, meta_json: {},
    }))

    // Insert in batches of 50
    for (let i = 0; i < chunkRows.length; i += 50) {
      const batch = chunkRows.slice(i, i + 50)
      const { error: insertErr } = await serviceClient.from('file_chunks').insert(batch)
      if (insertErr) throw new Error(`Insert error: ${insertErr.message}`)
    }

    await serviceClient.from('files').update({
      ingest_status: 'done', ingest_error: null,
      meta_json: { ...file.meta_json, pages, chunk_count: chunks.length, char_count: text.length },
    }).eq('id', file_id)

    return NextResponse.json({ success: true, chunks: chunks.length, chars: text.length })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await serviceClient.from('files').update({ ingest_status: 'failed', ingest_error: msg }).eq('id', file_id)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

