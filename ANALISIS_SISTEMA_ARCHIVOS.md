# 📊 Análisis Completo del Sistema de Archivos - GEIA

## 1️⃣ SISTEMA DE ANÁLISIS DE ARCHIVOS (Tool + Proyectos)

### 🔍 Estado Actual

#### **Archivo:** `src/lib/project-file-ingest.ts`

**Modelo de Embeddings:**
- **Modelo actual:** `text-embedding-3-small` (OpenAI)
- **Dimensiones:** 1536
- **Configuración:** `process.env.EMBEDDING_MODEL || 'text-embedding-3-small'`

**Proceso de Análisis:**

1. **Extracción de Texto** (`extractTextAndMetadata`):
   - ✅ **PDF:** `pdf-parse` (extrae texto + metadata: autor, título, fecha)
   - ✅ **DOCX:** `mammoth` (solo texto raw, sin formato)
   - ✅ **XLSX:** `xlsx` (SheetJS - convierte a CSV)
   - ✅ **Texto plano:** UTF-8 directo
   - ❌ **PPTX:** NO SOPORTADO en archivos de proyecto
   - ❌ **Imágenes:** NO SOPORTADO (sin OCR automático)

2. **Chunking** (`chunkText`):
   - **Tamaño:** 1500 caracteres (`CHUNK_SIZE`)
   - **Overlap:** 200 caracteres (`CHUNK_OVERLAP`)
   - **Breakpoints:** `\n\n`, `.\n`, `. `, `;\n`, `; `, `\n`
   - **Mínimo:** 50 caracteres por chunk

3. **Metadata Extraída:**
   ```typescript
   {
     pages, chunk_count, char_count, word_count,
     detected_language, department, title, author,
     source_created_at, ocr_applied, indexed_at
   }
   ```

4. **Generación de Embeddings:**
   - **Batch size:** 20 chunks por request
   - **Sin retry:** Si falla, falla todo
   - **Sin caché:** Regenera embeddings siempre

---

### ❌ PROBLEMAS IDENTIFICADOS

#### **P1: Extracción de Texto MUY Básica**
- **DOCX:** Solo texto raw, pierde formato, tablas, listas
- **XLSX:** CSV simple, pierde fórmulas, formato, gráficos
- **PDF:** No detecta tablas, columnas, layout
- **Sin OCR:** PDFs escaneados = 0 texto extraído

#### **P2: Chunking Ingenuo**
- No respeta estructura semántica (párrafos, secciones)
- Puede cortar tablas, listas, código a la mitad
- No añade contexto del documento al chunk

#### **P3: Metadata Pobre**
- No extrae: empresa, departamento, categoría, tags
- No detecta tipo de documento (factura, contrato, informe)
- No extrae entidades (personas, fechas, montos)

#### **P4: Sin Análisis Semántico**
- No resume el documento
- No extrae keywords/temas principales
- No clasifica el contenido

#### **P5: Modelo de Embeddings Limitado**
- `text-embedding-3-small` es el más básico
- Dimensiones 1536 (vs 3072 de `text-embedding-3-large`)
- Peor rendimiento en búsquedas complejas

---

### ✅ MEJORAS PROPUESTAS

#### **M1: Extracción Avanzada con LLM**
```typescript
// Usar GPT-4o-mini para analizar el documento
async function analyzeDocumentWithLLM(text: string, filename: string): Promise<DocumentAnalysis> {
  const prompt = `Analiza este documento y extrae:
1. Tipo de documento (factura, contrato, informe, manual, etc.)
2. Resumen ejecutivo (2-3 líneas)
3. Temas principales (keywords)
4. Entidades: personas, empresas, fechas clave, montos
5. Departamento/área (si aplica)
6. Idioma detectado
7. Nivel de confidencialidad (público, interno, confidencial)

Documento: ${filename}
Contenido: ${text.slice(0, 8000)}

Responde en JSON.`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' }
  })
  
  return JSON.parse(response.choices[0].message.content)
}
```

#### **M2: Chunking Semántico Inteligente**
```typescript
// Usar LangChain RecursiveCharacterTextSplitter
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1500,
  chunkOverlap: 200,
  separators: ['\n\n\n', '\n\n', '\n', '. ', ' ', ''],
  keepSeparator: true
})

// Añadir contexto del documento a cada chunk
const enrichedChunks = chunks.map((chunk, i) => 
  `[Documento: ${filename} | Tipo: ${docType} | Sección ${i+1}/${chunks.length}]\n${chunk}`
)
```

#### **M3: Upgrade a Embedding Model Superior**
```typescript
// Cambiar a text-embedding-3-large
model: 'text-embedding-3-large'  // 3072 dims, +50% mejor recall
```

#### **M4: OCR Automático para PDFs Escaneados**
```typescript
// Detectar si PDF tiene poco texto → aplicar OCR
if (text.length < 100 && pages > 0) {
  console.log('[OCR] PDF escaneado detectado, aplicando OCR...')
  const ocrText = await extractWithOCR(buffer)  // GPT-4o Vision
  text = ocrText
  metadata.ocr_applied = true
}
```

#### **M5: Extracción de Tablas y Estructuras**
```typescript
// Para XLSX: extraer como markdown table
const table = XLSX.utils.sheet_to_json(sheet)
const markdown = convertToMarkdownTable(table)

// Para PDF: detectar tablas con pdf-table-extractor
import { extractTables } from 'pdf-table-extractor'
const tables = await extractTables(buffer)
```

#### **M6: Caché de Embeddings**
```typescript
// Guardar hash del contenido para evitar re-generar
const contentHash = crypto.createHash('md5').update(text).digest('hex')
const cached = await getCachedEmbedding(contentHash)
if (cached) return cached
```

#### **M7: Retry con Backoff Exponencial**
```typescript
async function generateEmbeddingsWithRetry(texts: string[]): Promise<number[][]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await generateEmbeddings(texts)
    } catch (e) {
      if (attempt === 2) throw e
      await sleep(Math.pow(2, attempt) * 1000)
    }
  }
}
```

---

## 2️⃣ FRASES CLAVE DE GENERACIÓN DE DOCUMENTOS

### 📍 Ubicación: `src/components/chat/ChatInput.tsx` (líneas 323-348)

### ❌ PROBLEMA: Auto-activación agresiva

**Frases que activan Document Generation:**
```typescript
'hazme un documento', 'genera un documento', 'crea un documento',
'redacta un documento', 'hazme un pdf', 'genera un pdf',
'crear pdf', 'hazme un word', 'genera un word',
'hazme un docx', 'hazme un excel', 'genera un excel',
'hazme un xlsx', 'genera un markdown',
'generate a document', 'create a document',
'generate a pdf', 'create a pdf',
'generate a word', 'generate an excel'
```

### ✅ SOLUCIÓN: Eliminar auto-activación

**Opción 1: Comentar todo el bloque** (líneas 323-348)
```typescript
// Document generation keywords - DESACTIVADO
// if (!autoDocumentGeneration && (...)) {
//   autoDocumentGeneration = true
// }
```

**Opción 2: Hacer más restrictivo** (solo activar con "GENERA DOCUMENTO:")
```typescript
if (!autoDocumentGeneration && lowerText.startsWith('genera documento:')) {
  autoDocumentGeneration = true
}
```

---

## 3️⃣ SISTEMA DE ANÁLISIS DE UNIDAD DE RED

### 🔍 Estado Actual

#### **Archivo:** `src/app/api/admin/network-drives/sync/route.ts`

**Mejoras ya implementadas:**
- ✅ Mejora 1: Filtrar archivos temporales de Office (~$*, .~*, ._*)
- ✅ Mejora 3: Extracción PPTX con `officeparser`
- ✅ Mejora 5: Detectar archivos eliminados
- ✅ Mejora 6: Content hash para evitar re-indexar
- ✅ Mejora 7: Procesamiento paralelo (batches de 5)
- ✅ Mejora 9: Metadata enriquecida en chunks (carpeta, tipo, tamaño)
- ✅ Mejora 12: Retry con backoff exponencial en embeddings

**Proceso actual:**

1. **Escaneo de archivos:**
   - Recursivo en subdirectorios
   - Filtro por extensiones: `['pdf', 'docx', 'xlsx', 'txt', 'csv', 'md']`
   - Límite de tamaño: 50MB por defecto
   - Ignora: `node_modules`, `.git`, `$RECYCLE.BIN`, etc.

2. **Extracción de texto:**
   - ✅ PDF, DOCX, XLSX, PPTX, TXT, CSV, MD, JSON, XML, HTML, código
   - ✅ Soporta más formatos que archivos de proyecto

3. **Chunking con contexto:**
   ```typescript
   const prefix = `[Archivo: ${filename} | Carpeta: ${folder} | Tipo: ${ext}]\n`
   ```

4. **Embeddings:**
   - Modelo: `text-embedding-3-small`
   - Batch size: 20
   - Retry: 3 intentos con backoff

---

### ❌ PROBLEMAS IDENTIFICADOS

#### **P1: Sin Análisis de Contenido**
- No detecta tipo de documento
- No extrae metadata semántica
- No resume archivos largos

#### **P2: Chunking Básico**
- Mismo problema que archivos de proyecto
- No respeta estructura del documento

#### **P3: Sin Priorización**
- Todos los archivos tienen la misma importancia
- No detecta archivos críticos (contratos, facturas)

#### **P4: Sin Detección de Duplicados**
- Puede indexar el mismo archivo en múltiples carpetas
- No detecta versiones (v1, v2, final, final_final)

#### **P5: Sin Análisis de Relaciones**
- No detecta archivos relacionados
- No agrupa por proyecto/tema

#### **P6: Sincronización Lenta**
- Procesa archivos de 5 en 5
- No usa caché de embeddings
- Re-procesa archivos sin cambios

---

### ✅ MEJORAS PROPUESTAS PARA NETWORK DRIVES

#### **M1: Análisis Inteligente con LLM**
```typescript
async function analyzeNetworkFile(text: string, meta: FileMeta): Promise<FileAnalysis> {
  const prompt = `Analiza este archivo de red empresarial:

Archivo: ${meta.filename}
Carpeta: ${meta.folder}
Tamaño: ${formatBytes(meta.size)}

Contenido (primeros 8000 chars):
${text.slice(0, 8000)}

Extrae:
1. Tipo de documento (contrato, factura, informe, manual, política, etc.)
2. Departamento/área responsable
3. Nivel de importancia (crítico, importante, normal, archivo)
4. Temas/keywords principales (máx 5)
5. Resumen ejecutivo (2-3 líneas)
6. Fecha del documento (si aparece)
7. Personas/empresas mencionadas
8. ¿Es una versión antigua? (detectar "v1", "draft", "borrador")

JSON:`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.3
  })

  return JSON.parse(response.choices[0].message.content)
}
```

#### **M2: Detección de Duplicados Inteligente**
```typescript
// Calcular similarity entre archivos
async function detectDuplicates(fileId: string, text: string): Promise<string[]> {
  const embedding = await generateEmbedding(text.slice(0, 2000))

  const { data: similar } = await supabase.rpc('match_network_files_similarity', {
    query_embedding: embedding,
    match_threshold: 0.95,  // 95% similar = duplicado
    match_count: 5
  })

  return similar.map(f => f.file_id)
}
```

#### **M3: Priorización Automática**
```typescript
function calculateFilePriority(analysis: FileAnalysis, meta: FileMeta): number {
  let score = 50  // base

  // Tipo de documento
  if (analysis.doc_type === 'contrato') score += 30
  if (analysis.doc_type === 'factura') score += 25
  if (analysis.doc_type === 'informe') score += 15

  // Importancia declarada
  if (analysis.importance === 'crítico') score += 20
  if (analysis.importance === 'importante') score += 10

  // Recencia
  const age = Date.now() - new Date(meta.last_modified).getTime()
  if (age < 30 * 24 * 60 * 60 * 1000) score += 15  // < 30 días

  // Penalizar versiones antiguas
  if (analysis.is_old_version) score -= 30

  return Math.max(0, Math.min(100, score))
}
```

#### **M4: Chunking Jerárquico**
```typescript
// Crear chunks a múltiples niveles
async function createHierarchicalChunks(text: string, meta: FileMeta) {
  // Nivel 1: Resumen del documento completo
  const summary = await summarizeDocument(text)

  // Nivel 2: Chunks de secciones (3000 chars)
  const sectionChunks = chunkText(text, 3000, 300)

  // Nivel 3: Chunks detallados (1500 chars)
  const detailChunks = chunkText(text, 1500, 200)

  return {
    summary_chunk: { content: summary, level: 'summary' },
    section_chunks: sectionChunks.map(c => ({ content: c, level: 'section' })),
    detail_chunks: detailChunks.map(c => ({ content: c, level: 'detail' }))
  }
}
```

#### **M5: Caché de Embeddings Persistente**
```typescript
// Guardar embeddings en tabla separada
CREATE TABLE embedding_cache (
  content_hash TEXT PRIMARY KEY,
  embedding vector(1536),
  model TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

// Usar caché
async function getOrGenerateEmbedding(text: string): Promise<number[]> {
  const hash = contentHash(text)
  const cached = await getCachedEmbedding(hash)
  if (cached) return cached

  const embedding = await generateEmbedding(text)
  await saveCachedEmbedding(hash, embedding)
  return embedding
}
```

#### **M6: Procesamiento Incremental Inteligente**
```typescript
// Solo procesar archivos que realmente cambiaron
async function shouldReindex(file: NetworkFile, existing: ExistingFile): Promise<boolean> {
  // 1. Fecha de modificación diferente
  if (file.last_modified !== existing.last_modified) return true

  // 2. Tamaño diferente
  if (file.size !== existing.size) return true

  // 3. Content hash diferente (solo si cambió fecha/tamaño)
  const newHash = await calculateFileHash(file.path)
  if (newHash !== existing.content_hash) return true

  return false
}
```

#### **M7: Análisis de Relaciones entre Archivos**
```typescript
// Detectar archivos relacionados por contenido
async function findRelatedFiles(fileId: string): Promise<RelatedFile[]> {
  const { data: chunks } = await supabase
    .from('network_file_chunks')
    .select('embedding')
    .eq('network_file_id', fileId)
    .limit(3)

  const avgEmbedding = averageEmbeddings(chunks.map(c => c.embedding))

  const { data: related } = await supabase.rpc('match_related_network_files', {
    query_embedding: avgEmbedding,
    exclude_file_id: fileId,
    match_threshold: 0.75,
    match_count: 10
  })

  return related
}
```

#### **M8: Extracción de Metadata de Nombres de Archivo**
```typescript
function extractMetadataFromFilename(filename: string): FilenameMeta {
  // Detectar patrones comunes
  const patterns = {
    date: /(\d{4}[-_]\d{2}[-_]\d{2})/,
    version: /[vV](\d+)\.?(\d*)/,
    status: /(draft|borrador|final|aprobado|revisado)/i,
    department: /(rrhh|finanzas|ventas|marketing|it|legal)/i,
    project: /proyecto[_\s]([a-z0-9]+)/i
  }

  return {
    date: filename.match(patterns.date)?.[1],
    version: filename.match(patterns.version)?.[1],
    status: filename.match(patterns.status)?.[1],
    department: filename.match(patterns.department)?.[1],
    project: filename.match(patterns.project)?.[1]
  }
}
```

#### **M9: Sincronización Paralela Masiva**
```typescript
// Aumentar paralelismo de 5 a 20 archivos
const PARALLEL_BATCH_SIZE = 20

// Usar worker threads para procesamiento CPU-intensive
import { Worker } from 'worker_threads'

async function processFileInWorker(filePath: string): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./file-processor-worker.js', {
      workerData: { filePath }
    })
    worker.on('message', resolve)
    worker.on('error', reject)
  })
}
```

#### **M10: Índice de Búsqueda Facetada**
```typescript
// Crear índices para búsqueda rápida
CREATE INDEX idx_network_files_department ON network_files ((meta_json->>'department'));
CREATE INDEX idx_network_files_doc_type ON network_files ((meta_json->>'doc_type'));
CREATE INDEX idx_network_files_importance ON network_files ((meta_json->>'importance'));
CREATE INDEX idx_network_files_date ON network_files ((meta_json->>'document_date'));

// Búsqueda facetada
async function searchNetworkFiles(query: SearchQuery): Promise<SearchResults> {
  let sql = supabase.from('network_files').select('*')

  if (query.department) sql = sql.eq('meta_json->department', query.department)
  if (query.doc_type) sql = sql.eq('meta_json->doc_type', query.doc_type)
  if (query.importance) sql = sql.eq('meta_json->importance', query.importance)
  if (query.date_from) sql = sql.gte('meta_json->document_date', query.date_from)

  return sql
}
```

---

## 📊 RESUMEN DE MEJORAS PRIORITARIAS

### 🔴 **CRÍTICAS (Implementar YA)**

1. **Eliminar auto-activación de Document Generation** → Evita generación no deseada
2. **Upgrade a `text-embedding-3-large`** → +50% mejor recall en búsquedas
3. **OCR automático para PDFs escaneados** → Evita archivos sin texto
4. **Retry con backoff en embeddings** → Evita fallos por rate limits

### 🟡 **IMPORTANTES (Implementar en Sprint 2)**

5. **Análisis LLM de documentos** → Metadata semántica rica
6. **Chunking semántico** → Mejor contexto en búsquedas
7. **Caché de embeddings** → 10x más rápido
8. **Detección de duplicados** → Evita redundancia

### 🟢 **OPCIONALES (Implementar en Sprint 3)**

9. **Priorización automática** → Archivos críticos primero
10. **Análisis de relaciones** → "Archivos relacionados"
11. **Búsqueda facetada** → Filtros avanzados
12. **Procesamiento paralelo masivo** → Sincronización 4x más rápida

---

## 🎯 ROADMAP SUGERIDO

### **Sprint 1 (1 semana) - Fixes Críticos**
- ✅ Eliminar auto-activación Document Generation
- ✅ Upgrade a text-embedding-3-large
- ✅ OCR automático
- ✅ Retry con backoff

### **Sprint 2 (2 semanas) - Análisis Inteligente**
- ✅ Análisis LLM de documentos
- ✅ Chunking semántico
- ✅ Caché de embeddings
- ✅ Detección de duplicados

### **Sprint 3 (2 semanas) - Optimización**
- ✅ Priorización automática
- ✅ Análisis de relaciones
- ✅ Búsqueda facetada
- ✅ Procesamiento paralelo masivo


