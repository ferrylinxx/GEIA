import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import * as fs from 'fs'
import * as path from 'path'

export const runtime = 'nodejs'
export const maxDuration = 300

const CHUNK_SIZE = 1200
const CHUNK_OVERLAP = 200

// ── Mejora 1: Limpieza de texto ──
function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')                    // Normalizar saltos de línea
    .replace(/\t/g, ' ')                        // Tabs a espacios
    .replace(/[^\S\n]+/g, ' ')                  // Múltiples espacios a uno (preservar \n)
    .replace(/\n{3,}/g, '\n\n')                 // Máx 2 saltos seguidos
    .replace(/^ +| +$/gm, '')                   // Trim por línea
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // Eliminar caracteres de control
    .trim()
}

// Verify admin
async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const service = createServiceRoleClient()
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return user
}

// ── Mejora 2: Chunks contextuales con metadata ──
interface ChunkMeta {
  filename: string
  folder: string
  ext: string
}

function chunkText(text: string, meta: ChunkMeta): string[] {
  const chunks: string[] = []
  // Prefijo contextual que se añade a cada chunk para mejorar el embedding
  const prefix = `[Archivo: ${meta.filename} | Carpeta: ${meta.folder} | Tipo: ${meta.ext.toUpperCase()}]\n`
  const effectiveChunkSize = CHUNK_SIZE - prefix.length

  let start = 0
  while (start < text.length) {
    let end = start + effectiveChunkSize
    if (end < text.length) {
      const slice = text.substring(start, end + 200)
      const breakpoints = ['\n\n', '.\n', '. ', ';\n', '; ', '\n']
      for (const bp of breakpoints) {
        const idx = slice.lastIndexOf(bp, effectiveChunkSize + 100)
        if (idx > effectiveChunkSize * 0.5) { end = start + idx + bp.length; break }
      }
    } else { end = text.length }
    const rawChunk = text.substring(start, end).trim()
    if (rawChunk.length > 50) chunks.push(prefix + rawChunk)
    start = end - CHUNK_OVERLAP
    if (start < 0) start = 0
    if (end >= text.length) break
  }
  return chunks
}

// Extract text from file buffer based on extension
async function extractText(buffer: Buffer, ext: string): Promise<string> {
  const lower = ext.toLowerCase()
  if (lower === 'pdf') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse')
    const data = await pdfParse(buffer)
    return data.text || ''
  }
  if (lower === 'docx' || lower === 'doc') {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value || ''
  }
  if (lower === 'xlsx' || lower === 'xls') {
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    let text = ''
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      text += `\n--- Hoja: ${sheetName} ---\n`
      text += XLSX.utils.sheet_to_csv(sheet, { FS: ' | ', RS: '\n' })
    }
    return text
  }
  // ── Mejora 3: Extracción PPTX real con officeparser ──
  if (lower === 'pptx') {
    try {
      const { OfficeParser } = await import('officeparser')
      const ast = await OfficeParser.parseOffice(buffer)
      return ast.toText() || ''
    } catch { return '' }
  }
  // Text-based files
  if (['txt', 'csv', 'md', 'json', 'xml', 'html', 'log', 'rtf', 'py', 'js', 'ts', 'sql', 'yaml', 'yml', 'sh', 'bat', 'css', 'jsx', 'tsx'].includes(lower)) {
    return buffer.toString('utf-8')
  }
  return ''
}

// Generate embeddings in batches
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const batchSize = 20
  const all: number[][] = []
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: batch, model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small' }),
    })
    if (!res.ok) throw new Error(`Embeddings API error: ${await res.text()}`)
    const data = await res.json()
    all.push(...data.data.map((d: { embedding: number[] }) => d.embedding))
  }
  return all
}

// Recursively scan directory for files
function scanDirectory(dirPath: string, extensions: string[], maxSizeMB: number): { filePath: string; stat: fs.Stats }[] {
  const results: { filePath: string; stat: fs.Stats }[] = []
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      try {
        if (entry.isDirectory()) {
          results.push(...scanDirectory(fullPath, extensions, maxSizeMB))
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).slice(1).toLowerCase()
          if (extensions.includes(ext)) {
            const stat = fs.statSync(fullPath)
            if (stat.size <= maxSizeMB * 1024 * 1024) {
              results.push({ filePath: fullPath, stat })
            }
          }
        }
      } catch { /* skip inaccessible files */ }
    }
  } catch { /* skip inaccessible directories */ }
  return results
}

export async function POST(req: NextRequest) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { drive_id } = await req.json()
  if (!drive_id) return NextResponse.json({ error: 'drive_id requerido' }, { status: 400 })

  const service = createServiceRoleClient()

  // Get drive config
  const { data: drive } = await service.from('network_drives').select('*').eq('id', drive_id).single()
  if (!drive) return NextResponse.json({ error: 'Unidad no encontrada' }, { status: 404 })

  // Update status to syncing
  await service.from('network_drives').update({ sync_status: 'syncing', sync_error: null, updated_at: new Date().toISOString() }).eq('id', drive_id)

  try {
    // Resolve UNC path - convert UNC to Windows path format
    let scanPath = drive.unc_path
    // Support both \\server\share and mapped drive letters (Z:\)
    if (!fs.existsSync(scanPath)) {
      return NextResponse.json({ error: `No se puede acceder a la ruta: ${scanPath}. Asegúrate de estar conectado a la VPN/red.` }, { status: 400 })
    }

    const extensions = drive.file_extensions || ['pdf', 'docx', 'xlsx', 'txt', 'csv', 'md']
    const maxSize = drive.max_file_size_mb || 50

    // Scan files
    const files = scanDirectory(scanPath, extensions, maxSize)

    // Get existing indexed files
    const { data: existingFiles } = await service.from('network_files')
      .select('id, file_path, last_modified, content_hash')
      .eq('drive_id', drive_id)
    type ExistingFile = { id: string; file_path: string; last_modified: string; content_hash: string }
    const existingMap = new Map<string, ExistingFile>((existingFiles || []).map((f: ExistingFile) => [f.file_path, f]))

    let newFiles = 0, updatedFiles = 0, skippedFiles = 0, totalChunks = 0, errorFiles = 0

    for (const { filePath, stat } of files) {
      const filename = path.basename(filePath)
      const ext = path.extname(filename).slice(1).toLowerCase()
      const lastMod = stat.mtime.toISOString()
      const existing = existingMap.get(filePath)

      // Skip if already indexed and not modified
      if (existing && existing.last_modified === lastMod) {
        skippedFiles++
        continue
      }

      try {
        // Read file
        const buffer = fs.readFileSync(filePath)
        const rawText = await extractText(buffer, ext)
        // Mejora 1: Limpiar texto
        const text = cleanText(rawText)

        if (!text || text.length < 10) {
          if (existing) {
            await service.from('network_files').update({ status: 'skipped', error_message: 'Sin texto extraíble', updated_at: new Date().toISOString() }).eq('id', existing.id)
          } else {
            await service.from('network_files').insert({
              drive_id, file_path: filePath, filename, extension: ext,
              file_size: stat.size, last_modified: lastMod,
              status: 'skipped', error_message: 'Sin texto extraíble',
            })
          }
          skippedFiles++
          continue
        }

        // Mejora 2: Chunks con contexto (filename, carpeta, tipo)
        const folder = path.dirname(filePath).split(path.sep).slice(-2).join('/')
        const chunks = chunkText(text, { filename, folder, ext })
        if (chunks.length === 0) { skippedFiles++; continue }

        // Generate embeddings
        const embeddings = await generateEmbeddings(chunks)

        // Upsert network_file record
        let fileId: string
        if (existing) {
          // Delete old chunks
          await service.from('network_file_chunks').delete().eq('network_file_id', existing.id)
          await service.from('network_files').update({
            filename, extension: ext, file_size: stat.size, last_modified: lastMod,
            chunk_count: chunks.length, char_count: text.length, status: 'done',
            error_message: null, updated_at: new Date().toISOString(),
          }).eq('id', existing.id)
          fileId = existing.id
          updatedFiles++
        } else {
          const { data: newFile } = await service.from('network_files').insert({
            drive_id, file_path: filePath, filename, extension: ext,
            file_size: stat.size, last_modified: lastMod,
            chunk_count: chunks.length, char_count: text.length, status: 'done',
          }).select('id').single()
          fileId = newFile!.id
          newFiles++
        }

        // Insert chunks with embeddings in batches
        const chunkRows = chunks.map((content, i) => ({
          network_file_id: fileId, drive_id, chunk_index: i,
          content, embedding: JSON.stringify(embeddings[i]), meta_json: { filename, ext },
        }))
        for (let i = 0; i < chunkRows.length; i += 50) {
          await service.from('network_file_chunks').insert(chunkRows.slice(i, i + 50))
        }
        totalChunks += chunks.length
      } catch (fileErr) {
        const msg = fileErr instanceof Error ? fileErr.message : 'Error desconocido'
        if (existing) {
          await service.from('network_files').update({ status: 'failed', error_message: msg, updated_at: new Date().toISOString() }).eq('id', existing.id)
        } else {
          try {
            await service.from('network_files').insert({
              drive_id, file_path: filePath, filename, extension: ext,
              file_size: stat.size, last_modified: lastMod,
              status: 'failed', error_message: msg,
            })
          } catch { /* ignore insert error */ }
        }
        errorFiles++
      }
    }

    // Count total files and chunks for this drive
    const { count: fileCount } = await service.from('network_files').select('id', { count: 'exact' }).eq('drive_id', drive_id).eq('status', 'done')
    const { count: chunkCount } = await service.from('network_file_chunks').select('id', { count: 'exact' }).eq('drive_id', drive_id)

    // Update drive stats
    await service.from('network_drives').update({
      sync_status: 'done', sync_error: null,
      file_count: fileCount || 0, total_chunks: chunkCount || 0,
      last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', drive_id)

    return NextResponse.json({
      success: true,
      stats: {
        total_scanned: files.length,
        new_files: newFiles,
        updated_files: updatedFiles,
        skipped_files: skippedFiles,
        error_files: errorFiles,
        total_chunks: totalChunks,
        drive_file_count: fileCount || 0,
        drive_chunk_count: chunkCount || 0,
      }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    await service.from('network_drives').update({
      sync_status: 'error', sync_error: msg, updated_at: new Date().toISOString(),
    }).eq('id', drive_id)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
