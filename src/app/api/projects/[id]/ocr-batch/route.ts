import { NextRequest, NextResponse } from 'next/server'
import { ensureProjectRole, getProjectApiContext, jsonError } from '@/lib/project-api'
import { ingestFileForRag } from '@/lib/project-file-ingest'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const ctx = await getProjectApiContext()
  if (!ctx) return jsonError('Unauthorized', 401)
  const { user, service } = ctx
  const { id: projectId } = await context.params
  if (!projectId) return jsonError('project id required', 400)

  const { ok } = await ensureProjectRole(service, projectId, user.id, 'editor')
  if (!ok) return jsonError('Forbidden', 403)

  const body = await req.json().catch(() => ({}))
  const requestedIds = Array.isArray(body?.file_ids) ? body.file_ids.map((v: unknown) => String(v)).filter(Boolean) : []

  let query = service
    .from('files')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (requestedIds.length > 0) {
    query = query.in('id', requestedIds)
  }

  const { data: fileRows, error } = await query
  if (error) return jsonError(error.message, 500)
  const files = (fileRows || []).filter((file: { mime?: string | null; filename?: string | null }) => {
    const mime = String(file.mime || '').toLowerCase()
    const name = String(file.filename || '').toLowerCase()
    return mime === 'application/pdf' || name.endsWith('.pdf')
  })
  if (!files || files.length === 0) return NextResponse.json({ success: true, processed: 0, ok: 0, failed: 0, results: [] })

  const results: Array<{ file_id: string; filename: string; ok: boolean; chunks?: number; chars?: number; error?: string }> = []
  let okCount = 0
  let failedCount = 0

  for (const file of files) {
    try {
      const ingest = await ingestFileForRag(service, file, { forceOcr: true, forceReindex: true })
      okCount += 1
      results.push({
        file_id: file.id,
        filename: file.filename,
        ok: true,
        chunks: ingest.chunks,
        chars: ingest.chars,
      })
    } catch (ocrErr: unknown) {
      failedCount += 1
      const message = ocrErr instanceof Error ? ocrErr.message : 'OCR failed'
      await service
        .from('files')
        .update({ ingest_status: 'failed', ingest_error: message })
        .eq('id', file.id)
      results.push({
        file_id: file.id,
        filename: file.filename,
        ok: false,
        error: message,
      })
    }
  }

  return NextResponse.json({
    success: true,
    processed: files.length,
    ok: okCount,
    failed: failedCount,
    results,
  })
}
