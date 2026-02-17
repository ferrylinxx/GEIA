import { NextRequest, NextResponse } from 'next/server'
import { ensureProjectRole, getProjectApiContext, jsonError } from '@/lib/project-api'
import { coerceMimeType, sanitizeFilename } from '@/lib/file-utils'
import { ingestFileForRag, type IngestFileRecord } from '@/lib/project-file-ingest'

export const runtime = 'nodejs'
export const maxDuration = 180

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string; fileId: string }> }
) {
  const ctx = await getProjectApiContext()
  if (!ctx) return jsonError('Unauthorized', 401)
  const { user, service } = ctx
  const { id: projectId, fileId } = await context.params

  if (!projectId || !fileId) return jsonError('project id and file id required', 400)

  const { ok } = await ensureProjectRole(service, projectId, user.id, 'editor')
  if (!ok) return jsonError('Forbidden', 403)

  const form = await req.formData().catch(() => null)
  const nextFile = form?.get('file')
  if (!nextFile || !(nextFile instanceof File)) return jsonError('file required', 400)

  const { data: currentFile } = await service
    .from('files')
    .select('*')
    .eq('id', fileId)
    .eq('project_id', projectId)
    .single()

  if (!currentFile) return jsonError('File not found', 404)

  const safeName = sanitizeFilename(nextFile.name || currentFile.filename || 'archivo')
  const nextMime = coerceMimeType(nextFile.type, safeName)
  const nextPath = `${currentFile.user_id}/${Date.now()}_${safeName}`

  const uploadArrayBuffer = await nextFile.arrayBuffer()
  const { error: uploadErr } = await service.storage
    .from('user-files')
    .upload(nextPath, Buffer.from(uploadArrayBuffer), { contentType: nextMime, upsert: false })

  if (uploadErr) return jsonError(uploadErr.message, 500)

  // Best effort cleanup of the old object.
  if (currentFile.storage_path && currentFile.storage_path !== nextPath) {
    await service.storage.from('user-files').remove([currentFile.storage_path])
  }

  const updatedMeta = {
    ...(currentFile.meta_json || {}),
    replaced_at: new Date().toISOString(),
    replaced_by_user_id: user.id,
    replaced_previous_filename: currentFile.filename,
  }

  const nextVersion = Math.max(1, Number(currentFile.file_version || 1) + 1)
  const primaryPayload: Record<string, unknown> = {
    filename: nextFile.name || currentFile.filename,
    mime: nextMime,
    size: nextFile.size || 0,
    storage_path: nextPath,
    ingest_status: 'queued',
    ingest_error: null,
    file_version: nextVersion,
    meta_json: updatedMeta,
    ocr_requested_at: null,
    last_reindexed_at: null,
  }

  let updatedFile: Record<string, unknown> | null = null
  let updateErr: { message?: string } | null = null
  const firstUpdate = await service
    .from('files')
    .update(primaryPayload)
    .eq('id', fileId)
    .select('*')
    .single()
  updatedFile = firstUpdate.data as Record<string, unknown> | null
  updateErr = firstUpdate.error

  // Compatibility fallback when new lifecycle columns are not yet migrated.
  if (updateErr && /column/i.test(updateErr.message || '')) {
    const fallbackPayload: Record<string, unknown> = {
      filename: nextFile.name || currentFile.filename,
      mime: nextMime,
      size: nextFile.size || 0,
      storage_path: nextPath,
      ingest_status: 'queued',
      ingest_error: null,
      meta_json: updatedMeta,
    }
    const fallback = await service
      .from('files')
      .update(fallbackPayload)
      .eq('id', fileId)
      .select('*')
      .single()
    updatedFile = fallback.data as Record<string, unknown> | null
    updateErr = fallback.error
  }

  if (updateErr || !updatedFile) {
    return jsonError(updateErr?.message || 'No se pudo actualizar el archivo', 500)
  }

  try {
    const ingestResult = await ingestFileForRag(service, updatedFile as unknown as IngestFileRecord, { forceReindex: true })
    const { data: refreshed } = await service
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single()
    return NextResponse.json({
      success: true,
      file: refreshed || updatedFile,
      ingest: ingestResult,
    })
  } catch (ingestErr: unknown) {
    const message = ingestErr instanceof Error ? ingestErr.message : 'Ingest failed'
    await service
      .from('files')
      .update({ ingest_status: 'failed', ingest_error: message })
      .eq('id', fileId)
    return jsonError(message, 500)
  }
}
