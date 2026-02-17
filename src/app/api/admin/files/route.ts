import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const service = createServiceRoleClient()
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return { user, service }
}

export async function GET(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const searchParams = req.nextUrl.searchParams
  const query = (searchParams.get('q') || '').trim()
  const userId = searchParams.get('user_id')
  const mimeType = searchParams.get('mime_type')
  const ingestStatus = searchParams.get('ingest_status')
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')
  const page = Math.max(1, Number(searchParams.get('page') || '1'))
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('pageSize') || '100')))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let filesQuery = auth.service
    .from('files')
    .select('id, user_id, storage_path, filename, mime, size, ingest_status, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (query) {
    filesQuery = filesQuery.ilike('filename', `%${query}%`)
  }
  if (userId) {
    filesQuery = filesQuery.eq('user_id', userId)
  }
  if (mimeType) {
    filesQuery = filesQuery.ilike('mime', `${mimeType}%`)
  }
  if (ingestStatus) {
    filesQuery = filesQuery.eq('ingest_status', ingestStatus)
  }
  if (dateFrom) {
    filesQuery = filesQuery.gte('created_at', dateFrom)
  }
  if (dateTo) {
    filesQuery = filesQuery.lte('created_at', dateTo)
  }

  const { data: rows, count, error } = await filesQuery
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const files = (rows || []) as Array<{
    id: string
    user_id: string
    storage_path: string
    filename: string
    mime: string | null
    size: number | null
    ingest_status: 'none' | 'queued' | 'processing' | 'done' | 'failed'
    created_at: string
  }>

  const userIds = Array.from(new Set(files.map((f) => f.user_id).filter(Boolean)))
  let names = new Map<string, string | null>()
  if (userIds.length > 0) {
    const { data: profiles } = await auth.service
      .from('profiles')
      .select('id, name')
      .in('id', userIds)
    names = new Map((profiles || []).map((p: { id: string; name: string | null }) => [p.id, p.name]))
  }

  // Get chunk counts for all files
  const fileIds = files.map((f) => f.id)
  const chunkCounts = new Map<string, number>()
  if (fileIds.length > 0) {
    const { data: chunks } = await auth.service
      .from('file_chunks')
      .select('file_id')
      .in('file_id', fileIds)

    if (chunks) {
      chunks.forEach((chunk: { file_id: string }) => {
        chunkCounts.set(chunk.file_id, (chunkCounts.get(chunk.file_id) || 0) + 1)
      })
    }
  }

  return NextResponse.json({
    files: files.map((file) => ({
      ...file,
      size: typeof file.size === 'number' ? file.size : 0,
      user_name: names.get(file.user_id) || null,
      chunk_count: chunkCounts.get(file.id) || 0,
    })),
    total: count || 0,
    page,
    pageSize,
  })
}
