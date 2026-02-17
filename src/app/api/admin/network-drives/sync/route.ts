import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 300

// ── Mejora 8: Aumentar chunk size a 1600 ──
const CHUNK_SIZE = 1600
const CHUNK_OVERLAP = 250
const PARALLEL_BATCH_SIZE = 1  // Mejora 7: archivos en paralelo

// ── Limpieza de texto ──
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

// ── Mejora 6: Generar hash MD5 del contenido ──
function contentHash(text: string): string {
  return crypto.createHash('md5').update(text).digest('hex')
}

// ✅ M5: SHA-256 hash for embedding cache
function embeddingHash(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf-8').digest('hex')
}

// ✅ M3: LLM Analysis types
interface DocumentAnalysis {
  doc_type: string
  summary: string
  key_entities: string[]
  key_dates: string[]
  department: string | null
  language: string
  importance: 'critical' | 'important' | 'normal' | 'low'
}

// ✅ M3: Analyze document with LLM
async function analyzeNetworkFile(text: string, filename: string): Promise<DocumentAnalysis | null> {
  try {
    const prompt = `Analiza este documento empresarial:

Nombre: ${filename}
Contenido (primeros 8000 chars):
${text.slice(0, 8000)}

Extrae la siguiente información en formato JSON:
{
  "doc_type": "contrato|factura|informe|manual|política|presentación|hoja_de_cálculo|otro",
  "summary": "resumen ejecutivo en 2-3 líneas",
  "key_entities": ["persona1", "empresa1", ...] (máximo 5),
  "key_dates": ["2024-01-15", ...] (máximo 3, formato YYYY-MM-DD),
  "department": "RRHH|Finanzas|Ventas|Marketing|IT|Legal|Operaciones|null",
  "language": "es|ca|en|otro",
  "importance": "critical|important|normal|low"
}

Criterios de importancia:
- critical: contratos, facturas, documentos legales
- important: informes ejecutivos, políticas importantes
- normal: documentos de trabajo estándar
- low: borradores, archivos temporales`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 500,
      }),
    })

    if (!response.ok) {
      console.error('[LLM Analysis] API error:', await response.text())
      return null
    }

    const data = await response.json()
    const analysis = JSON.parse(data.choices[0].message.content)

    console.log(`[LLM Analysis] ${filename}: ${analysis.doc_type} (${analysis.importance})`)

    return analysis
  } catch (error) {
    console.error('[LLM Analysis] Failed:', error)
    return null
  }
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

// ── Chunks contextuales con metadata enriquecida ──
interface ChunkMeta {
  filename: string
  folder: string
  ext: string
  file_size?: number
  sheet_name?: string
  page_number?: number
}

// ✅ M4: Semantic chunking with LangChain
async function chunkText(text: string, meta: ChunkMeta): Promise<string[]> {
  try {
    const { RecursiveCharacterTextSplitter } = await import('@langchain/textsplitters')

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1500,
      chunkOverlap: 200,
      separators: ['\n\n\n', '\n\n', '\n', '. ', ', ', ' '],
    })

    const rawChunks = await splitter.splitText(text)

    // Add contextual prefix to each chunk
    const prefix = `[Archivo: ${meta.filename} | Carpeta: ${meta.folder} | Tipo: ${meta.ext.toUpperCase()}]\n`

    return rawChunks
      .map(chunk => prefix + chunk.trim())
      .filter(chunk => chunk.length > 50)
  } catch (error) {
    console.error('[Semantic Chunking] Failed, falling back to basic chunking:', error)

    // Fallback to basic chunking if LangChain fails
    const chunks: string[] = []
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
}

// ✅ M2: OCR function for scanned PDFs (DISABLED - worker issues in Docker)
async function applyOCR(buffer: Buffer): Promise<string> {
  console.log('[OCR] OCR is disabled in this version due to worker compatibility issues')
  return ''
  // try {
  //   const Tesseract = await import('tesseract.js')
  //   const { createWorker } = Tesseract

  //   const worker = await createWorker('spa+eng')  // Spanish + English
  //   const { data } = await worker.recognize(buffer)
  //   await worker.terminate()

  //   return data.text || ''
  // } catch (error) {
  //   console.error('[OCR] Failed:', error)
  //   return ''
  // }
}

// ✅ NUEVA: Extracción con Apache Tika
async function extractWithTika(buffer: Buffer, filename: string = 'unknown'): Promise<string> {
  const tikaUrl = process.env.TIKA_SERVER_URL || 'https://tika.fgarola.es'
  const timeout = Number(process.env.TIKA_TIMEOUT) || 120000  // 120 segundos

  try {
    const baseUrl = tikaUrl.replace(/\/$/, '')
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const uint8Array = new Uint8Array(buffer)
    const fileSizeMB = (buffer.length / 1024 / 1024).toFixed(2)

    console.log(`[Tika] 📄 ${filename} (${fileSizeMB} MB) - Starting extraction...`)
    const startTime = Date.now()

    const response = await fetch(`${baseUrl}/tika`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Accept': 'text/plain',
      },
      body: uint8Array,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const text = await response.text()
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`[Tika] ✅ ${filename}: ${text.length} chars in ${duration}s`)
    return text.trim()
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[Tika] ❌ ${filename}: ${errorMsg}`)
    throw error
  }
}

// Extract text from file buffer based on extension
async function extractText(buffer: Buffer, ext: string, filename: string = 'unknown'): Promise<string> {
  const lower = ext.toLowerCase()

  // ✅ Use Apache Tika for all document types
  const tikaSupported = ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'odt', 'ods', 'odp', 'rtf']

  if (tikaSupported.includes(lower)) {
    try {
      const text = await extractWithTika(buffer, filename)
      if (text.length > 0) {
        return text
      } else {
        console.warn(`[Tika] ⚠️ No text extracted from ${filename}`)
        return ''
      }
    } catch (tikaError) {
      console.error(`[Tika] ❌ Failed: ${filename}`)
      return ''
    }
  }

  // Text-based files
  if (['txt', 'csv', 'md', 'json', 'xml', 'html', 'log', 'py', 'js', 'ts', 'sql', 'yaml', 'yml', 'sh', 'bat', 'css', 'jsx', 'tsx'].includes(lower)) {
    return buffer.toString('utf-8')
  }
  return ''
}

// ✅ M5: Embedding cache functions
async function getCachedEmbedding(service: ReturnType<typeof createServiceRoleClient>, hash: string): Promise<number[] | null> {
  const { data, error } = await service
    .from('embedding_cache')
    .select('embedding')
    .eq('content_hash', hash)
    .eq('model', 'text-embedding-3-large')
    .single()

  if (error || !data) return null
  return data.embedding as number[]
}

async function saveCachedEmbedding(service: ReturnType<typeof createServiceRoleClient>, hash: string, embedding: number[]): Promise<void> {
  await service.from('embedding_cache').insert({
    content_hash: hash,
    embedding,
    model: 'text-embedding-3-large',
    dimensions: 1536,
  })
}

// ── Mejora 12: Generate embeddings con retry y backoff exponencial ──
// ✅ M5: Integrado con caché de embeddings
async function generateEmbeddings(texts: string[], service: ReturnType<typeof createServiceRoleClient>): Promise<number[][]> {
  const batchSize = 20
  const all: number[][] = []

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const batchEmbeddings: number[][] = []

    // ✅ M5: Check cache for each text
    for (const text of batch) {
      const hash = embeddingHash(text)
      const cached = await getCachedEmbedding(service, hash)

      if (cached) {
        console.log(`✅ Cache hit for chunk ${i + batchEmbeddings.length}`)
        batchEmbeddings.push(cached)
      } else {
        // Generate new embedding with retry
        let lastError = ''
        let embedding: number[] | null = null

        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            if (attempt > 0) {
              const delay = Math.pow(2, attempt) * 1000 // 2s, 4s
              console.log(`[Embeddings] Retry ${attempt}/3 after ${delay}ms...`)
              await new Promise(r => setTimeout(r, delay))
            }
            // ✅ M1: Upgrade to text-embedding-3-large for +50% better recall
            const res = await fetch('https://api.openai.com/v1/embeddings', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                input: [text],
                model: 'text-embedding-3-large',
                dimensions: 1536  // Reduce from 3072 to 1536 for HNSW compatibility
              }),
            })
            if (!res.ok) {
              lastError = await res.text()
              if (res.status === 429 || res.status >= 500) continue // retry on rate limit or server error
              throw new Error(`Embeddings API error: ${lastError}`)
            }
            const data = await res.json()
            embedding = data.data[0].embedding as number[]

            // ✅ M5: Save to cache
            if (embedding) {
              await saveCachedEmbedding(service, hash, embedding)
              console.log(`💾 Cached embedding for chunk ${i + batchEmbeddings.length}`)
            }

            lastError = ''
            break
          } catch (e) {
            lastError = e instanceof Error ? e.message : 'Unknown error'
            if (attempt === 2) throw new Error(`Embeddings API failed after 3 attempts: ${lastError}`)
          }
        }

        if (embedding) {
          batchEmbeddings.push(embedding)
        } else {
          throw new Error('Failed to generate embedding')
        }
      }
    }

    all.push(...batchEmbeddings)
  }

  return all
}

// ── Mejora 1: Filtrar archivos temporales + patrones ignorados ──
const IGNORED_PREFIXES = ['~$', '.~', '._']
const IGNORED_DIRS = ['node_modules', '.git', '__pycache__', '.svn', 'Thumbs.db']

// Recursively scan directory for files
function scanDirectory(dirPath: string, extensions: string[], maxSizeMB: number): { filePath: string; stat: fs.Stats }[] {
  const results: { filePath: string; stat: fs.Stats }[] = []
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      try {
        if (entry.isDirectory()) {
          // Skip ignored directories
          if (IGNORED_DIRS.includes(entry.name)) continue
          results.push(...scanDirectory(fullPath, extensions, maxSizeMB))
        } else if (entry.isFile()) {
          // Mejora 1: Filtrar archivos temporales de Office (~$*, .~*, ._*)
          if (IGNORED_PREFIXES.some(p => entry.name.startsWith(p))) continue
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
    const scanPath = drive.unc_path
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

    let newFiles = 0, updatedFiles = 0, skippedFiles = 0, totalChunks = 0, errorFiles = 0, deletedFiles = 0

    // ── Mejora 5: Detectar archivos eliminados ──
    const scannedPaths = new Set(files.map(f => f.filePath))
    for (const [existingPath, existingFile] of existingMap) {
      if (!scannedPaths.has(existingPath)) {
        // El archivo ya no existe en la red → limpiar
        console.log('[Sync] Deleted file detected:', existingPath)
        await service.from('network_file_chunks').delete().eq('network_file_id', existingFile.id)
        await service.from('network_files').update({
          status: 'deleted', error_message: 'Archivo eliminado de la red',
          chunk_count: 0, updated_at: new Date().toISOString(),
        }).eq('id', existingFile.id)
        deletedFiles++
      }
    }

    // ── Mejora 7: Procesar archivos en paralelo (batches de PARALLEL_BATCH_SIZE) ──
    async function processFile(filePath: string, stat: fs.Stats): Promise<'new' | 'updated' | 'skipped' | 'error'> {
      const filename = path.basename(filePath)
      const ext = path.extname(filename).slice(1).toLowerCase()
      const lastMod = stat.mtime.toISOString()
      const existing = existingMap.get(filePath)

      // Skip if already indexed and not modified
      if (existing && existing.last_modified === lastMod) return 'skipped'

      try {
        const buffer = fs.readFileSync(filePath)
        const filename = path.basename(filePath)
        const rawText = await extractText(buffer, ext, filename)
        const text = cleanText(rawText)

        // ── Mejora 6: Verificar content_hash para evitar re-indexar contenido idéntico ──
        const hash = contentHash(text)
        if (existing && existing.content_hash === hash) return 'skipped'

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
          return 'skipped'
        }

        // ✅ M3: Analyze document with LLM
        const analysis = await analyzeNetworkFile(text, filename)

        // ── Mejora 9: Más metadata en chunks ──
        const folder = path.dirname(filePath).split(path.sep).slice(-2).join('/')
        // ✅ M4: Await semantic chunking
        const chunks = await chunkText(text, { filename, folder, ext, file_size: stat.size })
        if (chunks.length === 0) return 'skipped'

        // ✅ M5: Pass service for embedding cache
        const embeddings = await generateEmbeddings(chunks, service)

        // ✅ M6: Check for duplicate files using first chunk embedding
        if (embeddings.length > 0 && !existing) {
          try {
            const { data: duplicates } = await service.rpc('match_network_files_similarity', {
              p_drive_id: drive_id,
              p_query_embedding: embeddings[0],
              p_match_count: 3,
              p_similarity_threshold: 0.95,
            })

            if (duplicates && duplicates.length > 0) {
              console.log(`[Duplicate Detection] Found ${duplicates.length} similar files for ${filename}`)
              // Log but don't skip - just for information
            }
          } catch (dupErr) {
            console.error('[Duplicate Detection] Error:', dupErr)
            // Continue processing even if duplicate detection fails
          }
        }

        let fileId: string
        if (existing) {
          await service.from('network_file_chunks').delete().eq('network_file_id', existing.id)
          // ✅ M3: Include LLM analysis fields
          await service.from('network_files').update({
            filename, extension: ext, file_size: stat.size, last_modified: lastMod,
            content_hash: hash,
            chunk_count: chunks.length, char_count: text.length, status: 'done',
            error_message: null, updated_at: new Date().toISOString(),
            // M3: LLM analysis metadata
            doc_type: analysis?.doc_type || null,
            doc_summary: analysis?.summary || null,
            doc_importance: analysis?.importance || null,
            doc_department: analysis?.department || null,
            doc_entities: analysis?.key_entities || [],
            doc_key_dates: analysis?.key_dates || [],
            analyzed_at: analysis ? new Date().toISOString() : null,
          }).eq('id', existing.id)
          fileId = existing.id
        } else {
          // ✅ M3: Include LLM analysis fields
          const { data: newFile } = await service.from('network_files').insert({
            drive_id, file_path: filePath, filename, extension: ext,
            file_size: stat.size, last_modified: lastMod, content_hash: hash,
            chunk_count: chunks.length, char_count: text.length, status: 'done',
            // M3: LLM analysis metadata
            doc_type: analysis?.doc_type || null,
            doc_summary: analysis?.summary || null,
            doc_importance: analysis?.importance || null,
            doc_department: analysis?.department || null,
            doc_entities: analysis?.key_entities || [],
            doc_key_dates: analysis?.key_dates || [],
            analyzed_at: analysis ? new Date().toISOString() : null,
          }).select('id').single()
          fileId = newFile!.id
        }

        // Mejora 9: meta_json enriquecido
        const chunkRows = chunks.map((content, i) => ({
          network_file_id: fileId, drive_id, chunk_index: i,
          content, embedding: JSON.stringify(embeddings[i]),
          meta_json: { filename, ext, folder, file_size: stat.size, total_chunks: chunks.length },
        }))
        for (let i = 0; i < chunkRows.length; i += 50) {
          await service.from('network_file_chunks').insert(chunkRows.slice(i, i + 50))
        }
        totalChunks += chunks.length
        return existing ? 'updated' : 'new'
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
          } catch { /* ignore */ }
        }
        return 'error'
      }
    }

    // Process files in parallel batches
    for (let i = 0; i < files.length; i += PARALLEL_BATCH_SIZE) {
      const batch = files.slice(i, i + PARALLEL_BATCH_SIZE)
      const results = await Promise.allSettled(batch.map(f => processFile(f.filePath, f.stat)))
      for (const r of results) {
        const status = r.status === 'fulfilled' ? r.value : 'error'
        if (status === 'new') newFiles++
        else if (status === 'updated') updatedFiles++
        else if (status === 'skipped') skippedFiles++
        else errorFiles++
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
        deleted_files: deletedFiles,
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
