import * as fs from 'fs'
import * as path from 'path'
import { pathToFileURL } from 'url'
import type { SupabaseClient } from '@supabase/supabase-js'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import * as crypto from 'crypto'

export interface IngestFileRecord {
  id: string
  user_id: string
  project_id: string | null
  storage_path: string
  filename: string
  mime: string | null
  meta_json?: Record<string, unknown> | null
  file_version?: number | null
}

export interface IngestOptions {
  forceOcr?: boolean
  forceReindex?: boolean
  skipLlmAnalysis?: boolean
}

export interface IngestResult {
  chunks: number
  chars: number
  pages: number | null
  metadata: Record<string, unknown>
  ocrApplied: boolean
  llmAnalysis?: DocumentAnalysis | null
}

export interface DocumentAnalysis {
  doc_type: string
  summary: string
  key_entities: string[]
  key_dates: string[]
  department: string | null
  language: string
  importance: 'critical' | 'important' | 'normal' | 'low'
}

export interface DocAnalysisConfig {
  extraction_engine: 'pdf-parse' | 'tika' | 'hybrid'
  tika_server_url: string
  tika_timeout: number
  embedding_model: string
  embedding_dimensions: number
  embedding_batch_size: number
  chunk_size: number
  chunk_overlap: number
  chunking_strategy: 'fixed' | 'semantic'
  ocr_enabled: boolean
  ocr_languages: string
  ocr_min_text_length: number
  llm_analysis_enabled: boolean
  llm_analysis_model: string
  llm_analysis_temperature: number
  embedding_cache_enabled: boolean
  retry_enabled: boolean
  retry_attempts: number
  retry_backoff_ms: number
}

const CHUNK_SIZE = 1500  // Increased from 1000
const CHUNK_OVERLAP = 200
const EMBEDDING_MODEL = 'text-embedding-3-large'  // Upgraded from text-embedding-3-small
const EMBEDDING_DIMENSIONS = 1536  // Using 1536 dims (HNSW index limit is 2000)
// Note: text-embedding-3-large with 1536 dims is better quality than text-embedding-3-small
let isPdfWorkerConfigured = false

function ensurePdfParseWorker(pdfModule: typeof import('pdf-parse')) {
  if (isPdfWorkerConfigured) return
  const workerPath = path.join(process.cwd(), 'node_modules', 'pdf-parse', 'dist', 'worker', 'pdf.worker.mjs')
  if (fs.existsSync(workerPath)) {
    pdfModule.PDFParse.setWorker(pathToFileURL(workerPath).href)
  }
  isPdfWorkerConfigured = true
}

// ✅ MEJORA #5: Chunking Semántico con LangChain
async function chunkText(text: string): Promise<string[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
    separators: [
      '\n\n\n',      // Secciones
      '\n\n',        // Párrafos
      '\n',          // Líneas
      '. ',          // Frases
      ', ',          // Cláusulas
      ' ',           // Palabras (último recurso)
      ''
    ],
    lengthFunction: (text: string) => text.length,
  })

  const chunks = await splitter.splitText(text)
  return chunks.filter(chunk => chunk.trim().length > 50)
}

function normalizeText(raw: string): string {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^ +| +$/gm, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .trim()
}

function detectLanguage(text: string): string {
  const sample = text.slice(0, 8000).toLowerCase()
  if (!sample) return 'unknown'
  const esMarkers = [' el ', ' la ', ' de ', ' que ', ' para ', ' con ', ' y ', ' del ']
  const caMarkers = [' el ', ' la ', ' de ', ' que ', ' per ', ' amb ', ' i ', ' dels ', ' les ']
  const enMarkers = [' the ', ' and ', ' of ', ' to ', ' for ', ' with ', ' in ']

  const score = (markers: string[]) => markers.reduce((acc, marker) => acc + (sample.split(marker).length - 1), 0)
  const es = score(esMarkers)
  const ca = score(caMarkers)
  const en = score(enMarkers)

  if (es >= ca && es >= en) return 'es'
  if (ca > es && ca >= en) return 'ca'
  if (en > es && en > ca) return 'en'
  return 'unknown'
}

function detectDepartment(text: string): string | null {
  const sample = text.slice(0, 6000)
  const patterns = [
    /(?:departamento|department|departament|area|área)\s*[:\-]\s*([^\n]{2,80})/i,
    /(?:equipo|team|unitat)\s*[:\-]\s*([^\n]{2,80})/i,
  ]
  for (const pattern of patterns) {
    const match = sample.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return null
}

function detectTitle(text: string, fallback: string): string {
  const firstLines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
  const heading = firstLines.find((line) => line.length >= 6 && line.length <= 140)
  return heading || fallback
}

export interface ExtractedTextResult {
  text: string
  pages: number | null
  metadata: Record<string, unknown>
  ocrApplied: boolean
}

// ✅ MEJORA #6: Caché de Embeddings
function contentHash(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

async function getCachedEmbedding(
  serviceClient: SupabaseClient,
  hash: string
): Promise<number[] | null> {
  const { data, error } = await serviceClient
    .from('embedding_cache')
    .select('embedding')
    .eq('content_hash', hash)
    .eq('model', EMBEDDING_MODEL)
    .single()

  if (error || !data) return null
  return data.embedding as number[]
}

async function saveCachedEmbedding(
  serviceClient: SupabaseClient,
  hash: string,
  embedding: number[]
): Promise<void> {
  await serviceClient.from('embedding_cache').insert({
    content_hash: hash,
    embedding,
    model: EMBEDDING_MODEL,
  })
}

// ✅ MEJORA #2: OCR Automático para PDFs escaneados
async function applyOCR(buffer: Buffer): Promise<string> {
  try {
    const Tesseract = await import('tesseract.js')
    const { createWorker } = Tesseract

    const worker = await createWorker('spa+eng')  // Spanish + English
    const { data } = await worker.recognize(buffer)
    await worker.terminate()

    return data.text || ''
  } catch (error) {
    console.error('OCR failed:', error)
    return ''
  }
}

// ✅ NUEVA: Extracción con Apache Tika
async function extractWithTika(
  buffer: Buffer,
  tikaServerUrl: string,
  timeout: number
): Promise<{ text: string; metadata: Record<string, unknown> }> {
  try {
    // Normalize URL: remove trailing slash
    const baseUrl = tikaServerUrl.replace(/\/$/, '')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      // Convert Buffer to Uint8Array for fetch
      const uint8Array = new Uint8Array(buffer)

      // Extract text using Tika's /tika endpoint
      const textResponse = await fetch(`${baseUrl}/tika`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Accept': 'text/plain',
        },
        body: uint8Array,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!textResponse.ok) {
        throw new Error(`Tika HTTP ${textResponse.status}: ${textResponse.statusText}`)
      }

      const text = await textResponse.text()

      // Extract metadata using Tika's /meta endpoint
      const metaController = new AbortController()
      const metaTimeoutId = setTimeout(() => metaController.abort(), timeout)

      const metaResponse = await fetch(`${baseUrl}/meta`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Accept': 'application/json',
        },
        body: uint8Array,
        signal: metaController.signal,
      })

      clearTimeout(metaTimeoutId)

      let metadata: Record<string, unknown> = {}
      if (metaResponse.ok) {
        metadata = await metaResponse.json()
      }

      console.log(`✅ Tika extraction: ${text.length} chars, ${Object.keys(metadata).length} metadata fields`)

      return { text, metadata }
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        throw new Error(`Tika timeout after ${timeout}ms`)
      }
      throw fetchError
    }
  } catch (error) {
    console.error('Tika extraction failed:', error)
    throw error
  }
}

// ✅ MEJORA #4: Análisis LLM de Documentos
async function analyzeDocumentWithLLM(
  text: string,
  filename: string
): Promise<DocumentAnalysis | null> {
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
      console.error('LLM analysis failed:', await response.text())
      return null
    }

    const data = await response.json()
    const analysis = JSON.parse(data.choices[0].message.content)

    return {
      doc_type: analysis.doc_type || 'otro',
      summary: analysis.summary || '',
      key_entities: Array.isArray(analysis.key_entities) ? analysis.key_entities.slice(0, 5) : [],
      key_dates: Array.isArray(analysis.key_dates) ? analysis.key_dates.slice(0, 3) : [],
      department: analysis.department || null,
      language: analysis.language || 'unknown',
      importance: ['critical', 'important', 'normal', 'low'].includes(analysis.importance)
        ? analysis.importance
        : 'normal',
    }
  } catch (error) {
    console.error('LLM analysis error:', error)
    return null
  }
}

export async function extractTextAndMetadata(
  buffer: Buffer,
  mime: string,
  filename: string,
  options: IngestOptions,
  config?: DocAnalysisConfig
): Promise<ExtractedTextResult> {
  const mimeLower = (mime || '').toLowerCase()
  const nameLower = (filename || '').toLowerCase()
  const metadata: Record<string, unknown> = {}

  // ✅ MEJORA #2: OCR Automático para PDFs con soporte para Tika
  if (mimeLower === 'application/pdf' || nameLower.endsWith('.pdf')) {
    let text = ''
    let pages: number | null = null
    let author: string | null = null
    let title: string | null = null
    let createdRaw: string | null = null
    let ocrApplied = false

    // Check if we should use Tika
    const useTika = config?.extraction_engine === 'tika' || config?.extraction_engine === 'hybrid'

    if (useTika && config) {
      // Try Tika extraction
      try {
        console.log(`🔧 Usando Apache Tika para extracción (${config.extraction_engine} mode)...`)
        const tikaResult = await extractWithTika(buffer, config.tika_server_url, config.tika_timeout)
        text = tikaResult.text

        // Merge Tika metadata
        Object.assign(metadata, tikaResult.metadata)

        // Extract common fields from Tika metadata
        if (tikaResult.metadata['dc:creator']) author = String(tikaResult.metadata['dc:creator'])
        if (tikaResult.metadata['dc:title']) title = String(tikaResult.metadata['dc:title'])
        if (tikaResult.metadata['dcterms:created']) createdRaw = String(tikaResult.metadata['dcterms:created'])
        if (tikaResult.metadata['xmpTPg:NPages']) pages = Number(tikaResult.metadata['xmpTPg:NPages'])

        console.log(`✅ Tika extraction: ${text.length} chars`)

        // If hybrid mode and Tika failed to extract enough text, fall back to pdf-parse
        if (config.extraction_engine === 'hybrid' && text.trim().length < 100) {
          console.log('⚠️ Tika extraction insufficient, falling back to pdf-parse...')
          throw new Error('Insufficient text from Tika, falling back')
        }
      } catch (tikaError) {
        if (config.extraction_engine === 'tika') {
          // In tika-only mode, throw the error
          throw tikaError
        }
        // In hybrid mode, fall back to pdf-parse
        console.warn('⚠️ Tika extraction failed, using pdf-parse fallback:', tikaError)
      }
    }

    // Use pdf-parse if not using Tika or if Tika failed in hybrid mode
    if (!useTika || (config?.extraction_engine === 'hybrid' && text.trim().length < 100)) {
      try {
        const pdfModule = await import('pdf-parse')
        ensurePdfParseWorker(pdfModule)
        const parser = new pdfModule.PDFParse({ data: buffer })
        const result = await parser.getText()
        await parser.destroy()
        text = String(result?.text || '')
        pages = Number.isFinite(result?.total) ? Number(result.total) : null
        const info = (result as unknown as { info?: Record<string, unknown> })?.info || {}
        author = typeof info.Author === 'string' ? info.Author : null
        title = typeof info.Title === 'string' ? info.Title : null
        createdRaw = typeof info.CreationDate === 'string' ? info.CreationDate : null
      } catch (modernErr) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const legacy = require('pdf-parse')
        const legacyParser = typeof legacy === 'function' ? legacy : legacy?.default
        if (typeof legacyParser !== 'function') throw modernErr
        const data = await legacyParser(buffer)
        text = String(data?.text || '')
        pages = Number.isFinite(data?.numpages) ? Number(data.numpages) : null
        author = typeof data?.info?.Author === 'string' ? data.info.Author : null
        title = typeof data?.info?.Title === 'string' ? data.info.Title : null
        createdRaw = typeof data?.info?.CreationDate === 'string' ? data.info.CreationDate : null
      }
    }

    // ✅ MEJORA #2: Detectar PDF escaneado y aplicar OCR
    const ocrEnabled = config?.ocr_enabled ?? true
    const ocrMinLength = config?.ocr_min_text_length ?? 100

    if (ocrEnabled && (options.forceOcr || text.trim().length < ocrMinLength)) {
      console.log(`📸 PDF escaneado detectado (${text.length} chars), aplicando OCR...`)
      const ocrText = await applyOCR(buffer)
      if (ocrText.length > text.length) {
        text = ocrText
        ocrApplied = true
        console.log(`✅ OCR completado: ${ocrText.length} caracteres extraídos`)
      }
    }

    const normalizedText = normalizeText(text)

    if (author) metadata.author = author
    if (title) metadata.title = title
    if (createdRaw) metadata.source_created_at = createdRaw

    return { text: normalizedText, pages, metadata, ocrApplied }
  }

  if (mimeLower === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || nameLower.endsWith('.docx')) {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return {
      text: normalizeText(result.value || ''),
      pages: null,
      metadata,
      ocrApplied: false,
    }
  }

  if (
    mimeLower === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeLower === 'application/vnd.ms-excel' ||
    nameLower.endsWith('.xlsx') ||
    nameLower.endsWith('.xls')
  ) {
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(buffer, { type: 'buffer', raw: false, cellDates: true })
    let text = ''
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ' | ', RS: '\n' })
      text += `\n--- Hoja: ${sheetName} ---\n${csv}\n`
    }
    const props = workbook.Props || {}
    if (props.Author) metadata.author = String(props.Author)
    if (props.Title) metadata.title = String(props.Title)
    if (props.CreatedDate) metadata.source_created_at = String(props.CreatedDate)
    if (props.Company) metadata.department = String(props.Company)
    return {
      text: normalizeText(text),
      pages: null,
      metadata,
      ocrApplied: false,
    }
  }

  if (
    mimeLower.startsWith('text/') ||
    ['application/json', 'application/xml', 'application/javascript', 'application/x-yaml', 'application/yaml'].includes(mimeLower)
  ) {
    return { text: normalizeText(buffer.toString('utf-8')), pages: null, metadata, ocrApplied: false }
  }

  if (filename.match(/\.(txt|md|csv|log|py|js|ts|jsx|tsx|html|css|sql|yaml|yml|json|xml|sh|bat)$/i)) {
    return { text: normalizeText(buffer.toString('utf-8')), pages: null, metadata, ocrApplied: false }
  }

  throw new Error(`Unsupported file type: ${mime || filename}`)
}

// ✅ MEJORA #3: Retry con Backoff + MEJORA #6: Caché de Embeddings
async function generateEmbeddings(
  texts: string[],
  serviceClient: SupabaseClient
): Promise<number[][]> {
  const batchSize = 20
  const allEmbeddings: number[][] = []

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const batchEmbeddings: number[][] = []

    // Check cache for each text in batch
    for (const text of batch) {
      const hash = contentHash(text)
      const cached = await getCachedEmbedding(serviceClient, hash)

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
              const delay = Math.pow(2, attempt) * 1000  // 2s, 4s
              console.log(`⏳ Retry attempt ${attempt + 1} after ${delay}ms...`)
              await new Promise(resolve => setTimeout(resolve, delay))
            }

            const res = await fetch('https://api.openai.com/v1/embeddings', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                input: [text],
                model: EMBEDDING_MODEL,
                dimensions: EMBEDDING_DIMENSIONS,  // Request 1536 dims from text-embedding-3-large
              }),
            })

            if (!res.ok) {
              lastError = await res.text()
              // Retry on rate limit or server errors
              if (res.status === 429 || res.status >= 500) {
                console.log(`⚠️ API error ${res.status}, retrying...`)
                continue
              }
              throw new Error(`Embeddings API error: ${lastError}`)
            }

            const data = await res.json()
            embedding = data.data[0].embedding as number[]

            // Save to cache
            if (embedding) {
              await saveCachedEmbedding(serviceClient, hash, embedding)
              console.log(`💾 Cached embedding for chunk ${i + batchEmbeddings.length}`)
            }
            break
          } catch (e) {
            if (attempt === 2) throw e
            lastError = String(e)
          }
        }

        if (!embedding) {
          throw new Error(`Failed to generate embedding after 3 attempts: ${lastError}`)
        }

        batchEmbeddings.push(embedding)
      }
    }

    allEmbeddings.push(...batchEmbeddings)
  }

  return allEmbeddings
}

function buildMetadata(
  file: IngestFileRecord,
  text: string,
  pages: number | null,
  sourceMeta: Record<string, unknown>,
  ocrApplied: boolean,
  chunks: number
): Record<string, unknown> {
  const language = detectLanguage(text)
  const department = detectDepartment(text)
  const filename = file.filename || 'archivo'

  const metadata: Record<string, unknown> = {
    ...(file.meta_json || {}),
    pages,
    chunk_count: chunks,
    char_count: text.length,
    word_count: text.split(/\s+/).filter(Boolean).length,
    detected_language: language,
    department: department || sourceMeta.department || null,
    title: sourceMeta.title || detectTitle(text, filename),
    author: sourceMeta.author || null,
    source_created_at: sourceMeta.source_created_at || null,
    ocr_applied: ocrApplied,
    indexed_at: new Date().toISOString(),
  }

  return metadata
}

export async function ingestFileForRag(
  serviceClient: SupabaseClient,
  file: IngestFileRecord,
  options: IngestOptions = {}
): Promise<IngestResult> {
  const processingPayload: Record<string, unknown> = { ingest_status: 'processing', ingest_error: null }
  await serviceClient.from('files').update(processingPayload).eq('id', file.id)

  // Load document analysis configuration
  let config: DocAnalysisConfig | undefined
  try {
    const { data: configData } = await serviceClient
      .from('doc_analysis_config')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (configData) {
      config = {
        extraction_engine: configData.extraction_engine,
        tika_server_url: configData.tika_server_url,
        tika_timeout: configData.tika_timeout,
        embedding_model: configData.embedding_model,
        embedding_dimensions: configData.embedding_dimensions,
        embedding_batch_size: configData.embedding_batch_size,
        chunk_size: configData.chunk_size,
        chunk_overlap: configData.chunk_overlap,
        chunking_strategy: configData.chunking_strategy,
        ocr_enabled: configData.ocr_enabled,
        ocr_languages: configData.ocr_languages,
        ocr_min_text_length: configData.ocr_min_text_length,
        llm_analysis_enabled: configData.llm_analysis_enabled,
        llm_analysis_model: configData.llm_analysis_model,
        llm_analysis_temperature: configData.llm_analysis_temperature,
        embedding_cache_enabled: configData.embedding_cache_enabled,
        retry_enabled: configData.retry_enabled,
        retry_attempts: configData.retry_attempts,
        retry_backoff_ms: configData.retry_backoff_ms,
      }
      console.log(`📋 Usando configuración: ${config.extraction_engine} extraction engine`)
    }
  } catch (configError) {
    console.warn('⚠️ No se pudo cargar configuración, usando valores por defecto:', configError)
  }

  const { data: blob, error: downloadError } = await serviceClient.storage.from('user-files').download(file.storage_path)
  if (downloadError || !blob) {
    throw new Error(`Download error: ${downloadError?.message || 'Unknown'}`)
  }

  const buffer = Buffer.from(await blob.arrayBuffer())
  const extracted = await extractTextAndMetadata(buffer, file.mime || '', file.filename, options, config)
  if (!extracted.text || extracted.text.trim().length < 10) {
    throw new Error('No text extracted')
  }

  // ✅ MEJORA #4: Análisis LLM de Documentos
  let llmAnalysis: DocumentAnalysis | null = null
  if (!options.skipLlmAnalysis && extracted.text.length > 100) {
    console.log('🤖 Analizando documento con LLM...')
    llmAnalysis = await analyzeDocumentWithLLM(extracted.text, file.filename)
    if (llmAnalysis) {
      console.log(`✅ Análisis completado: ${llmAnalysis.doc_type} (${llmAnalysis.importance})`)
    }
  }

  // ✅ MEJORA #5: Chunking Semántico
  const chunks = await chunkText(extracted.text)
  if (chunks.length === 0) {
    throw new Error('No chunks generated')
  }
  console.log(`📝 Generados ${chunks.length} chunks semánticos`)

  // ✅ MEJORA #3 + #6: Embeddings con Retry y Caché
  const embeddings = await generateEmbeddings(chunks, serviceClient)

  await serviceClient.from('file_chunks').delete().eq('file_id', file.id)

  const chunkRows = chunks.map((content, index) => ({
    file_id: file.id,
    project_id: file.project_id,
    user_id: file.user_id,
    chunk_index: index,
    page: extracted.pages ? Math.min(Math.floor((index / chunks.length) * extracted.pages) + 1, extracted.pages) : null,
    content,
    content_hash: contentHash(content),
    embedding: embeddings[index],
    meta_json: {
      filename: file.filename,
      mime: file.mime || null,
      language: detectLanguage(content),
      chunk_chars: content.length,
    },
  }))

  for (let i = 0; i < chunkRows.length; i += 50) {
    const batch = chunkRows.slice(i, i + 50)
    const { error: insertErr } = await serviceClient.from('file_chunks').insert(batch)
    if (insertErr) throw new Error(`Insert error: ${insertErr.message}`)
  }

  const metadata = buildMetadata(
    file,
    extracted.text,
    extracted.pages,
    extracted.metadata,
    extracted.ocrApplied,
    chunks.length
  )

  // ✅ MEJORA #4: Guardar análisis LLM en la tabla files
  const updatePayload: Record<string, unknown> = {
    ingest_status: 'done',
    ingest_error: null,
    last_reindexed_at: new Date().toISOString(),
    meta_json: metadata,
  }

  if (llmAnalysis) {
    updatePayload.doc_type = llmAnalysis.doc_type
    updatePayload.doc_summary = llmAnalysis.summary
    updatePayload.doc_importance = llmAnalysis.importance
    updatePayload.doc_department = llmAnalysis.department
    updatePayload.doc_entities = llmAnalysis.key_entities
    updatePayload.doc_key_dates = llmAnalysis.key_dates
    updatePayload.analyzed_at = new Date().toISOString()
  }

  await serviceClient
    .from('files')
    .update(updatePayload)
    .eq('id', file.id)

  return {
    chunks: chunks.length,
    chars: extracted.text.length,
    pages: extracted.pages,
    metadata,
    ocrApplied: extracted.ocrApplied,
    llmAnalysis,
  }
}
