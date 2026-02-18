import { NextRequest } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { searchWeb, enrichSearchResults, WebSearchResult, lastSearchAnswer } from '@/lib/web-search'
import { extractTextAndMetadata } from '@/lib/project-file-ingest'
import sql from 'mssql'

export const runtime = 'nodejs'
export const maxDuration = 60

// Ã¢â€â‚¬Ã¢â€â‚¬ Mejora 10: CachÃƒÂ© simple en memoria para HyDE queries Ã¢â€â‚¬Ã¢â€â‚¬
const hydeCache = new Map<string, { embedding: number[]; timestamp: number }>()
const HYDE_CACHE_TTL = 5 * 60 * 1000 // 5 minutos

type ResearchMode = 'quick' | 'exhaustive'

interface RankedWebSource extends WebSearchResult {
  source_id: string
  canonical_url: string
  relevance_score: number
  authority_score: number
  freshness_score: number
  coverage_score: number
  hybrid_score: number
}

interface DeepResearchPlan {
  sub_questions: string[]
  follow_up_queries: string[]
  clarifying_questions: string[]
}

interface DeepResearchCacheEntry {
  timestamp: number
  sources: WebSearchResult[]
  ranked_sources: RankedWebSource[]
  sub_questions: string[]
  follow_up_queries: string[]
  clarifying_questions: string[]
  answer_summary: string | null
}

interface DeepResearchImage {
  image_url: string
  source_url: string
  source_title: string
}

interface DeepResearchImageCandidate {
  url: string
  context_text: string
  source_hint: 'meta' | 'img'
  width: number | null
  height: number | null
}

interface AssistantFileAttachment {
  file_id: string
  filename: string
  mime: string
  size: number
  storage_path: string
}

interface OcrToolOutput {
  summary: string
  full_text: string
  document_type: string
  language: string
  confidence: number
  invoice_fields?: Record<string, string>
}

interface YouTubeSummaryInput {
  videoId: string
  url: string
  title: string
  author: string
  transcript: string
  fallbackSources: WebSearchResult[]
}

const deepResearchCache = new Map<string, DeepResearchCacheEntry>()
const DEEP_RESEARCH_CACHE_TTL = 10 * 60 * 1000

const AUTHORITY_PATTERNS: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /\.gov(\.[a-z]{2})?$/i, score: 1.0 },
  { pattern: /\.gob\.[a-z]{2}$/i, score: 1.0 },
  { pattern: /\.edu(\.[a-z]{2})?$/i, score: 0.96 },
  { pattern: /(who\.int|oecd\.org|imf\.org|worldbank\.org|un\.org|europa\.eu)$/i, score: 0.95 },
  { pattern: /(reuters\.com|apnews\.com|bbc\.com|ft\.com|wsj\.com|bloomberg\.com)$/i, score: 0.9 },
  { pattern: /(nature\.com|science\.org|springer\.com|ieee\.org|acm\.org|arxiv\.org)$/i, score: 0.9 },
  { pattern: /(wikipedia\.org|stackexchange\.com|github\.com)$/i, score: 0.75 },
]

const RESEARCH_STOPWORDS = new Set([
  'de', 'la', 'el', 'en', 'y', 'a', 'del', 'los', 'las', 'un', 'una', 'para', 'con', 'por',
  'que', 'como', 'sobre', 'the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'una',
])

const normalizeForKey = (value: string): string => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()

const extractAttachmentIdsFromMessage = (attachmentsJson: unknown): string[] => {
  if (!Array.isArray(attachmentsJson)) return []
  return attachmentsJson
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      const fileId = (item as { file_id?: unknown }).file_id
      return typeof fileId === 'string' ? fileId.trim() : ''
    })
    .filter((id): id is string => id.length > 0)
}

const extractPythonCodeBlocks = (content: string): string[] => {
  const codeBlocks: string[] = []
  const pythonBlockRegex = /```python\n([\s\S]*?)```/g
  let match
  while ((match = pythonBlockRegex.exec(content)) !== null) {
    const code = match[1].trim()
    if (code) codeBlocks.push(code)
  }
  return codeBlocks
}

const canonicalizeUrl = (rawUrl: string): string => {
  try {
    const parsed = new URL(rawUrl)
    parsed.hash = ''
    const blockedParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'gclid', 'fbclid', 'igshid', 'mc_cid', 'mc_eid',
    ]
    for (const param of blockedParams) {
      parsed.searchParams.delete(param)
    }
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase()
    const path = parsed.pathname.replace(/\/+$/, '') || '/'
    const query = parsed.searchParams.toString()
    return `${parsed.protocol}//${host}${path}${query ? `?${query}` : ''}`
  } catch {
    return rawUrl.trim().toLowerCase()
  }
}

const tokenize = (value: string): Set<string> => {
  const normalized = normalizeForKey(value).replace(/[^a-z0-9\s]/g, ' ')
  return new Set(
    normalized
      .split(/\s+/)
      .filter((token) => token.length > 2 && !RESEARCH_STOPWORDS.has(token))
  )
}

const jaccardSimilarity = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const token of a) if (b.has(token)) intersection++
  const union = new Set([...a, ...b]).size
  return union === 0 ? 0 : intersection / union
}

const scoreSourceAuthority = (url: string): number => {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase()
    for (const rule of AUTHORITY_PATTERNS) {
      if (rule.pattern.test(host)) return rule.score
    }
    if (host.split('.').length >= 3) return 0.62
    return 0.55
  } catch {
    return 0.45
  }
}

const scoreSourceFreshness = (source: WebSearchResult): number => {
  const text = `${source.title} ${source.snippet}`.toLowerCase()
  if (/(hoy|ultima hora|ÃƒÂºltima hora|breaking|actualizado|updated)/i.test(text)) return 0.95

  const yearMatches = Array.from(text.matchAll(/\b(20\d{2})\b/g))
    .map((match) => Number(match[1]))
    .filter((year) => Number.isFinite(year))

  if (yearMatches.length === 0) return 0.55
  const currentYear = new Date().getFullYear()
  const latestYear = Math.max(...yearMatches)
  const diff = currentYear - latestYear
  if (diff <= 0) return 0.95
  if (diff === 1) return 0.82
  if (diff === 2) return 0.72
  if (diff <= 4) return 0.62
  return 0.45
}

const scoreSourceCoverage = (query: string, source: WebSearchResult): number => {
  const queryTokens = tokenize(query)
  if (queryTokens.size === 0) return 0.5

  const sourceTokens = tokenize(`${source.title} ${source.snippet} ${source.pageContent || ''}`)
  if (sourceTokens.size === 0) return 0

  let hits = 0
  for (const token of queryTokens) if (sourceTokens.has(token)) hits++
  return Math.min(1, hits / queryTokens.size)
}

const removeDuplicateSources = (sources: WebSearchResult[]): WebSearchResult[] => {
  const unique: WebSearchResult[] = []

  for (const candidate of sources) {
    if (!candidate.url) continue
    const candidateCanonical = canonicalizeUrl(candidate.url)
    const candidateTokens = tokenize(`${candidate.title} ${candidate.snippet}`)

    const duplicateIdx = unique.findIndex((existing) => {
      const sameCanonical = canonicalizeUrl(existing.url) === candidateCanonical
      if (sameCanonical) return true

      const sameHost = (() => {
        try {
          return new URL(existing.url).hostname.replace(/^www\./i, '') === new URL(candidate.url).hostname.replace(/^www\./i, '')
        } catch {
          return false
        }
      })()

      if (!sameHost) return false
      const existingTokens = tokenize(`${existing.title} ${existing.snippet}`)
      return jaccardSimilarity(existingTokens, candidateTokens) >= 0.88
    })

    if (duplicateIdx === -1) {
      unique.push(candidate)
      continue
    }

    const current = unique[duplicateIdx]
    const currentSignal = (current.score || 0) + (current.pageContent?.length || 0) / 8000
    const candidateSignal = (candidate.score || 0) + (candidate.pageContent?.length || 0) / 8000
    if (candidateSignal > currentSignal) unique[duplicateIdx] = candidate
  }

  return unique
}

const rankWebSources = (query: string, sources: WebSearchResult[], maxSources: number): RankedWebSource[] => {
  const deduped = removeDuplicateSources(sources)
  const ranked = deduped.map((source) => {
    const relevance = Math.max(0, Math.min(1, source.score ?? 0.5))
    const authority = scoreSourceAuthority(source.url)
    const freshness = scoreSourceFreshness(source)
    const coverage = scoreSourceCoverage(query, source)
    const hybrid = (relevance * 0.42) + (authority * 0.24) + (freshness * 0.2) + (coverage * 0.14)

    return {
      ...source,
      source_id: '',
      canonical_url: canonicalizeUrl(source.url),
      relevance_score: relevance,
      authority_score: authority,
      freshness_score: freshness,
      coverage_score: coverage,
      hybrid_score: hybrid,
    }
  })

  ranked.sort((a, b) => b.hybrid_score - a.hybrid_score)
  return ranked.slice(0, maxSources).map((source, idx) => ({ ...source, source_id: `W${idx + 1}` }))
}

const uniqueStrings = (items: string[], maxItems: number): string[] => {
  const seen = new Set<string>()
  const output: string[] = []
  for (const raw of items) {
    const item = raw.trim()
    if (!item) continue
    const key = normalizeForKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    output.push(item)
    if (output.length >= maxItems) break
  }
  return output
}

const parseHtmlAttributes = (tag: string): Record<string, string> => {
  const attrs: Record<string, string> = {}
  const attrRegex = /([a-zA-Z_:-][a-zA-Z0-9_:.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g
  let match: RegExpExecArray | null = null
  while (true) {
    match = attrRegex.exec(tag)
    if (!match) break
    const key = match[1].toLowerCase()
    const value = (match[2] ?? match[3] ?? match[4] ?? '').trim()
    if (value) attrs[key] = value
  }
  return attrs
}

const toAbsoluteHttpUrl = (rawUrl: string, baseUrl: string): string | null => {
  const cleaned = rawUrl.trim().replace(/&amp;/g, '&')
  if (!cleaned || cleaned.startsWith('data:') || cleaned.startsWith('javascript:')) return null

  try {
    const absolute = new URL(cleaned, baseUrl).toString()
    if (!/^https?:\/\//i.test(absolute)) return null
    if (/\.svg(\?|#|$)/i.test(absolute)) return null
    if (/(favicon|sprite|tracking|pixel|placeholder|avatar)/i.test(absolute)) return null
    return absolute
  } catch {
    return null
  }
}

const GENERIC_IMAGE_CONTEXT_RE = /(logo|icon|avatar|sprite|favicon|button|emoji|banner|thumbnail|thumb|placeholder|loader|spinner|tracking|pixel|advert|ads|cookie|signin|signup|profile|default)/i

const extractImageCandidatesFromHtml = (html: string, pageUrl: string): DeepResearchImageCandidate[] => {
  const picks: DeepResearchImageCandidate[] = []
  const seen = new Set<string>()

  const pushCandidate = (
    rawUrl: string | undefined,
    contextText: string,
    sourceHint: 'meta' | 'img',
    width?: number | null,
    height?: number | null
  ) => {
    if (!rawUrl) return
    const absolute = toAbsoluteHttpUrl(rawUrl, pageUrl)
    if (!absolute) return
    const canonical = canonicalizeUrl(absolute)
    if (seen.has(canonical)) return
    seen.add(canonical)
    picks.push({
      url: absolute,
      context_text: contextText,
      source_hint: sourceHint,
      width: Number.isFinite(Number(width)) ? Number(width) : null,
      height: Number.isFinite(Number(height)) ? Number(height) : null,
    })
  }

  const metaTags = html.match(/<meta\b[^>]*>/gi) || []
  const metaMap = new Map<string, string>()
  for (const tag of metaTags) {
    const attrs = parseHtmlAttributes(tag)
    const prop = (attrs.property || attrs.name || '').toLowerCase()
    const content = attrs.content || ''
    if (prop && content) metaMap.set(prop, content)
  }

  const metaContext = [
    metaMap.get('og:title') || '',
    metaMap.get('og:description') || '',
    metaMap.get('twitter:title') || '',
    metaMap.get('twitter:description') || '',
    metaMap.get('og:image:alt') || '',
  ].join(' ')

  pushCandidate(metaMap.get('og:image') || metaMap.get('og:image:secure_url'), metaContext, 'meta')
  pushCandidate(metaMap.get('twitter:image') || metaMap.get('twitter:image:src'), metaContext, 'meta')

  const imgTags = html.match(/<img\b[^>]*>/gi) || []
  for (const tag of imgTags.slice(0, 70)) {
    const attrs = parseHtmlAttributes(tag)
    const src = attrs.src || attrs['data-src'] || attrs['data-original'] || attrs['data-lazy-src']
    const hint = `${attrs.alt || ''} ${attrs.title || ''} ${attrs.class || ''} ${attrs.id || ''} ${attrs['aria-label'] || ''}`.toLowerCase()
    if (GENERIC_IMAGE_CONTEXT_RE.test(hint)) continue

    const width = Number(attrs.width)
    const height = Number(attrs.height)
    if (Number.isFinite(width) && Number.isFinite(height) && (width < 180 || height < 180)) continue

    pushCandidate(src, hint, 'img', width, height)
    if (picks.length >= 16) break
  }

  return picks
}

const fetchHtmlWithTimeout = async (
  url: string,
  timeoutMs: number
): Promise<{ html: string; finalUrl: string } | null> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      },
    })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.toLowerCase().includes('text/html')) return null

    const html = await res.text()
    return {
      html,
      finalUrl: res.url || url,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

const collectDeepResearchImages = async (
  rankedSources: RankedWebSource[],
  userQuery: string,
  maxImages: number
): Promise<DeepResearchImage[]> => {
  if (maxImages <= 0 || rankedSources.length === 0) return []

  const seenImageUrls = new Set<string>()
  const queryTokens = tokenize(userQuery || '')
  const hasQueryTokens = queryTokens.size > 0

  const scoreSourceForImage = (source: RankedWebSource): number => {
    const sourceTokens = tokenize(`${source.title} ${source.snippet} ${source.url}`)
    const lexical = jaccardSimilarity(queryTokens, sourceTokens)
    return (lexical * 0.36) + (source.coverage_score * 0.27) + (source.relevance_score * 0.24) + (source.hybrid_score * 0.13)
  }

  const scoreImageCandidateForQuery = (
    candidate: DeepResearchImageCandidate,
    source: RankedWebSource
  ): number => {
    if (!hasQueryTokens) return 0.4

    const normalizedUrl = (() => {
      try {
        return decodeURIComponent(candidate.url)
      } catch {
        return candidate.url
      }
    })()

    const sourceText = `${source.title} ${source.snippet} ${source.url}`
    const candidateText = `${normalizedUrl} ${candidate.context_text} ${sourceText}`.toLowerCase()
    const candidateTokens = tokenize(candidateText)
    const urlTokens = tokenize(normalizedUrl)

    const lexical = jaccardSimilarity(queryTokens, candidateTokens)
    const urlLexical = jaccardSimilarity(queryTokens, urlTokens)
    const sourceScore = scoreSourceForImage(source)

    let sizeBonus = 0
    if (candidate.width && candidate.height) {
      if (candidate.width >= 600 && candidate.height >= 340) sizeBonus = 0.08
      else if (candidate.width >= 360 && candidate.height >= 220) sizeBonus = 0.04
    }

    const genericPenalty = GENERIC_IMAGE_CONTEXT_RE.test(candidateText) ? 0.22 : 0
    const metaBonus = candidate.source_hint === 'meta' ? 0.06 : 0

    const score = (sourceScore * 0.34) + (lexical * 0.34) + (urlLexical * 0.18) + sizeBonus + metaBonus - genericPenalty

    // Hard reject weakly related or obviously generic images.
    if (lexical < 0.02 && urlLexical < 0.02) return -1
    if (genericPenalty > 0 && lexical < 0.08 && urlLexical < 0.08) return -1
    return score
  }

  const prioritizedSources = [...rankedSources]
    .sort((a, b) => scoreSourceForImage(b) - scoreSourceForImage(a))
    .slice(0, 12)

  const imagePerSource = await runWithConcurrency(
    prioritizedSources,
    3,
    async (source): Promise<{ image: DeepResearchImage; score: number } | null> => {
      const page = await fetchHtmlWithTimeout(source.url, 7000)
      if (!page) return null

      const candidates = extractImageCandidatesFromHtml(page.html, page.finalUrl || source.url)
      if (candidates.length === 0) return null

      const scoredCandidates = [...candidates]
        .map((candidate) => ({ candidate, score: scoreImageCandidateForQuery(candidate, source) }))
        .filter((entry) => entry.score >= 0)
        .sort((a, b) => b.score - a.score)

      const best = scoredCandidates[0]
      if (!best) return null

      const key = canonicalizeUrl(best.candidate.url)
      if (seenImageUrls.has(key)) return null
      seenImageUrls.add(key)

      return {
        image: {
          image_url: best.candidate.url,
          source_url: source.url,
          source_title: source.title || source.url,
        },
        score: best.score,
      }
    }
  )

  const rankedImages = imagePerSource
    .filter((item): item is { image: DeepResearchImage; score: number } => Boolean(item))
    .sort((a, b) => b.score - a.score)

  const strictThreshold = hasQueryTokens ? 0.17 : 0.05
  const softThreshold = hasQueryTokens ? 0.11 : 0
  let selected = rankedImages.filter((item) => item.score >= strictThreshold)

  if (selected.length < maxImages) {
    const fallback = rankedImages.filter((item) => item.score >= softThreshold && !selected.includes(item))
    selected = [...selected, ...fallback]
  }

  if (selected.length < maxImages) {
    const remaining = rankedImages.filter((item) => !selected.includes(item))
    selected = [...selected, ...remaining]
  }

  const minImages = Math.min(3, Math.max(1, maxImages))
  const selectedImages: DeepResearchImage[] = []
  const seenSelected = new Set<string>()
  const pushImage = (image: DeepResearchImage): boolean => {
    const key = canonicalizeUrl(image.image_url)
    if (!key || seenSelected.has(key)) return false
    seenSelected.add(key)
    selectedImages.push(image)
    return true
  }

  for (const item of selected.slice(0, maxImages)) {
    pushImage(item.image)
  }

  // Guarantee at least 3 related visuals using source snapshots as fallback.
  if (selectedImages.length < minImages) {
    for (const source of prioritizedSources) {
      const fallbackUrl = `https://image.thum.io/get/width/1200/noanimate/${encodeURIComponent(source.url)}`
      pushImage({
        image_url: fallbackUrl,
        source_url: source.url,
        source_title: source.title || source.url,
      })
      if (selectedImages.length >= minImages) break
    }
  }

  return selectedImages.slice(0, maxImages)
}

const sanitizeTitleForMarkdown = (value: string): string =>
  value
    .replace(/[\r\n|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const buildDeepResearchImagesStreamPrefix = (images: DeepResearchImage[]): string => {
  if (!images.length) return ''
  const safe = images.slice(0, 4)

  const headerRow = safe.map((_, idx) => `Imagen ${idx + 1}`).join(' | ')
  const separatorRow = safe.map(() => '---').join(' | ')
  const imageRow = safe
    .map((image, idx) => `![Imagen ${idx + 1}](${image.image_url})`)
    .join(' | ')
  const sourceRow = safe
    .map((image, idx) => {
      const title = sanitizeTitleForMarkdown(image.source_title) || `Fuente ${idx + 1}`
      return `[${title}](${image.source_url})`
    })
    .join(' | ')

  return `## Imagenes relacionadas\n\n| ${headerRow} |\n| ${separatorRow} |\n| ${imageRow} |\n| ${sourceRow} |\n\n`
}

const parseJsonContent = <T,>(content: string, fallback: T): T => {
  const trimmed = content.trim()
  if (!trimmed) return fallback
  try {
    return JSON.parse(trimmed) as T
  } catch {
    // Continue trying below.
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]) as T
    } catch {
      // Continue.
    }
  }

  const arrayMatch = trimmed.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]) as T
    } catch {
      // Ignore and fallback.
    }
  }

  return fallback
}

const runWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  if (items.length === 0) return []
  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length))
  const results: R[] = new Array(items.length)
  let cursor = 0

  const workers = Array.from({ length: safeConcurrency }).map(async () => {
    while (cursor < items.length) {
      const current = cursor
      cursor += 1
      results[current] = await worker(items[current], current)
    }
  })

  await Promise.all(workers)
  return results
}

const YOUTUBE_URL_RE = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/gi
const DOC_REQUEST_RE = /\b(documento|document|informe|acta|contrato|propuesta|report|docx|word|pdf|excel|xlsx|markdown|\.md\b|md)\b/i
const DOC_GENERATE_RE = /\b(hazme|haz|genera|generar|crea|crear|redacta|redactar|exporta|exportar|conviert|convertir|descargable|plantilla)\b/i
const OCR_REQUEST_RE = /\b(ocr|extrae|extraer|leer|lee|texto|escaneo|scan|factura|invoice|ticket|dni|nif|recibo)\b/i
const SPREADSHEET_REQUEST_RE = /\b(excel|csv|xlsx|xls|hoja|tabla|dataset|datos|grafico|gr[Ã¡a]fico|chart|analiza|analisis|conclusiones?)\b/i
const YOUTUBE_REQUEST_RE = /\b(youtube|yt|video|resumen del video|resume el video)\b/i

const SPREADSHEET_EXTENSIONS = new Set(['csv', 'xlsx', 'xls'])
const SPREADSHEET_MIME_HINTS = [
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

const decodeHtmlEntities = (value: string): string => {
  const base = value
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
  return base
}

const extractFileExtension = (filename: string): string => {
  const clean = filename.toLowerCase().trim()
  const idx = clean.lastIndexOf('.')
  if (idx < 0) return ''
  return clean.slice(idx + 1)
}

const isSpreadsheetAttachment = (filename: string, mime: string): boolean => {
  const ext = extractFileExtension(filename)
  if (SPREADSHEET_EXTENSIONS.has(ext)) return true
  return SPREADSHEET_MIME_HINTS.some((hint) => mime.toLowerCase().includes(hint))
}

const extractYouTubeVideoIds = (text: string): string[] => {
  const ids: string[] = []
  const seen = new Set<string>()
  YOUTUBE_URL_RE.lastIndex = 0
  let match: RegExpExecArray | null

  while (true) {
    match = YOUTUBE_URL_RE.exec(text)
    if (!match) break
    const id = match[1]
    if (id && !seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }

  return ids.slice(0, 3)
}

const decodeYouTubeJsonText = (value: string): string => {
  return decodeHtmlEntities(
    value
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
  )
}

const extractYouTubeCaptionTracks = (watchHtml: string): Array<{ baseUrl: string; languageCode: string; name: string }> => {
  const rawMatch = watchHtml.match(/"captionTracks":(\[[\s\S]*?\])/)
  if (!rawMatch || !rawMatch[1]) return []

  const parsed = parseJsonContent<Array<{
    baseUrl?: string
    languageCode?: string
    name?: { simpleText?: string }
  }>>(rawMatch[1], [])

  return parsed
    .map((track) => ({
      baseUrl: String(track.baseUrl || '').replace(/\\u0026/g, '&'),
      languageCode: String(track.languageCode || ''),
      name: String(track.name?.simpleText || track.languageCode || ''),
    }))
    .filter((track) => track.baseUrl.length > 0)
}

const parseTranscriptXml = (xml: string): string => {
  const lines: string[] = []
  const regex = /<text\b[^>]*>([\s\S]*?)<\/text>/gi
  let match: RegExpExecArray | null
  while (true) {
    match = regex.exec(xml)
    if (!match) break
    const clean = decodeHtmlEntities(match[1] || '')
      .replace(/\s+/g, ' ')
      .trim()
    if (clean) lines.push(clean)
    if (lines.join(' ').length > 16000) break
  }
  return lines.join(' ')
}

const parseTranscriptJson3 = (jsonText: string): string => {
  const parsed = parseJsonContent<{ events?: Array<{ segs?: Array<{ utf8?: string }> }> }>(jsonText, {})
  const lines: string[] = []
  for (const evt of parsed.events || []) {
    const text = (evt.segs || [])
      .map((seg) => String(seg.utf8 || ''))
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
    if (text) lines.push(text)
    if (lines.join(' ').length > 16000) break
  }
  return lines.join(' ')
}

const fetchYouTubeMetadata = async (videoId: string): Promise<{ title: string; author: string }> => {
  const fallback = { title: `Video ${videoId}`, author: 'YouTube' }
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    if (!res.ok) return fallback
    const data = await res.json()
    return {
      title: String(data?.title || fallback.title),
      author: String(data?.author_name || fallback.author),
    }
  } catch {
    return fallback
  }
}

const fetchYouTubeTranscript = async (videoId: string): Promise<string> => {
  const page = await fetchHtmlWithTimeout(`https://www.youtube.com/watch?v=${videoId}`, 10000)
  if (!page) return ''

  const shortDescriptionMatch = page.html.match(/"shortDescription":"((?:\\.|[^"\\])*)"/)
  const shortDescription = shortDescriptionMatch?.[1]
    ? decodeYouTubeJsonText(shortDescriptionMatch[1]).replace(/\s+/g, ' ').trim()
    : ''

  const tracks = extractYouTubeCaptionTracks(page.html)
  if (tracks.length === 0) return shortDescription.slice(0, 12000)

  const preferred = ['es', 'ca', 'en']
  const prioritized = [
    ...tracks
      .filter((track) => preferred.some((lang) => track.languageCode.toLowerCase() === lang))
      .sort((a, b) => preferred.indexOf(a.languageCode.toLowerCase()) - preferred.indexOf(b.languageCode.toLowerCase())),
    ...tracks.filter((track) => !preferred.includes(track.languageCode.toLowerCase())),
  ].slice(0, 6)

  for (const track of prioritized) {
    try {
      const rawRes = await fetch(track.baseUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (!rawRes.ok) continue
      const rawText = await rawRes.text()
      if (!rawText.trim()) continue

      const byXml = rawText.includes('<text') ? parseTranscriptXml(rawText) : ''
      if (byXml.trim().length > 80) return byXml.slice(0, 16000)

      const json3Url = track.baseUrl.includes('fmt=')
        ? track.baseUrl
        : `${track.baseUrl}&fmt=json3`
      const jsonRes = await fetch(json3Url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (!jsonRes.ok) continue
      const jsonText = await jsonRes.text()
      const byJson = parseTranscriptJson3(jsonText)
      if (byJson.trim().length > 80) return byJson.slice(0, 16000)
    } catch {
      // Ignore and try next track.
    }
  }

  return shortDescription.slice(0, 12000)
}

const toNumericValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null

  let clean = value.trim()
  if (!clean) return null
  clean = clean.replace(/[â‚¬$Â£%\s]/g, '')

  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(clean)) {
    clean = clean.replace(/\./g, '').replace(',', '.')
  } else if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(clean)) {
    clean = clean.replace(/,/g, '')
  } else if (/^-?\d+,\d+$/.test(clean)) {
    clean = clean.replace(',', '.')
  } else {
    clean = clean.replace(/,/g, '')
  }

  const parsed = Number(clean)
  return Number.isFinite(parsed) ? parsed : null
}

const buildQuickChartUrl = (title: string, labels: string[], data: number[], chartType: 'bar' | 'line' = 'bar'): string => {
  const safeLabels = labels.slice(0, 10)
  const safeData = data.slice(0, 10).map((value) => Number(value.toFixed(2)))
  const chartConfig = {
    type: chartType,
    data: {
      labels: safeLabels,
      datasets: [{
        label: title,
        data: safeData,
        backgroundColor: chartType === 'bar'
          ? 'rgba(59, 130, 246, 0.55)'
          : 'rgba(59, 130, 246, 0.25)',
        borderColor: 'rgba(37, 99, 235, 0.95)',
        borderWidth: 2,
        fill: chartType !== 'bar',
        tension: 0.2,
      }],
    },
    options: {
      plugins: {
        legend: { display: true },
        title: { display: true, text: title },
      },
      scales: {
        y: { beginAtZero: true },
      },
    },
  }
  return `https://quickchart.io/chart?width=880&height=420&c=${encodeURIComponent(JSON.stringify(chartConfig))}`
}

type GeneratedDocumentExt = 'docx' | 'pdf' | 'xlsx' | 'md' | 'txt' | 'html' | 'json'

const inferDocumentOutputFormat = (prompt: string): { ext: GeneratedDocumentExt; mime: string } => {
  const normalized = normalizeForKey(prompt)

  if (/\b(pdf)\b/.test(normalized)) {
    return { ext: 'pdf', mime: 'application/pdf' }
  }
  if (/\b(word|docx|microsoft word|documento word)\b/.test(normalized)) {
    return { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
  }
  if (/\b(excel|xlsx|hoja de calculo|hoja de cÃ¡lculo|spreadsheet|sheet)\b/.test(normalized)) {
    return { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  }
  if (/\b(markdown|md)\b/.test(normalized) || normalized.includes('.md')) {
    return { ext: 'md', mime: 'text/markdown; charset=utf-8' }
  }
  if (/\b(html|pagina web)\b/.test(normalized)) {
    return { ext: 'html', mime: 'text/html; charset=utf-8' }
  }
  if (/\b(json)\b/.test(normalized)) {
    return { ext: 'json', mime: 'application/json' }
  }
  if (/\b(texto plano|txt)\b/.test(normalized)) {
    return { ext: 'txt', mime: 'text/plain; charset=utf-8' }
  }
  if (/\b(grafica|grafico|grafica|grÃ¡fico|chart|charts|dashboard)\b/.test(normalized)) {
    return { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  }

  // Default: Word document as requested.
  return { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
}

const sanitizeDocumentFilename = (prompt: string): string => {
  const normalized = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const base = normalized.split(' ').filter(Boolean).slice(0, 7).join('-') || 'documento-gia'
  return base.slice(0, 70)
}

const stripMarkdownOuterFence = (value: string): string => {
  const trimmed = value.trim()
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i)
  return fenced?.[1]?.trim() || trimmed
}

const inferDocumentTitleFromPrompt = (prompt: string): string => {
  const normalized = prompt.replace(/\s+/g, ' ').trim()
  if (!normalized) return 'Documento'

  const stripped = normalized
    .replace(/\b(haz|crea|genera|redacta|prepara|make|create|generate|draft)\b/gi, '')
    .replace(/\b(un|una|el|la|documento|document|informe|acta|contrato|propuesta|resumen|report|sobre|de|del)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const base = (stripped || normalized).split(' ').slice(0, 12).join(' ').trim()
  if (!base) return 'Documento'
  return sanitizeTitleForMarkdown(base.charAt(0).toUpperCase() + base.slice(1))
}

const normalizeMarkdownDocument = (rawContent: string, prompt: string): string => {
  let content = stripMarkdownOuterFence(rawContent).replace(/\r\n/g, '\n')
  content = content.replace(/^\s*#+\s*Documento generado por GIA.*$/im, '').trim()
  content = content.replace(/\n{3,}/g, '\n\n')

  if (!content) {
    return `# ${inferDocumentTitleFromPrompt(prompt)}\n\n`
  }

  if (!/^\s*#\s+/m.test(content)) {
    content = `# ${inferDocumentTitleFromPrompt(prompt)}\n\n${content}`
  }

  return `${content.trim()}\n`
}

const markdownToPlainText = (markdown: string): string => {
  return stripMarkdownOuterFence(markdown)
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ''))
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 ($2)')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, 'â€¢ ')
    .replace(/^\d+\.\s+/gm, (match) => match)
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

interface MarkdownValidationReport {
  markdown: string
  issues: string[]
}

interface MarkdownAstNode {
  type: string
  value?: string
  depth?: number
  ordered?: boolean
  start?: number | null
  url?: string
  alt?: string
  lang?: string | null
  align?: Array<'left' | 'right' | 'center' | null> | null
  children?: MarkdownAstNode[]
}

interface InlineStyleState {
  bold?: boolean
  italics?: boolean
  strike?: boolean
  code?: boolean
}

interface DocxRuntime {
  Document: new (options: Record<string, unknown>) => unknown
  Packer: { toBuffer: (doc: unknown) => Promise<Uint8Array | Buffer> }
  Paragraph: new (options: Record<string, unknown>) => unknown
  TextRun: new (options: Record<string, unknown>) => unknown
  ExternalHyperlink: new (options: Record<string, unknown>) => unknown
  Table: new (options: Record<string, unknown>) => unknown
  TableRow: new (options: Record<string, unknown>) => unknown
  TableCell: new (options: Record<string, unknown>) => unknown
  TableOfContents: new (title: string, options?: Record<string, unknown>) => unknown
  HeadingLevel: Record<string, unknown>
  WidthType: Record<string, unknown>
  BorderStyle: Record<string, unknown>
  AlignmentType: Record<string, unknown>
  LevelFormat: Record<string, unknown>
}

const TABLE_SEPARATOR_LINE_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/

const validateAndRepairMarkdownForExport = (markdown: string): MarkdownValidationReport => {
  const issues: string[] = []
  let value = stripMarkdownOuterFence(markdown).replace(/\r\n/g, '\n')

  const lines = value.split('\n')
  const cleanedLines: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!TABLE_SEPARATOR_LINE_RE.test(line)) {
      cleanedLines.push(line)
      continue
    }

    const prev = (lines[i - 1] || '').trim()
    const next = (lines[i + 1] || '').trim()
    const hasTableContext = prev.includes('|') || next.includes('|')
    if (hasTableContext) {
      cleanedLines.push(line)
    } else {
      issues.push('orphan_table_separator')
    }
  }
  value = cleanedLines.join('\n')

  const fencedCount = (value.match(/```/g) || []).length
  if (fencedCount % 2 !== 0) {
    issues.push('unbalanced_fence_backticks')
    value = value
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('```'))
      .join('\n')
  }

  const boldCount = (value.match(/\*\*/g) || []).length
  if (boldCount % 2 !== 0) {
    issues.push('unbalanced_bold_markers')
    value = value.replace(/\*\*/g, '')
  }

  const backticksCount = (value.match(/`/g) || []).length
  if (backticksCount % 2 !== 0) {
    issues.push('unbalanced_inline_backticks')
    value = value.replace(/`/g, '')
  }

  value = value.replace(/\n{3,}/g, '\n\n').trim()
  return { markdown: `${value}\n`, issues }
}

const cleanResidualMarkdownTokens = (text: string): string => {
  if (!text) return ''
  return text
    .replace(/\u0000/g, '')
    .replace(/(?:^|\s)\*\*(?=\s|$)/g, ' ')
    .replace(/(?:^|\s)`(?=\s|$)/g, ' ')
    .replace(TABLE_SEPARATOR_LINE_RE, '')
}

const URL_IN_TEXT_RE = /https?:\/\/[^\s<>()]+/gi

const splitUrlAndTrailingPunctuation = (raw: string): { url: string; trailing: string } => {
  let url = raw
  let trailing = ''
  while (/[),.;:!?]$/.test(url)) {
    trailing = `${url.slice(-1)}${trailing}`
    url = url.slice(0, -1)
  }
  return { url, trailing }
}

const parseMarkdownToAst = async (markdown: string): Promise<MarkdownAstNode> => {
  const unifiedMod = await import('unified')
  const remarkParseMod = await import('remark-parse')
  const remarkGfmMod = await import('remark-gfm')

  const unifiedFactory = (unifiedMod as { unified?: () => { use: (plugin: unknown) => { use: (plugin: unknown) => { parse: (src: string) => unknown } } } }).unified
  if (!unifiedFactory) throw new Error('Unified parser unavailable')

  const remarkParse = (remarkParseMod as { default?: unknown }).default ?? remarkParseMod
  const remarkGfm = (remarkGfmMod as { default?: unknown }).default ?? remarkGfmMod

  const processor = unifiedFactory().use(remarkParse).use(remarkGfm)
  return processor.parse(markdown) as MarkdownAstNode
}

const markdownInlineNodesToDocx = (
  nodes: MarkdownAstNode[] | undefined,
  docx: DocxRuntime,
  inherited: InlineStyleState = {},
): unknown[] => {
  const output: unknown[] = []
  const safeNodes = nodes || []

  const pushTextRun = (rawText: string, style: InlineStyleState): void => {
    const text = cleanResidualMarkdownTokens(rawText)
    if (!text) return
    const buildTextRun = (value: string): unknown => {
      const opts: Record<string, unknown> = {
        text: value,
        bold: Boolean(style.bold),
        italics: Boolean(style.italics),
        strike: Boolean(style.strike),
      }
      if (style.code) {
        opts.font = 'Consolas'
        opts.shading = { fill: 'F3F4F6', color: 'auto' }
      }
      return new docx.TextRun(opts)
    }

    if (style.code) {
      output.push(buildTextRun(text))
      return
    }

    URL_IN_TEXT_RE.lastIndex = 0
    const matches = Array.from(text.matchAll(URL_IN_TEXT_RE))
    if (matches.length === 0) {
      output.push(buildTextRun(text))
      return
    }

    let cursor = 0
    for (const match of matches) {
      const matchValue = match[0]
      const index = match.index || 0

      if (index > cursor) {
        const prefix = text.slice(cursor, index)
        if (prefix) output.push(buildTextRun(prefix))
      }

      const { url, trailing } = splitUrlAndTrailingPunctuation(matchValue)
      if (url) {
        output.push(new docx.ExternalHyperlink({
          link: url,
          children: [new docx.TextRun({
            text: url,
            bold: Boolean(style.bold),
            italics: Boolean(style.italics),
            strike: Boolean(style.strike),
            color: '2563EB',
            underline: {},
          })],
        }))
      }
      if (trailing) output.push(buildTextRun(trailing))

      cursor = index + matchValue.length
    }

    if (cursor < text.length) {
      output.push(buildTextRun(text.slice(cursor)))
    }
  }

  for (const node of safeNodes) {
    if (node.type === 'text') {
      pushTextRun(node.value || '', inherited)
      continue
    }

    if (node.type === 'strong') {
      output.push(...markdownInlineNodesToDocx(node.children, docx, { ...inherited, bold: true }))
      continue
    }

    if (node.type === 'emphasis') {
      output.push(...markdownInlineNodesToDocx(node.children, docx, { ...inherited, italics: true }))
      continue
    }

    if (node.type === 'delete') {
      output.push(...markdownInlineNodesToDocx(node.children, docx, { ...inherited, strike: true }))
      continue
    }

    if (node.type === 'inlineCode') {
      pushTextRun(node.value || '', { ...inherited, code: true })
      continue
    }

    if (node.type === 'break') {
      output.push(new docx.TextRun({ break: 1 }))
      continue
    }

    if (node.type === 'link') {
      const children = markdownInlineNodesToDocx(node.children, docx, inherited)
      if (node.url) {
        output.push(new docx.ExternalHyperlink({
          link: node.url,
          children: children.length > 0 ? children : [new docx.TextRun({ text: node.url })],
        }))
      } else {
        output.push(...children)
      }
      continue
    }

    if (node.type === 'image') {
      const fallback = node.alt?.trim() || 'Imagen'
      pushTextRun(`[${fallback}]`, { ...inherited, italics: true })
      continue
    }

    if (node.children && node.children.length > 0) {
      output.push(...markdownInlineNodesToDocx(node.children, docx, inherited))
      continue
    }

    if (node.value) {
      pushTextRun(node.value, inherited)
    }
  }

  if (output.length === 0) {
    output.push(new docx.TextRun({ text: '' }))
  }

  return output
}

const markdownTableNodeToDocx = (tableNode: MarkdownAstNode, docx: DocxRuntime): unknown => {
  const rows = (tableNode.children || []).filter((node) => node.type === 'tableRow')
  const colCount = Math.max(
    1,
    ...rows.map((row) => (row.children || []).filter((cell) => cell.type === 'tableCell').length),
  )

  const docRows = rows.map((row, rowIndex) => {
    const rawCells = (row.children || []).filter((cell) => cell.type === 'tableCell')
    const normalizedCells: MarkdownAstNode[] = [...rawCells]
    while (normalizedCells.length < colCount) {
      normalizedCells.push({ type: 'tableCell', children: [{ type: 'text', value: '' }] })
    }

    const docCells = normalizedCells.map((cell) => {
      const cellRuns = markdownInlineNodesToDocx(cell.children, docx)
      return new docx.TableCell({
        width: {
          size: Math.floor(100 / colCount),
          type: docx.WidthType.PERCENTAGE,
        },
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        shading: rowIndex === 0 ? { fill: 'EAF1FF', color: 'auto' } : undefined,
        children: [
          new docx.Paragraph({
            children: cellRuns,
            spacing: { after: 80 },
          }),
        ],
      })
    })

    return new docx.TableRow({
      tableHeader: rowIndex === 0,
      children: docCells,
    })
  })

  return new docx.Table({
    width: {
      size: 100,
      type: docx.WidthType.PERCENTAGE,
    },
    rows: docRows,
  })
}

const markdownListNodeToDocx = (listNode: MarkdownAstNode, docx: DocxRuntime, level = 0): unknown[] => {
  const out: unknown[] = []
  const isOrdered = Boolean(listNode.ordered)
  const listItems = (listNode.children || []).filter((node) => node.type === 'listItem')
  const safeLevel = Math.max(0, Math.min(level, 2))

  for (const item of listItems) {
    const blocks = item.children || []
    const firstParagraph = blocks.find((block) => block.type === 'paragraph')
    if (firstParagraph) {
      const runs = markdownInlineNodesToDocx(firstParagraph.children, docx)
      out.push(new docx.Paragraph({
        children: runs,
        bullet: isOrdered ? undefined : { level: safeLevel },
        numbering: isOrdered ? { reference: 'gia-numbered-list', level: safeLevel } : undefined,
        spacing: { after: 120 },
      }))
    } else {
      out.push(new docx.Paragraph({
        text: '',
        bullet: isOrdered ? undefined : { level: safeLevel },
        numbering: isOrdered ? { reference: 'gia-numbered-list', level: safeLevel } : undefined,
      }))
    }

    for (const nested of blocks) {
      if (nested === firstParagraph) continue
      if (nested.type === 'list') {
        out.push(...markdownListNodeToDocx(nested, docx, safeLevel + 1))
      } else if (nested.type === 'paragraph') {
        out.push(new docx.Paragraph({
          children: markdownInlineNodesToDocx(nested.children, docx),
          indent: { left: 720 + (safeLevel * 360) },
          spacing: { after: 120 },
        }))
      } else if (nested.type === 'code') {
        out.push(...markdownNodesToDocxChildren([nested], docx))
      }
    }
  }

  return out
}

const markdownNodesToDocxChildren = (nodes: MarkdownAstNode[] | undefined, docx: DocxRuntime): unknown[] => {
  const out: unknown[] = []
  const safeNodes = nodes || []

  for (const node of safeNodes) {
    if (node.type === 'heading') {
      const depth = Math.max(1, Math.min(6, node.depth || 1))
      const headingByDepth: Record<number, unknown> = {
        1: docx.HeadingLevel.HEADING_1,
        2: docx.HeadingLevel.HEADING_2,
        3: docx.HeadingLevel.HEADING_3,
        4: docx.HeadingLevel.HEADING_4,
        5: docx.HeadingLevel.HEADING_5,
        6: docx.HeadingLevel.HEADING_6,
      }
      out.push(new docx.Paragraph({
        heading: headingByDepth[depth] || docx.HeadingLevel.HEADING_3,
        children: markdownInlineNodesToDocx(node.children, docx),
        spacing: { before: 180, after: 140 },
      }))
      continue
    }

    if (node.type === 'paragraph') {
      out.push(new docx.Paragraph({
        children: markdownInlineNodesToDocx(node.children, docx),
        spacing: { after: 120 },
      }))
      continue
    }

    if (node.type === 'list') {
      out.push(...markdownListNodeToDocx(node, docx))
      continue
    }

    if (node.type === 'table') {
      out.push(markdownTableNodeToDocx(node, docx))
      out.push(new docx.Paragraph({ text: '' }))
      continue
    }

    if (node.type === 'code') {
      const lines = (node.value || '').replace(/\r\n/g, '\n').split('\n')
      const codeRuns: unknown[] = []
      lines.forEach((line, index) => {
        codeRuns.push(new docx.TextRun({ text: line.length > 0 ? line : ' ', font: 'Consolas' }))
        if (index < lines.length - 1) codeRuns.push(new docx.TextRun({ break: 1 }))
      })
      out.push(new docx.Paragraph({
        children: codeRuns,
        spacing: { before: 120, after: 160 },
        shading: { fill: 'F8FAFC', color: 'auto' },
        border: {
          top: { style: docx.BorderStyle.SINGLE, color: 'D1D5DB', size: 4 },
          right: { style: docx.BorderStyle.SINGLE, color: 'D1D5DB', size: 4 },
          bottom: { style: docx.BorderStyle.SINGLE, color: 'D1D5DB', size: 4 },
          left: { style: docx.BorderStyle.SINGLE, color: 'D1D5DB', size: 4 },
        },
      }))
      continue
    }

    if (node.type === 'blockquote') {
      const quoteBlocks = (node.children || []).filter((child) => child.type === 'paragraph')
      if (quoteBlocks.length === 0) {
        out.push(new docx.Paragraph({
          text: '',
          spacing: { after: 120 },
        }))
      } else {
        for (const quoteParagraph of quoteBlocks) {
          out.push(new docx.Paragraph({
            children: markdownInlineNodesToDocx(quoteParagraph.children, docx, { italics: true }),
            indent: { left: 480 },
            border: { left: { style: docx.BorderStyle.SINGLE, color: '94A3B8', size: 8 } },
            spacing: { before: 80, after: 100 },
          }))
        }
      }
      continue
    }

    if (node.type === 'thematicBreak') {
      out.push(new docx.Paragraph({
        children: [new docx.TextRun({ text: '--------------------' })],
        spacing: { before: 80, after: 80 },
        alignment: docx.AlignmentType.CENTER,
      }))
      continue
    }

    if (node.type === 'html' || node.type === 'text') {
      const txt = cleanResidualMarkdownTokens(node.value || '')
      if (txt) {
        out.push(new docx.Paragraph({
          children: [new docx.TextRun({ text: txt })],
          spacing: { after: 120 },
        }))
      }
      continue
    }

    if (node.children && node.children.length > 0) {
      out.push(...markdownNodesToDocxChildren(node.children, docx))
    }
  }

  if (out.length === 0) {
    out.push(new docx.Paragraph({ text: 'Sin contenido' }))
  }

  return out
}

const buildDocxBufferFromMarkdown = async (markdown: string): Promise<Buffer> => {
  const docx = await import('docx') as unknown as DocxRuntime
  const validation = validateAndRepairMarkdownForExport(markdown)
  if (validation.issues.length > 0) {
    console.log('[DocGen] Markdown auto-repair issues:', validation.issues.join(', '))
  }

  const safeMarkdown = validation.markdown
  let ast: MarkdownAstNode
  try {
    ast = await parseMarkdownToAst(safeMarkdown)
  } catch (parseErr) {
    console.error('[DocGen] AST parse failed, fallback to plain paragraphs:', parseErr)
    ast = {
      type: 'root',
      children: safeMarkdown
        .split('\n')
        .map((line) => ({ type: 'paragraph', children: [{ type: 'text', value: line }] })),
    }
  }

  const bodyChildren = markdownNodesToDocxChildren(ast.children || [], docx)

  const children: unknown[] = [
    new docx.Paragraph({
      children: [
        new docx.TextRun({ text: 'Tabla de contenidos', bold: true, size: 28 }),
      ],
      spacing: { after: 120 },
    }),
    new docx.TableOfContents('Contenido', {
      hyperlink: true,
      headingStyleRange: '1-3',
    }),
    new docx.Paragraph({ pageBreakBefore: true, text: '' }),
    ...bodyChildren,
  ]

  const doc = new docx.Document({
    numbering: {
      config: [
        {
          reference: 'gia-numbered-list',
          levels: [
            { level: 0, format: docx.LevelFormat.DECIMAL, text: '%1.', alignment: docx.AlignmentType.START },
            { level: 1, format: docx.LevelFormat.LOWER_LETTER, text: '%2.', alignment: docx.AlignmentType.START },
            { level: 2, format: docx.LevelFormat.LOWER_ROMAN, text: '%3.', alignment: docx.AlignmentType.START },
          ],
        },
      ],
    },
    sections: [{ properties: {}, children }],
  })

  const result = await docx.Packer.toBuffer(doc)
  return Buffer.isBuffer(result) ? result : Buffer.from(result)
}

interface PdfWriterDoc {
  page: {
    width: number
    margins: { left: number; right: number }
  }
  font: (name: string) => PdfWriterDoc
  fontSize: (size: number) => PdfWriterDoc
  fillColor: (color: string) => PdfWriterDoc
  text: (value: string, options?: Record<string, unknown>) => PdfWriterDoc
  moveDown: (lines?: number) => PdfWriterDoc
  on: (event: 'data' | 'error' | 'end', cb: (chunk?: Uint8Array | Error) => void) => PdfWriterDoc
  end: () => void
  info?: Record<string, unknown>
}

type PdfDocumentCtor = new (...args: unknown[]) => PdfWriterDoc

const resolvePdfDocumentCtor = (mod: unknown): PdfDocumentCtor | null => {
  const candidate = (
    (mod as { default?: PdfDocumentCtor }).default
    || (mod as { PDFDocument?: PdfDocumentCtor }).PDFDocument
    || (mod as PdfDocumentCtor)
  )
  return typeof candidate === 'function' ? candidate : null
}

const loadPdfDocumentCtor = async (): Promise<PdfDocumentCtor> => {
  try {
    const standalone = await import('pdfkit/js/pdfkit.standalone.js')
    const ctor = resolvePdfDocumentCtor(standalone)
    if (ctor) return ctor
  } catch (standaloneErr) {
    console.warn('[DocGen] pdfkit standalone unavailable, trying default pdfkit:', standaloneErr)
  }

  const pdfkitMod = await import('pdfkit')
  const ctor = resolvePdfDocumentCtor(pdfkitMod)
  if (!ctor) throw new Error('No se pudo inicializar PDFKit')
  return ctor
}

const PDF_CONTROL_CHAR_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const PDF_MARKDOWN_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g
const PDF_URL_RE = /https?:\/\/[^\s<>()]+/gi
const PDF_UNSUPPORTED_CHAR_RE = /[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g

const sanitizePdfText = (value: string): string =>
  value
    .replace(PDF_CONTROL_CHAR_RE, '')
    .replace(/\uFFFD/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/•/g, '-')
    .replace(PDF_UNSUPPORTED_CHAR_RE, '')

const normalizeMarkdownLinksForPdf = (markdown: string): string =>
  stripMarkdownOuterFence(markdown)
    .replace(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/g, '')
    .replace(PDF_MARKDOWN_LINK_RE, '$1 ($2)')

interface PdfInlineStyleState {
  bold?: boolean
  italics?: boolean
  strike?: boolean
  code?: boolean
  link?: string
  color?: string
}

interface PdfInlineSegment extends PdfInlineStyleState {
  text: string
  lineBreak?: boolean
}

interface PdfTextRenderOptions {
  fontSize?: number
  color?: string
  indent?: number
  paragraphGap?: number
  lineGap?: number
}

const pickPdfFont = (segment: PdfInlineSegment): string => {
  if (segment.code) return 'Courier'
  if (segment.bold && segment.italics) return 'Helvetica-BoldOblique'
  if (segment.bold) return 'Helvetica-Bold'
  if (segment.italics) return 'Helvetica-Oblique'
  return 'Helvetica'
}

const markdownInlineNodesToPdfSegments = (
  nodes: MarkdownAstNode[] | undefined,
  inherited: PdfInlineStyleState = {},
): PdfInlineSegment[] => {
  const out: PdfInlineSegment[] = []
  const safeNodes = nodes || []

  const pushText = (rawText: string, style: PdfInlineStyleState): void => {
    const cleaned = cleanResidualMarkdownTokens(rawText || '')
    const text = sanitizePdfText(cleaned)
    if (!text) return
    out.push({
      text,
      bold: Boolean(style.bold),
      italics: Boolean(style.italics),
      strike: Boolean(style.strike),
      code: Boolean(style.code),
      link: style.link,
      color: style.color,
    })
  }

  for (const node of safeNodes) {
    if (node.type === 'text') {
      pushText(node.value || '', inherited)
      continue
    }

    if (node.type === 'strong') {
      out.push(...markdownInlineNodesToPdfSegments(node.children, { ...inherited, bold: true }))
      continue
    }

    if (node.type === 'emphasis') {
      out.push(...markdownInlineNodesToPdfSegments(node.children, { ...inherited, italics: true }))
      continue
    }

    if (node.type === 'delete') {
      out.push(...markdownInlineNodesToPdfSegments(node.children, { ...inherited, strike: true }))
      continue
    }

    if (node.type === 'inlineCode') {
      pushText(node.value || '', { ...inherited, code: true })
      continue
    }

    if (node.type === 'break') {
      out.push({ text: '', lineBreak: true })
      continue
    }

    if (node.type === 'link') {
      if (node.children && node.children.length > 0) {
        out.push(...markdownInlineNodesToPdfSegments(node.children, { ...inherited, link: node.url || inherited.link }))
      } else if (node.url) {
        pushText(node.url, { ...inherited, link: node.url })
      }
      continue
    }

    if (node.type === 'image') {
      const label = node.alt?.trim() ? `Imagen: ${node.alt.trim()}` : 'Imagen'
      pushText(`[${label}]`, { ...inherited, italics: true, color: '#64748b' })
      continue
    }

    if (node.type === 'html') {
      pushText(node.value || '', inherited)
      continue
    }

    if (node.children && node.children.length > 0) {
      out.push(...markdownInlineNodesToPdfSegments(node.children, inherited))
      continue
    }

    if (node.value) {
      pushText(node.value, inherited)
    }
  }

  return out
}

const markdownInlineNodesToPlainText = (nodes: MarkdownAstNode[] | undefined): string =>
  markdownInlineNodesToPdfSegments(nodes)
    .filter((segment) => !segment.lineBreak)
    .map((segment) => segment.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()

const expandPdfSegmentUrls = (segment: PdfInlineSegment): PdfInlineSegment[] => {
  if (segment.lineBreak || !segment.text || segment.link || segment.code) return [segment]

  PDF_URL_RE.lastIndex = 0
  const matches = Array.from(segment.text.matchAll(PDF_URL_RE))
  if (matches.length === 0) return [segment]

  const expanded: PdfInlineSegment[] = []
  let cursor = 0
  for (const match of matches) {
    const raw = match[0]
    const index = match.index || 0
    if (index > cursor) {
      expanded.push({ ...segment, text: segment.text.slice(cursor, index) })
    }

    const { url, trailing } = splitUrlAndTrailingPunctuation(raw)
    if (url) {
      expanded.push({ ...segment, text: url, link: url, color: '#2563eb' })
    }
    if (trailing) {
      expanded.push({ ...segment, text: trailing })
    }
    cursor = index + raw.length
  }

  if (cursor < segment.text.length) {
    expanded.push({ ...segment, text: segment.text.slice(cursor) })
  }

  return expanded
}

const writePdfInlineSegments = (
  doc: PdfWriterDoc,
  rawSegments: PdfInlineSegment[],
  options: PdfTextRenderOptions = {},
) => {
  const fontSize = options.fontSize || 11
  const baseColor = options.color || '#1f2937'
  const indent = Math.max(0, options.indent || 0)
  const paragraphGap = options.paragraphGap ?? 0
  const lineGap = options.lineGap ?? 1.5
  const width = Math.max(120, doc.page.width - doc.page.margins.left - doc.page.margins.right - indent)

  const segments = rawSegments
    .flatMap(expandPdfSegmentUrls)
    .map((segment) => (segment.lineBreak ? segment : { ...segment, text: sanitizePdfText(segment.text || '') }))
    .filter((segment) => segment.lineBreak || Boolean(segment.text))

  if (segments.length === 0) {
    if (paragraphGap > 0) doc.moveDown(paragraphGap)
    return
  }

  const lines: PdfInlineSegment[][] = [[]]
  for (const segment of segments) {
    if (segment.lineBreak) {
      lines.push([])
      continue
    }
    lines[lines.length - 1].push(segment)
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineSegments = lines[lineIndex]

    if (lineSegments.length === 0) {
      if (lineIndex < lines.length - 1) {
        doc.moveDown(0.12)
      }
      continue
    }

    for (let segIndex = 0; segIndex < lineSegments.length; segIndex++) {
      const segment = lineSegments[segIndex]
      const text = segment.text || ''
      if (!text) continue

      const isLastInLine = segIndex === lineSegments.length - 1
      const textOptions: Record<string, unknown> = {
        width,
        continued: !isLastInLine,
        lineGap,
      }
      if (segIndex === 0 && indent > 0) textOptions.indent = indent
      if (segment.link) {
        textOptions.link = segment.link
        textOptions.underline = true
      }
      if (segment.strike) textOptions.strike = true

      doc
        .font(pickPdfFont(segment))
        .fontSize(fontSize)
        .fillColor(segment.color || (segment.link ? '#2563eb' : baseColor))
        .text(text, textOptions)
    }
  }

  if (paragraphGap > 0) doc.moveDown(paragraphGap)
}

const extractTableCells = (rowNode: MarkdownAstNode): MarkdownAstNode[] =>
  (rowNode.children || []).filter((cell) => cell.type === 'tableCell')

const renderPdfTableNode = (doc: PdfWriterDoc, tableNode: MarkdownAstNode) => {
  const rows = (tableNode.children || []).filter((node) => node.type === 'tableRow')
  if (rows.length === 0) return

  const headerCells = extractTableCells(rows[0])

  if (headerCells.length === 2 && rows.length > 1) {
    for (let i = 1; i < rows.length; i++) {
      const cells = extractTableCells(rows[i])
      const key = markdownInlineNodesToPlainText(cells[0]?.children) || `Campo ${i}`
      const valueSegments = markdownInlineNodesToPdfSegments(cells[1]?.children)
      writePdfInlineSegments(doc, [{ text: `${key}: `, bold: true, color: '#0f172a' }, ...valueSegments], {
        fontSize: 10.8,
        color: '#1f2937',
        indent: 8,
        paragraphGap: 0.06,
        lineGap: 1.3,
      })
    }
    doc.moveDown(0.16)
    return
  }

  if (headerCells.length > 0) {
    const headerSegments: PdfInlineSegment[] = []
    headerCells.forEach((cell, idx) => {
      if (idx > 0) headerSegments.push({ text: ' | ', color: '#94a3b8' })
      const segments = markdownInlineNodesToPdfSegments(cell.children).map((segment) =>
        segment.lineBreak ? segment : { ...segment, bold: true, color: '#0f172a' },
      )
      headerSegments.push(...segments)
    })
    writePdfInlineSegments(doc, headerSegments, { fontSize: 11, color: '#0f172a', paragraphGap: 0.05 })
  }

  for (let i = 1; i < rows.length; i++) {
    const cells = extractTableCells(rows[i])
    const rowSegments: PdfInlineSegment[] = []
    cells.forEach((cell, idx) => {
      if (idx > 0) rowSegments.push({ text: ' | ', color: '#cbd5e1' })
      rowSegments.push(...markdownInlineNodesToPdfSegments(cell.children))
    })
    writePdfInlineSegments(doc, rowSegments, { fontSize: 10.6, color: '#1f2937', paragraphGap: 0.03 })
  }
  doc.moveDown(0.2)
}

const renderPdfCodeBlockNode = (doc: PdfWriterDoc, codeNode: MarkdownAstNode, indent = 0) => {
  if (codeNode.lang) {
    writePdfInlineSegments(doc, [{ text: `[${sanitizePdfText(codeNode.lang)}]`, italics: true, color: '#64748b' }], {
      fontSize: 9.5,
      color: '#64748b',
      indent,
      paragraphGap: 0.03,
    })
  }

  const lines = sanitizePdfText((codeNode.value || '').replace(/\r\n/g, '\n')).split('\n')
  if (lines.length === 0) {
    writePdfInlineSegments(doc, [{ text: '', code: true }], {
      fontSize: 10,
      color: '#0f172a',
      indent: indent + 8,
      paragraphGap: 0.12,
      lineGap: 1.1,
    })
    return
  }

  for (const line of lines) {
    writePdfInlineSegments(doc, [{ text: line || ' ', code: true }], {
      fontSize: 10,
      color: '#0f172a',
      indent: indent + 8,
      paragraphGap: 0.02,
      lineGap: 1.1,
    })
  }
  doc.moveDown(0.12)
}

const renderPdfParagraphNode = (doc: PdfWriterDoc, node: MarkdownAstNode, indent = 0) => {
  const segments = markdownInlineNodesToPdfSegments(node.children)
  writePdfInlineSegments(doc, segments, {
    fontSize: 11,
    color: '#1f2937',
    indent,
    paragraphGap: 0.18,
    lineGap: 1.8,
  })
}

const renderPdfHeadingNode = (doc: PdfWriterDoc, node: MarkdownAstNode) => {
  const depth = Math.max(1, Math.min(6, node.depth || 1))
  const sizeByDepth: Record<number, number> = { 1: 19, 2: 15.5, 3: 13.5, 4: 12.5, 5: 11.8, 6: 11.2 }
  const colorByDepth: Record<number, string> = { 1: '#0f172a', 2: '#111827', 3: '#1f2937', 4: '#1f2937', 5: '#334155', 6: '#334155' }

  const segments = markdownInlineNodesToPdfSegments(node.children).map((segment) =>
    segment.lineBreak ? segment : { ...segment, bold: true, color: colorByDepth[depth] },
  )
  writePdfInlineSegments(doc, segments, {
    fontSize: sizeByDepth[depth] || 12,
    color: colorByDepth[depth] || '#1f2937',
    paragraphGap: depth <= 2 ? 0.24 : 0.14,
    lineGap: 1.4,
  })
}

const renderPdfListNode = (doc: PdfWriterDoc, listNode: MarkdownAstNode, level = 0) => {
  const listItems = (listNode.children || []).filter((node) => node.type === 'listItem')
  const isOrdered = Boolean(listNode.ordered)
  let order = Number.isFinite(Number(listNode.start)) && Number(listNode.start) > 0 ? Number(listNode.start) : 1
  const baseIndent = Math.min(80, Math.max(0, level * 18))

  for (const item of listItems) {
    const blocks = item.children || []
    const firstParagraph = blocks.find((block) => block.type === 'paragraph')
    const marker = isOrdered ? `${order}. ` : '- '

    const contentSegments = firstParagraph
      ? markdownInlineNodesToPdfSegments(firstParagraph.children)
      : [{ text: '' }]

    writePdfInlineSegments(doc, [{ text: marker, bold: true, color: '#334155' }, ...contentSegments], {
      fontSize: 11,
      color: '#1f2937',
      indent: baseIndent,
      paragraphGap: 0.08,
      lineGap: 1.6,
    })

    for (const block of blocks) {
      if (block === firstParagraph) continue
      if (block.type === 'list') {
        renderPdfListNode(doc, block, level + 1)
      } else if (block.type === 'paragraph') {
        renderPdfParagraphNode(doc, block, baseIndent + 14)
      } else if (block.type === 'code') {
        renderPdfCodeBlockNode(doc, block, baseIndent + 12)
      } else if (block.type === 'blockquote') {
        const quoteParagraphs = (block.children || []).filter((n) => n.type === 'paragraph')
        for (const quote of quoteParagraphs) {
          writePdfInlineSegments(doc, [{ text: '> ', italics: true, color: '#64748b' }, ...markdownInlineNodesToPdfSegments(quote.children).map((segment) => ({ ...segment, italics: true }))], {
            fontSize: 10.8,
            color: '#475569',
            indent: baseIndent + 14,
            paragraphGap: 0.08,
          })
        }
      }
    }

    if (isOrdered) order += 1
  }

  doc.moveDown(level === 0 ? 0.1 : 0.04)
}

const renderPdfBlockNode = (doc: PdfWriterDoc, node: MarkdownAstNode, listLevel = 0) => {
  if (node.type === 'heading') {
    renderPdfHeadingNode(doc, node)
    return
  }

  if (node.type === 'paragraph') {
    renderPdfParagraphNode(doc, node)
    return
  }

  if (node.type === 'list') {
    renderPdfListNode(doc, node, listLevel)
    return
  }

  if (node.type === 'table') {
    renderPdfTableNode(doc, node)
    return
  }

  if (node.type === 'code') {
    renderPdfCodeBlockNode(doc, node)
    return
  }

  if (node.type === 'blockquote') {
    const quoteParagraphs = (node.children || []).filter((child) => child.type === 'paragraph')
    if (quoteParagraphs.length === 0) {
      writePdfInlineSegments(doc, [{ text: '' }], { paragraphGap: 0.08 })
      return
    }
    for (const paragraph of quoteParagraphs) {
      writePdfInlineSegments(doc, [{ text: '> ', italics: true, color: '#64748b' }, ...markdownInlineNodesToPdfSegments(paragraph.children).map((segment) => ({ ...segment, italics: true }))], {
        fontSize: 10.8,
        color: '#475569',
        indent: 8,
        paragraphGap: 0.1,
      })
    }
    return
  }

  if (node.type === 'thematicBreak') {
    writePdfInlineSegments(doc, [{ text: '----------------------------------------', color: '#cbd5e1' }], {
      fontSize: 9.5,
      color: '#cbd5e1',
      paragraphGap: 0.14,
    })
    return
  }

  if (node.type === 'text' || node.type === 'html') {
    const text = sanitizePdfText(cleanResidualMarkdownTokens(node.value || ''))
    if (text) {
      writePdfInlineSegments(doc, [{ text }], { fontSize: 11, color: '#1f2937', paragraphGap: 0.12 })
    }
    return
  }

  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      renderPdfBlockNode(doc, child, listLevel)
    }
  }
}

const buildPdfBufferFallbackPlainText = async (plainText: string, title: string): Promise<Buffer> => {
  const PDFDocumentCtor = await loadPdfDocumentCtor()

  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocumentCtor({ margin: 50, size: 'A4' })
    const chunks: Buffer[] = []

    doc.on('data', (chunk?: Uint8Array | Error) => {
      if (!chunk || chunk instanceof Error) return
      chunks.push(Buffer.from(chunk))
    })
    doc.on('error', (err?: Uint8Array | Error) => {
      const details = err instanceof Error ? err.message : 'Unknown PDF fallback error'
      reject(new Error(`PDF fallback failed: ${details}`))
    })
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    doc.font('Helvetica').fontSize(18).fillColor('#0f172a').text(sanitizePdfText(title || 'Documento'))
    doc.moveDown(0.6)
    doc.fontSize(11).fillColor('#1f2937').text(sanitizePdfText(plainText || 'Sin contenido'))
    doc.end()
  })
}

const buildPdfBufferFromMarkdown = async (markdown: string, title: string): Promise<Buffer> => {
  try {
    const PDFDocumentCtor = await loadPdfDocumentCtor()

    const validation = validateAndRepairMarkdownForExport(markdown)
    const safeMarkdown = validation.markdown

    let ast: MarkdownAstNode
    try {
      ast = await parseMarkdownToAst(safeMarkdown)
    } catch (parseErr) {
      console.error('[DocGen] PDF AST parse failed, fallback to plain text:', parseErr)
      return buildPdfBufferFallbackPlainText(markdownToPlainText(safeMarkdown), title)
    }

    const rootNodes = ast.children || []
    const firstHeading = rootNodes.find((node) => node.type === 'heading' && (node.depth || 1) <= 2)
    const firstHeadingText = firstHeading ? markdownInlineNodesToPlainText(firstHeading.children) : ''
    const resolvedTitle = sanitizePdfText((firstHeadingText || title || 'Documento').trim()) || 'Documento'
    const resolvedTitleKey = normalizeForKey(resolvedTitle)

    return await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocumentCtor({ margin: 50, size: 'A4' })
      const chunks: Buffer[] = []

      doc.on('data', (chunk?: Uint8Array | Error) => {
        if (!chunk || chunk instanceof Error) return
        chunks.push(Buffer.from(chunk))
      })
      doc.on('error', (err?: Uint8Array | Error) => {
        const details = err instanceof Error ? err.message : 'Unknown PDF error'
        reject(new Error(`PDF generation failed: ${details}`))
      })
      doc.on('end', () => resolve(Buffer.concat(chunks)))

      try {
        if (doc.info) {
          doc.info.Title = resolvedTitle
          doc.info.Creator = 'GIA'
        }

        writePdfInlineSegments(doc, [{ text: resolvedTitle, bold: true, color: '#0f172a' }], {
          fontSize: 22,
          color: '#0f172a',
          paragraphGap: 0.2,
          lineGap: 1.4,
        })
        writePdfInlineSegments(doc, [{ text: `Generado por GIA - ${new Date().toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}`, italics: true, color: '#64748b' }], {
          fontSize: 9.5,
          color: '#64748b',
          paragraphGap: 0.4,
        })

        let skippedTitleHeading = false
        for (const node of rootNodes) {
          if (node.type === 'heading' && (node.depth || 1) === 1) {
            const headingText = markdownInlineNodesToPlainText(node.children)
            if (!skippedTitleHeading && normalizeForKey(headingText) === resolvedTitleKey) {
              skippedTitleHeading = true
              continue
            }
          }

          renderPdfBlockNode(doc, node)
        }

        if (rootNodes.length === 0) {
          writePdfInlineSegments(doc, [{ text: 'Sin contenido' }], {
            fontSize: 11,
            color: '#1f2937',
            paragraphGap: 0.2,
          })
        }

        if (validation.issues.length > 0) {
          const warning = `Nota: se corrigieron ${validation.issues.length} incidencias de formato Markdown automaticamente.`
          writePdfInlineSegments(doc, [{ text: warning, italics: true, color: '#64748b' }], {
            fontSize: 8.8,
            color: '#64748b',
            paragraphGap: 0.1,
          })
        }

        doc.end()
      } catch (renderErr) {
        reject(renderErr instanceof Error ? renderErr : new Error('PDF render error'))
      }
    })
  } catch (pdfErr) {
    console.error('[DocGen] PDF rich render failed, using fallback:', pdfErr)
    try {
      const normalized = normalizeMarkdownLinksForPdf(markdown)
      return buildPdfBufferFallbackPlainText(markdownToPlainText(normalized), title)
    } catch {
      return buildPdfBufferFallbackPlainText(markdownToPlainText(markdown), title)
    }
  }
}

interface MarkdownTableData {
  headers: string[]
  rows: string[][]
}

const parseFirstMarkdownTable = (markdown: string): MarkdownTableData | null => {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const separatorRe = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/

  const splitCells = (line: string): string[] => (
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim())
  )

  for (let i = 0; i < lines.length - 1; i++) {
    const head = lines[i]
    const sep = lines[i + 1]
    if (!head.includes('|') || !separatorRe.test(sep)) continue

    const headers = splitCells(head)
    if (headers.length === 0) continue

    const rows: string[][] = []
    for (let j = i + 2; j < lines.length; j++) {
      const rowLine = lines[j]
      if (!rowLine.includes('|')) break
      const cells = splitCells(rowLine)
      if (cells.length === 0) break
      rows.push(cells)
    }

    if (rows.length > 0) return { headers, rows }
  }

  return null
}

const buildXlsxBufferFromMarkdown = async (markdown: string, prompt: string): Promise<Buffer> => {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const title = inferDocumentTitleFromPrompt(prompt)
  const normalized = normalizeMarkdownDocument(markdown, prompt)
  const firstTable = parseFirstMarkdownTable(normalized)

  if (firstTable) {
    const tableRows = firstTable.rows.map((row) => {
      const obj: Record<string, string | number> = {}
      firstTable.headers.forEach((header, idx) => {
        const raw = row[idx] ?? ''
        const num = toNumericValue(raw)
        obj[header || `Columna ${idx + 1}`] = num ?? raw
      })
      return obj
    })
    const dataSheet = XLSX.utils.json_to_sheet(tableRows)
    XLSX.utils.book_append_sheet(wb, dataSheet, 'Datos')

    const graphPrompt = normalizeForKey(prompt)
    const wantsChart = /\b(grafica|grafico|chart|dashboard)\b/.test(graphPrompt)
    const headers = firstTable.headers
    const numericHeader = headers.find((header) => {
      const values = tableRows.map((row) => toNumericValue(String(row[header] ?? ''))).filter((v): v is number => v !== null)
      return values.length >= Math.max(2, Math.floor(tableRows.length * 0.5))
    })
    const labelHeader = headers.find((header) => header !== numericHeader)

    if (wantsChart && numericHeader && labelHeader) {
      const labels = tableRows.map((row) => String(row[labelHeader] ?? '')).filter((value) => value.length > 0).slice(0, 10)
      const values = tableRows
        .map((row) => toNumericValue(String(row[numericHeader] ?? '')))
        .filter((value): value is number => value !== null)
        .slice(0, labels.length)

      if (labels.length >= 2 && values.length >= 2) {
        const chartUrl = buildQuickChartUrl(`${numericHeader} por ${labelHeader}`, labels, values)
        const chartRows = [
          { tipo: 'bar', titulo: `${numericHeader} por ${labelHeader}`, url_grafica: chartUrl },
        ]
        const chartSheet = XLSX.utils.json_to_sheet(chartRows)
        XLSX.utils.book_append_sheet(wb, chartSheet, 'Graficas')
      }
    }
  } else {
    const lines = markdownToPlainText(normalized)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    const fallbackRows = lines.map((line, idx) => ({
      linea: idx + 1,
      contenido: line,
    }))
    const fallbackSheet = XLSX.utils.json_to_sheet(fallbackRows.length > 0 ? fallbackRows : [{ linea: 1, contenido: title }])
    XLSX.utils.book_append_sheet(wb, fallbackSheet, 'Documento')
  }

  const result = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return Buffer.isBuffer(result) ? result : Buffer.from(result)
}

const buildSpreadsheetChartsPrefix = (charts: DeepResearchImage[]): string => {
  if (!charts.length) return ''
  const safe = charts.slice(0, 4)
  const imagesRow = safe
    .map((chart, idx) => `![Grafico ${idx + 1}](${chart.image_url})`)
    .join(' | ')
  const titlesRow = safe
    .map((chart) => sanitizeTitleForMarkdown(chart.source_title || 'Grafico'))
    .join(' | ')
  return `## Graficos automaticos\n\n| ${titlesRow} |\n| ${safe.map(() => '---').join(' | ')} |\n| ${imagesRow} |\n\n`
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const {
    conversation_id,
    input,
    model = 'gpt-4o-mini',
    rag_mode = 'assisted',
    cite_mode = true,
    web_search = false,
    db_query = false,
    network_drive_rag = false,
    image_generation = false,
    deep_research = false,
    document_generation = false,
    ocr_mode = false,
    spreadsheet_analysis = false,
    youtube_summary = false,
    code_interpreter = false,
    deep_research_mode = 'exhaustive',
    attachments = [],
    regenerate_message_id,
    skip_user_save = false,
  } = body
  const researchMode: ResearchMode = deep_research_mode === 'quick' ? 'quick' : 'exhaustive'
  const requestedAttachmentIds = Array.isArray(attachments)
    ? attachments.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
    : []
  const uniqueAttachmentIds = [...new Set(requestedAttachmentIds)]
  const inputText = typeof input === 'string' ? input.trim() : ''
  const hasInput = inputText.length > 0
  const normalizedInput = hasInput
    ? inputText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    : ''
  const asksForFileListIntent = hasInput
    && /(archivo|archivos|fichero|ficheros|fitxer|fitxers|documento|documentos|documents|pdf|docx|word|excel|xlsx)/.test(normalizedInput)
    && /(que tienes|que hay|lista|listar|disponibles|muestr|ensen|mostra|dime|inventario)/.test(normalizedInput)

  if (!conversation_id || (!hasInput && !regenerate_message_id && uniqueAttachmentIds.length === 0)) {
    return new Response('Missing fields', { status: 400 })
  }

  const serviceClient = createServiceRoleClient()
  const { data: conversationMeta } = await serviceClient
    .from('conversations')
    .select('id, user_id, project_id')
    .eq('id', conversation_id)
    .single()

  // Service-role client bypasses RLS: enforce ownership explicitly.
  if (!conversationMeta || conversationMeta.user_id !== user.id) {
    return new Response('Conversation not found', { status: 404 })
  }

  const conversationProjectId = conversationMeta.project_id || null
  let validAttachmentsPayload: Array<{
    file_id: string
    filename: string
    mime: string
    size: number
    storage_path: string
  }> = []

  if (uniqueAttachmentIds.length > 0) {
    // Service-role client bypasses RLS: explicitly restrict attachments to the current user.
    const { data: ownedFiles } = await serviceClient
      .from('files')
      .select('id, filename, mime, size, storage_path')
      .eq('user_id', user.id)
      .in('id', uniqueAttachmentIds)

    validAttachmentsPayload = (ownedFiles || []).map((f: {
      id: string
      filename: string
      mime: string | null
      size: number | null
      storage_path: string
    }) => ({
      file_id: f.id,
      filename: f.filename || 'archivo',
      mime: f.mime || 'application/octet-stream',
      size: typeof f.size === 'number' ? f.size : 0,
      storage_path: f.storage_path,
    }))
  }

  const hasImageAttachment = validAttachmentsPayload.some((file) => file.mime.toLowerCase().startsWith('image/'))
  const spreadsheetAttachments = validAttachmentsPayload.filter((file) => isSpreadsheetAttachment(file.filename, file.mime))
  const youtubeVideoIds = hasInput ? extractYouTubeVideoIds(inputText) : []
  const requestedDocumentFormat = inferDocumentOutputFormat(inputText || '')

  const autoDocumentIntent = hasInput && DOC_REQUEST_RE.test(inputText) && DOC_GENERATE_RE.test(inputText)
  const effectiveDocumentGeneration = Boolean(document_generation || autoDocumentIntent)
  // OCR is now automatic when images are attached.
  const effectiveOcrMode = Boolean(hasImageAttachment || ocr_mode || (hasInput && OCR_REQUEST_RE.test(inputText)))
  const effectiveSpreadsheetAnalysis = Boolean(
    spreadsheet_analysis
    || (spreadsheetAttachments.length > 0 && (!hasInput || SPREADSHEET_REQUEST_RE.test(inputText)))
  )
  const effectiveYoutubeSummary = Boolean(
    youtubeVideoIds.length > 0
    || youtube_summary
    || (hasInput && YOUTUBE_REQUEST_RE.test(inputText) && youtubeVideoIds.length > 0)
  )

  // Save user message (if not regeneration and not editing)
  if (!regenerate_message_id && !skip_user_save && (hasInput || validAttachmentsPayload.length > 0)) {
    await serviceClient.from('messages').insert({
      conversation_id, user_id: user.id, role: 'user', content: hasInput ? inputText : '',
      attachments_json: validAttachmentsPayload,
    })
  }

  // Load conversation history
  const { data: allMessages } = await serviceClient.from('messages').select('role, content, attachments_json')
    .eq('conversation_id', conversation_id).order('created_at').limit(60)

  // Ã¢â€â‚¬Ã¢â€â‚¬ Sistema de contexto conversacional (con cachÃƒÂ©) Ã¢â€â‚¬Ã¢â€â‚¬
  // Si hay muchos mensajes, resumir los antiguos para mantener contexto sin gastar tokens
  // El resumen se cachea en la BD y solo se regenera cuando hay Ã¢â€°Â¥5 mensajes nuevos
  let conversationSummary = ''
  let recentMessages = allMessages || []
  if (allMessages && allMessages.length > 16) {
    const oldMessages = allMessages.slice(0, -10)
    const oldMessageCount = oldMessages.length
    recentMessages = allMessages.slice(-10)

    // Intentar cargar resumen cacheado de la BD
    const { data: conv } = await serviceClient.from('conversations')
      .select('context_summary, summary_message_count')
      .eq('id', conversation_id)
      .single()

    const cachedSummary = conv?.context_summary
    const cachedCount = conv?.summary_message_count ?? 0
    const newMessagesSinceSummary = oldMessageCount - cachedCount

    // Usar cachÃƒÂ© si existe y no han pasado Ã¢â€°Â¥5 mensajes nuevos desde que se generÃƒÂ³
    if (cachedSummary && newMessagesSinceSummary < 5) {
      conversationSummary = cachedSummary
      console.log('[Context] Using cached summary (', cachedCount, 'msgs, +', newMessagesSinceSummary, 'new)')
    } else {
      // Regenerar resumen y guardarlo en BD
      try {
        console.log('[Context] Generating new summary for', oldMessageCount, 'msgs (cache had', cachedCount, ')')
        const summaryRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini', max_tokens: 400, temperature: 0.2,
            messages: [
              { role: 'system', content: 'Resume brevemente los puntos clave de esta conversaciÃƒÂ³n entre un usuario y un asistente de IA. EnfÃƒÂ³cate en: temas discutidos, decisiones tomadas, informaciÃƒÂ³n importante compartida, preferencias del usuario, y contexto relevante para continuar la conversaciÃƒÂ³n. SÃƒÂ© conciso pero completo. Responde en espaÃƒÂ±ol.' },
              { role: 'user', content: oldMessages.map((m: { role: string; content: string }) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content.substring(0, 300)}`).join('\n\n') },
            ],
          }),
        })
        const summaryData = await summaryRes.json()
        conversationSummary = summaryData.choices?.[0]?.message?.content?.trim() || ''
        console.log('[Context] Summary generated:', conversationSummary.substring(0, 100) + '...')

        // Guardar en BD para futuras peticiones
        if (conversationSummary) {
          await serviceClient.from('conversations').update({
            context_summary: conversationSummary,
            summary_message_count: oldMessageCount,
            summary_generated_at: new Date().toISOString(),
          }).eq('id', conversation_id)
          console.log('[Context] Summary cached in DB')
        }
      } catch (e) { console.error('[Context] Summary error:', e) }
    }
  }
  const messages = recentMessages
  const recentConversationAttachmentIds = [
    ...new Set(
      (allMessages || []).flatMap((m: { attachments_json?: unknown }) =>
        extractAttachmentIdsFromMessage(m.attachments_json)
      )
    ),
  ]

  // Load profile for custom instructions
  const { data: profile } = await serviceClient.from('profiles').select('*').eq('id', user.id).single()

  // Load user memories
  const { data: userMemories } = await serviceClient.from('memories').select('content')
    .eq('user_id', user.id).eq('scope', 'user').eq('enabled', true)

  // Load project instructions + memories (when the conversation belongs to a project)
  const projectIdForPrompt: string | null = conversationProjectId

  let projectInstructions = ''
  let projectName = ''
  let projectMemories: { content: string }[] = []
  let projectFileInventoryContext = ''
  if (projectIdForPrompt) {
    try {
      const { data: project } = await serviceClient
        .from('projects')
        .select('name, instructions')
        .eq('id', projectIdForPrompt)
        .single()
      projectName = project?.name || ''
      projectInstructions = (project?.instructions || '').trim()

      const { data: projMems } = await serviceClient
        .from('memories')
        .select('content')
        .eq('user_id', user.id)
        .eq('scope', 'project')
        .eq('project_id', projectIdForPrompt)
        .eq('enabled', true)
      projectMemories = (projMems || []) as { content: string }[]

      if (asksForFileListIntent) {
        const { data: projectFiles, error: projectFilesError } = await serviceClient
          .from('files')
          .select('id, filename, mime, size, ingest_status, created_at')
          .eq('project_id', projectIdForPrompt)
          .order('created_at', { ascending: false })
          .limit(500)

        if (!projectFilesError && projectFiles && projectFiles.length > 0) {
          const projectFileIds = projectFiles
            .map((row: { id?: string | null }) => row.id || null)
            .filter((id: string | null): id is string => Boolean(id))
          const chunkPreviewMap = new Map<string, string>()
          if (projectFileIds.length > 0) {
            const { data: previewChunks } = await serviceClient
              .from('file_chunks')
              .select('file_id, chunk_index, content')
              .in('file_id', projectFileIds)
              .order('chunk_index', { ascending: true })
              .limit(Math.min(1200, projectFileIds.length * 4))

            for (const chunk of previewChunks || []) {
              const fileId = String((chunk as { file_id?: string }).file_id || '')
              if (!fileId || chunkPreviewMap.has(fileId)) continue
              const content = String((chunk as { content?: string }).content || '')
              if (!content.trim()) continue
              chunkPreviewMap.set(fileId, content.replace(/\s+/g, ' ').trim().slice(0, 260))
            }
          }

          const extCounts = new Map<string, number>()
          const statusCounts = new Map<string, number>()
          const validRows = projectFiles.filter((row: { filename: string | null }) => Boolean(row.filename))

          for (const row of validRows) {
            const filename = (row.filename || '').toLowerCase()
            const extFromName = filename.includes('.') ? filename.split('.').pop() || 'sin_ext' : 'sin_ext'
            extCounts.set(extFromName, (extCounts.get(extFromName) || 0) + 1)
            const status = (row.ingest_status || 'none').toLowerCase()
            statusCounts.set(status, (statusCounts.get(status) || 0) + 1)
          }

          const extSummary = Array.from(extCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([ext, count]) => `${ext}: ${count}`)
            .join(' | ')

          const statusSummary = Array.from(statusCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([status, count]) => `${status}: ${count}`)
            .join(' | ')

          const maxRowsInPrompt = 220
          const rows = validRows.slice(0, maxRowsInPrompt)
          const listBlock = rows
            .map((row: { id?: string | null; filename: string | null; mime: string | null; size: number | null; ingest_status: string | null }, idx: number) => {
              const preview = row.id ? chunkPreviewMap.get(row.id) : ''
              return (
                `${idx + 1}. ${row.filename}\n` +
                `Tipo: ${row.mime || 'application/octet-stream'}\n` +
                `Tamano: ${((row.size || 0) / 1024).toFixed(1)} KB\n` +
                `Estado: ${row.ingest_status || 'none'}\n` +
                `Fragmento: ${preview || 'Sin contenido indexado aun (reindexar/ocr si es escaneado).'}`
              )
            })
            .join('\n\n')

          const remaining = Math.max(0, validRows.length - maxRowsInPrompt)
          const remainingLine = remaining > 0 ? `\n\n... y ${remaining} archivos mas no listados por limite de contexto.` : ''

          projectFileInventoryContext =
            `Inventario real de archivos del proyecto${projectName ? ` "${projectName}"` : ''}: ${validRows.length} archivos.\n` +
            `Resumen por extension: ${extSummary || 'sin datos'}\n` +
            `Resumen por estado de ingesta: ${statusSummary || 'sin datos'}\n\n` +
            `${listBlock}${remainingLine}`
        }
      }
    } catch (e) {
      console.error('[Project] Error loading project instructions/memories:', e)
    }
  }

  // Build system prompt
  let systemPrompt = 'Eres GIA (GestiÃƒÂ³n Inteligente con IA), un asistente de IA empresarial. Responde siempre en espaÃƒÂ±ol salvo que el usuario pida otro idioma. SÃƒÂ© directo, conciso y ÃƒÂºtil. Cuando tengas datos concretos de bÃƒÂºsquedas web, documentos o bases de datos, ÃƒÂºsalos directamente para responder Ã¢â‚¬â€ nunca digas que no puedes acceder a informaciÃƒÂ³n en tiempo real si se te proporcionan resultados de bÃƒÂºsqueda.'

  // Add conversation context summary
  if (conversationSummary) {
    systemPrompt += `\n\n[CONTEXTO DE LA CONVERSACIÃƒâ€œN]\nResumen de lo discutido anteriormente en esta conversaciÃƒÂ³n:\n${conversationSummary}\n\nTen en cuenta este contexto al responder. MantÃƒÂ©n coherencia con lo ya discutido.`
  }

  if (profile?.custom_instructions_enabled) {
    if (profile.custom_instructions_what) systemPrompt += `Sobre el usuario: ${profile.custom_instructions_what}`
    if (profile.custom_instructions_how) systemPrompt += `${systemPrompt ? '\n\n' : ''}CÃƒÂ³mo responder: ${profile.custom_instructions_how}`
  }

  if (userMemories && userMemories.length > 0) {
    systemPrompt += '\n\nRecuerdos del usuario:\n' + userMemories.map((m: { content: string }) => `- ${m.content}`).join('\n')
  }

  // Code Interpreter instructions
  if (code_interpreter) {
    systemPrompt += `\n\n[CODE INTERPRETER ACTIVADO]
Tienes acceso a un intérprete de Python seguro. Cuando necesites:
- Realizar cálculos complejos
- Analizar datos
- Crear visualizaciones
- Procesar información numérica
- Ejecutar algoritmos

Escribe código Python dentro de bloques de código markdown con el lenguaje especificado:
\`\`\`python
# Tu código aquí
import numpy as np
result = np.mean([1, 2, 3, 4, 5])
print(f"Media: {result}")
\`\`\`

El código se ejecutará automáticamente y verás los resultados. Librerías disponibles: numpy, pandas, matplotlib, scipy, requests.
IMPORTANTE: Siempre usa print() para mostrar resultados. El código se ejecuta en un sandbox seguro con límites de tiempo y memoria.`
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Mejora 5: Embedding compartido entre RAG y Network RAG Ã¢â€â‚¬Ã¢â€â‚¬
  if (projectIdForPrompt) {
    if (projectInstructions) {
      systemPrompt += `\n\n[INSTRUCCIONES DEL PROYECTO${projectName ? `: ${projectName}` : ''}]\n${projectInstructions}`
    }
    if (projectMemories && projectMemories.length > 0) {
      systemPrompt += '\n\nRecuerdos del proyecto:\n' + projectMemories.map((m) => `- ${m.content}`).join('\n')
    }
    if (projectFileInventoryContext) {
      systemPrompt += `\n\n[INVENTARIO DE ARCHIVOS DEL PROYECTO]\n${projectFileInventoryContext}\n\nSi el usuario pregunta por documentos disponibles, responde usando este inventario real. No digas que no hay documentos si aparecen en esta lista.`
    }
  }

  let spreadsheetChartImages: DeepResearchImage[] = []
  let youtubeSummaries: YouTubeSummaryInput[] = []
  let ocrOutput: OcrToolOutput | null = null

  if (effectiveDocumentGeneration) {
    const targetFormat = requestedDocumentFormat.ext.toUpperCase()
    const formatRules = requestedDocumentFormat.ext === 'xlsx'
      ? '- Incluye al menos una tabla markdown con cabeceras claras y filas consistentes.\n- Si el usuario pide graficas, incluye una tabla con una columna categorica y otra numerica.'
      : requestedDocumentFormat.ext === 'json'
        ? '- Devuelve JSON valido y bien formateado, sin texto adicional fuera del JSON.'
        : '- Entrega contenido Markdown limpio y estructurado para convertirlo al formato final.'

    systemPrompt += `\n\n[GENERACION DE DOCUMENTO]\nDebes generar un documento descargable.
FORMATO OBJETIVO: ${targetFormat}.
REGLAS OBLIGATORIAS:
1. Responde SOLO con el contenido del documento. No incluyas frases de asistente (ej.: "aqui tienes...").
2. Empieza con un unico titulo H1 (# Titulo).
3. Usa estructura profesional con secciones H2/H3, listas y tablas solo cuando aporten claridad real.
4. No envuelvas todo el documento dentro de bloques de codigo (\`\`\`).
5. Evita texto de relleno o plantillas vacias.
6. Manten formato Markdown valido y legible (espaciado correcto, headings consistentes).
7. ${formatRules}`
  }

  if (effectiveYoutubeSummary && youtubeVideoIds.length > 0) {
    try {
      const summaryInputs = await runWithConcurrency(
        youtubeVideoIds.slice(0, 2),
        2,
        async (videoId): Promise<YouTubeSummaryInput> => {
          const [metadata, transcript] = await Promise.all([
            fetchYouTubeMetadata(videoId),
            fetchYouTubeTranscript(videoId),
          ])
          let fallbackSources: WebSearchResult[] = []
          if (!transcript || transcript.length < 120) {
            fallbackSources = await searchWeb(`${metadata.title} ${metadata.author} resumen`, 5)
          }
          return {
            videoId,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            title: metadata.title,
            author: metadata.author,
            transcript: transcript.slice(0, 12000),
            fallbackSources,
          }
        }
      )

      youtubeSummaries = summaryInputs.filter((item) => Boolean(item))
      if (youtubeSummaries.length > 0) {
        const ytContext = youtubeSummaries.map((item, idx) => {
          const sourceBlock = item.fallbackSources.length > 0
            ? item.fallbackSources
              .slice(0, 4)
              .map((src, srcIdx) => `${srcIdx + 1}. ${src.title} - ${src.snippet}`.slice(0, 320))
              .join('\n')
            : 'Sin fuentes externas adicionales.'
          return [
            `Video ${idx + 1}: ${item.title} (${item.author})`,
            `URL: ${item.url}`,
            item.transcript
              ? `Transcripcion/descripcion:\n${item.transcript}`
              : 'Transcripcion no disponible.',
            `Fuentes de apoyo:\n${sourceBlock}`,
          ].join('\n')
        }).join('\n\n---\n\n')

        systemPrompt += `\n\n[RESUMEN DE YOUTUBE]\n${ytContext}\n\nSi el usuario solicita resumen, devuelve: (1) resumen ejecutivo, (2) puntos clave accionables, (3) riesgos o limitaciones, y (4) proximo paso recomendado.`
      }
    } catch (youtubeErr) {
      console.error('[YouTube] Summary preparation error:', youtubeErr)
    }
  }

  if (effectiveSpreadsheetAnalysis && spreadsheetAttachments.length > 0) {
    try {
      const XLSX = await import('xlsx')
      const analysisBlocks: string[] = []
      const chartCandidates: DeepResearchImage[] = []

      for (const attachment of spreadsheetAttachments.slice(0, 3)) {
        const { data: fileData } = await serviceClient.storage.from('user-files').download(attachment.storage_path)
        if (!fileData) continue

        const buffer = Buffer.from(await fileData.arrayBuffer())
        const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
        const sheetNames = (workbook.SheetNames || []).slice(0, 3)

        for (const sheetName of sheetNames) {
          const sheet = workbook.Sheets[sheetName]
          if (!sheet) continue

          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false })
          if (rows.length === 0) continue

          const sampledRows = rows.slice(0, 1200)
          const columns = Array.from(new Set(sampledRows.flatMap((row) => Object.keys(row)))).slice(0, 40)
          if (columns.length === 0) continue

          const numericColumns = columns
            .map((column) => {
              const values = sampledRows
                .map((row) => toNumericValue(row[column]))
                .filter((num): num is number => typeof num === 'number')
              return { column, values }
            })
            .filter((entry) => entry.values.length >= Math.max(5, Math.floor(sampledRows.length * 0.18)))
            .sort((a, b) => b.values.length - a.values.length)
            .slice(0, 4)

          const lineParts = [
            `Archivo: ${attachment.filename}`,
            `Hoja: ${sheetName}`,
            `Filas: ${rows.length}`,
            `Columnas: ${columns.length}`,
          ]

          if (numericColumns.length > 0) {
            const statLines = numericColumns.map((entry) => {
              const sum = entry.values.reduce((acc, value) => acc + value, 0)
              const avg = sum / entry.values.length
              const min = Math.min(...entry.values)
              const max = Math.max(...entry.values)
              return `${entry.column}: avg=${avg.toFixed(2)}, min=${min.toFixed(2)}, max=${max.toFixed(2)}`
            })
            lineParts.push(`Metricas numericas: ${statLines.join(' | ')}`)
          } else {
            lineParts.push('No se detectaron columnas numericas consistentes en esta hoja.')
          }

          if (numericColumns.length > 0) {
            const metric = numericColumns[0].column
            const categoryCandidates = columns
              .map((column) => {
                const values = sampledRows
                  .map((row) => (typeof row[column] === 'string' ? row[column].trim() : ''))
                  .filter((value) => value.length > 0)
                const unique = new Set(values)
                return { column, values, uniqueCount: unique.size }
              })
              .filter((entry) => entry.uniqueCount >= 2 && entry.uniqueCount <= 12 && entry.values.length >= 5)
              .sort((a, b) => b.values.length - a.values.length)

            const dim = categoryCandidates[0]
            if (dim) {
              const aggregated = new Map<string, { total: number; count: number }>()
              for (const row of sampledRows) {
                const rawLabel = row[dim.column]
                const label = typeof rawLabel === 'string' ? rawLabel.trim() : ''
                const metricValue = toNumericValue(row[metric])
                if (!label || metricValue === null) continue
                const current = aggregated.get(label) || { total: 0, count: 0 }
                current.total += metricValue
                current.count += 1
                aggregated.set(label, current)
              }

              const topBuckets = Array.from(aggregated.entries())
                .map(([label, item]) => ({ label, value: item.total }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 10)

              if (topBuckets.length >= 2) {
                const chartUrl = buildQuickChartUrl(
                  `${attachment.filename} - ${metric} por ${dim.column}`,
                  topBuckets.map((bucket) => bucket.label),
                  topBuckets.map((bucket) => bucket.value),
                  'bar'
                )
                chartCandidates.push({
                  image_url: chartUrl,
                  source_url: chartUrl,
                  source_title: `${attachment.filename} (${sheetName})`,
                })
                lineParts.push(`Distribucion destacada: ${metric} por ${dim.column}.`)
              }
            }
          }

          analysisBlocks.push(lineParts.join('\n'))
        }
      }

      if (analysisBlocks.length > 0) {
        spreadsheetChartImages = chartCandidates.slice(0, 4)
        systemPrompt += `\n\n[ANALISIS DE EXCEL/CSV]\n${analysisBlocks.join('\n\n---\n\n')}\n\nUsa este analisis para responder al usuario con conclusiones practicas, riesgos detectados y recomendaciones accionables.`
      }
    } catch (spreadsheetErr) {
      console.error('[Spreadsheet] Analysis error:', spreadsheetErr)
      systemPrompt += '\n\n[ANALISIS EXCEL/CSV]\nNo se pudo completar el analisis automatico de la hoja de calculo. Informa al usuario y pide reintentar con un archivo valido.'
    }
  }

  let sharedEmbedding: number[] | null = null
  const explicitAttachmentFileIds = validAttachmentsPayload
    .filter((file) => !file.mime.toLowerCase().startsWith('image/'))
    .map((file) => file.file_id)
  // PRIORITY: If current message has explicit attachments, use ONLY those.
  // Otherwise, fall back to conversation history attachments.
  // This ensures when user uploads a new file, we analyze THAT file, not old ones.
  const attachmentFileIdsForRag = explicitAttachmentFileIds.length > 0
    ? explicitAttachmentFileIds
    : [
        ...new Set(recentConversationAttachmentIds),
      ].filter((id) => {
        // Exclude image-only attachments from RAG (handled by vision pipeline)
        const payload = validAttachmentsPayload.find((f) => f.file_id === id)
        if (payload && payload.mime.toLowerCase().startsWith('image/')) return false
        return true
      })
  const needsEmbedding = (rag_mode !== 'off' || network_drive_rag || attachmentFileIdsForRag.length > 0) && inputText
  const attachmentNameMap = new Map(validAttachmentsPayload.map((file) => [file.file_id, file.filename]))
  let attachmentContextRows: Array<{ id: string; filename: string; ingest_status: string | null; storage_path: string; mime: string; size: number }> = []
  if (attachmentFileIdsForRag.length > 0) {
    const { data: attachmentRows } = await serviceClient
      .from('files')
      .select('id, filename, ingest_status, storage_path, mime, size')
      .eq('user_id', user.id)
      .in('id', attachmentFileIdsForRag)
    attachmentContextRows = (attachmentRows || []).map((r: Record<string, unknown>) => ({
      id: String(r.id || ''),
      filename: String(r.filename || 'archivo'),
      ingest_status: r.ingest_status ? String(r.ingest_status) : null,
      storage_path: String(r.storage_path || ''),
      mime: String(r.mime || 'application/octet-stream'),
      size: typeof r.size === 'number' ? r.size : 0,
    }))
    for (const row of attachmentContextRows) {
      if (!attachmentNameMap.has(row.id)) {
        attachmentNameMap.set(row.id, row.filename || 'archivo')
      }
    }
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Mejora 10: Verificar cachÃƒÂ© de HyDE antes de llamar a APIs Ã¢â€â‚¬Ã¢â€â‚¬
  const cacheKey = inputText.toLowerCase().trim()
  const cached = hydeCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < HYDE_CACHE_TTL && needsEmbedding) {
    console.log('[HyDE Cache] Hit! Reusing cached embedding')
    sharedEmbedding = cached.embedding
  } else {
    // Limpiar entradas expiradas del cachÃƒÂ©
    for (const [key, val] of hydeCache) {
      if (Date.now() - val.timestamp > HYDE_CACHE_TTL) hydeCache.delete(key)
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬ Mejora 6: HyDE - Expandir query con LLM antes de buscar Ã¢â€â‚¬Ã¢â€â‚¬
    let searchQuery = inputText
    if (network_drive_rag && inputText) {
      try {
        console.log('[HyDE] Expanding query...')
        const hydeRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini', max_tokens: 200, temperature: 0.3,
            messages: [
              { role: 'system', content: 'Eres un asistente que expande preguntas del usuario en un pÃƒÂ¡rrafo descriptivo hipotÃƒÂ©tico que podrÃƒÂ­a encontrarse en un documento de empresa. Escribe como si fuera un fragmento real de un documento que responde la pregunta. Solo genera el pÃƒÂ¡rrafo, sin explicaciones.' },
              { role: 'user', content: inputText },
            ],
          }),
        })
        const hydeData = await hydeRes.json()
        const expanded = hydeData.choices?.[0]?.message?.content?.trim()
        if (expanded) {
          searchQuery = expanded
          console.log('[HyDE] Expanded to:', expanded.substring(0, 100) + '...')
        }
      } catch (e) { console.error('[HyDE] Error:', e) }
    }

    if (needsEmbedding) {
      try {
        const embRes = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: searchQuery, model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small' }),
        })
        const embData = await embRes.json()
        sharedEmbedding = embData.data?.[0]?.embedding || null
        console.log('[Embedding] Generated shared embedding, dims:', sharedEmbedding?.length)
        // Guardar en cachÃƒÂ©
        if (sharedEmbedding && cacheKey) {
          hydeCache.set(cacheKey, { embedding: sharedEmbedding, timestamp: Date.now() })
          console.log('[HyDE Cache] Stored embedding for:', cacheKey.substring(0, 50))
        }
      } catch (e) { console.error('[Embedding] Error:', e) }
    }
  }

  // RAG context (archivos del proyecto)
  let ragSources: Array<{ chunk_id: string; file_id: string; filename: string; page?: number; chunk_index: number; snippet: string; similarity: number }> = []
  if (rag_mode !== 'off' && inputText && sharedEmbedding && conversationProjectId) {
      try {
        let chunksResult: Array<{ id: string; file_id: string; page: number | null; chunk_index: number; content: string; similarity: number }> = []

        const { data: primaryChunks } = await serviceClient.rpc('match_file_chunks', {
          p_project_id: conversationProjectId,
          p_query_embedding: sharedEmbedding,
          p_match_count: 8,
          p_similarity_threshold: 0.62,
        })
        if (Array.isArray(primaryChunks) && primaryChunks.length > 0) {
          chunksResult = primaryChunks as Array<{ id: string; file_id: string; page: number | null; chunk_index: number; content: string; similarity: number }>
        } else {
          const { data: fallbackChunks } = await serviceClient.rpc('match_file_chunks', {
            p_project_id: conversationProjectId,
            p_query_embedding: sharedEmbedding,
            p_match_count: 10,
            p_similarity_threshold: 0.48,
          })
          if (Array.isArray(fallbackChunks) && fallbackChunks.length > 0) {
            chunksResult = fallbackChunks as Array<{ id: string; file_id: string; page: number | null; chunk_index: number; content: string; similarity: number }>
          }
        }

        if (chunksResult.length > 0) {
          const fileIds = [...new Set(chunksResult.map((c) => c.file_id))]
          const { data: files } = await serviceClient.from('files').select('id, filename').in('id', fileIds)
          const fileMap = new Map<string, string>((files || []).map((f: { id: string; filename: string }) => [f.id, f.filename]))

          ragSources = chunksResult.map((c) => ({
            chunk_id: c.id, file_id: c.file_id,
            filename: fileMap.get(c.file_id) || 'unknown',
            page: c.page ?? undefined, chunk_index: c.chunk_index,
            snippet: c.content.substring(0, 200), similarity: c.similarity,
          }))

          const ragContext = chunksResult.map((c, i: number) =>
            `[Fuente ${i + 1}: ${fileMap.get(c.file_id) || 'archivo'}${c.page ? ` p.${c.page}` : ''}]\n${c.content}`
          ).join('\n\n')

          if (rag_mode === 'strict') {
            systemPrompt += `\n\nIMPORTANTE: Responde SOLAMENTE usando la informaciÃƒÂ³n de las siguientes fuentes. Si no hay informaciÃƒÂ³n suficiente, di "No tengo suficiente informaciÃƒÂ³n en tus archivos para responder esta pregunta."\n\nFuentes:\n${ragContext}`
          } else {
            systemPrompt += `\n\nPuedes usar estas fuentes de conocimiento del proyecto del usuario cuando sean relevantes:\n${ragContext}`
          }
          if (cite_mode) {
            systemPrompt += '\n\nCita las fuentes que uses en tu respuesta indicando [Fuente N].'
          }
        } else if (rag_mode === 'strict') {
          systemPrompt += '\n\nNo se encontraron fuentes relevantes. Informa al usuario que no tienes informaciÃƒÂ³n suficiente en sus archivos.'
        }
      } catch (e) {
        console.error('RAG error:', e)
      }
  }

  // RAG context (archivos adjuntos del usuario, incluso fuera de proyectos)
  let attachmentRagSources: Array<{ chunk_id: string; file_id: string; filename: string; page?: number; chunk_index: number; snippet: string; similarity: number }> = []

  // Network drive RAG sources (for citations)
  let networkSources: Array<{ chunk_id: string; file_id: string; filename: string; chunk_index: number; snippet: string; similarity: number; source_type: 'network'; network_file_id: string; network_file_path: string }> = []

  if (attachmentFileIdsForRag.length > 0 && inputText && sharedEmbedding) {
    try {
      let chunksResult: Array<{ id: string; file_id: string; page: number | null; chunk_index: number; content: string; similarity: number }> = []

      const { data: primaryChunks, error: primaryError } = await serviceClient.rpc('match_user_file_chunks', {
        p_user_id: user.id,
        p_query_embedding: sharedEmbedding,
        p_match_count: 8,
        p_similarity_threshold: 0.58,
        p_file_ids: attachmentFileIdsForRag,
      })
      if (primaryError) throw primaryError
      if (primaryChunks && primaryChunks.length > 0) {
        chunksResult = primaryChunks as Array<{ id: string; file_id: string; page: number | null; chunk_index: number; content: string; similarity: number }>
      } else {
        const { data: fallbackChunks, error: fallbackError } = await serviceClient.rpc('match_user_file_chunks', {
          p_user_id: user.id,
          p_query_embedding: sharedEmbedding,
          p_match_count: 8,
          p_similarity_threshold: 0.38,
          p_file_ids: attachmentFileIdsForRag,
        })
        if (fallbackError) throw fallbackError
        if (fallbackChunks && fallbackChunks.length > 0) {
          chunksResult = fallbackChunks as Array<{ id: string; file_id: string; page: number | null; chunk_index: number; content: string; similarity: number }>
        }
      }

      // Generic prompts like "analiza el pdf" often don't match semantically.
      // Fall back to first chunks from the attached files.
      if (chunksResult.length === 0) {
        const { data: rawChunks, error: rawChunksError } = await serviceClient
          .from('file_chunks')
          .select('id, file_id, page, chunk_index, content')
          .in('file_id', attachmentFileIdsForRag)
          .order('chunk_index', { ascending: true })
          .limit(Math.min(16, attachmentFileIdsForRag.length * 4))

        if (rawChunksError) throw rawChunksError
        chunksResult = (rawChunks || []).map((chunk: Record<string, unknown>) => ({
          id: String((chunk as { id?: unknown }).id || ''),
          file_id: String((chunk as { file_id?: unknown }).file_id || ''),
          page: Number.isFinite((chunk as { page?: unknown }).page) ? Number((chunk as { page?: unknown }).page) : null,
          chunk_index: Number((chunk as { chunk_index?: unknown }).chunk_index || 0),
          content: String((chunk as { content?: unknown }).content || ''),
          similarity: 0,
        })).filter((chunk: { id: string; file_id: string; content: string }) => chunk.id && chunk.file_id && chunk.content)
      }

      if (chunksResult.length > 0) {
        attachmentRagSources = chunksResult.map((c) => ({
          chunk_id: c.id,
          file_id: c.file_id,
          filename: attachmentNameMap.get(c.file_id) || 'archivo',
          page: c.page || undefined,
          chunk_index: c.chunk_index,
          snippet: c.content.substring(0, 200),
          similarity: c.similarity,
        }))

        const ragContext = chunksResult.map((c, i: number) =>
          `[Adjunto ${i + 1}: ${attachmentNameMap.get(c.file_id) || 'archivo'}${c.page ? ` p.${c.page}` : ''}]\n${c.content}`
        ).join('\n\n')

        systemPrompt += `\n\nPuedes usar estas fuentes de los archivos adjuntos del usuario cuando sean relevantes:\n${ragContext}`
        if (cite_mode) {
          systemPrompt += '\n\nSi usas informacion de los adjuntos, citala indicando [Adjunto N].'
        }
      } else if (attachmentContextRows.length > 0) {
        // No chunks found — try inline text extraction directly from storage
        console.log('[Attachments] No chunks found, attempting inline text extraction for', attachmentContextRows.length, 'files')

        // Load document analysis configuration for inline extraction
        let extractionConfig: import('@/lib/project-file-ingest').DocAnalysisConfig | undefined
        try {
          const { data: configData } = await serviceClient
            .from('doc_analysis_config')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

          if (configData) {
            extractionConfig = {
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
            console.log(`[Attachments] Using ${extractionConfig.extraction_engine} extraction engine for inline extraction`)
          }
        } catch (configError) {
          console.warn('[Attachments] Could not load extraction config, using defaults:', configError)
        }

        const inlineTexts: string[] = []

        for (const row of attachmentContextRows) {
          // Use attachmentContextRows directly (has storage_path, mime, size from DB)
          // instead of validAttachmentsPayload which only has current-message files.
          if (!row.storage_path) continue
          if (row.mime.toLowerCase().startsWith('image/')) continue
          if (row.size > 20 * 1024 * 1024) continue // Skip files >20MB

          try {
            const { data: blob, error: dlErr } = await serviceClient.storage
              .from('user-files')
              .download(row.storage_path)
            if (dlErr || !blob) {
              console.error('[Attachments] Download failed for', row.filename, dlErr?.message)
              continue
            }
            const buffer = Buffer.from(await blob.arrayBuffer())
            const result = await extractTextAndMetadata(buffer, row.mime, row.filename, {}, extractionConfig)
            if (result.text && result.text.length > 50) {
              const truncated = result.text.length > 32000
                ? result.text.substring(0, 32000) + '\n\n[...texto truncado...]'
                : result.text
              inlineTexts.push(`[Adjunto: ${row.filename}${result.pages ? ` (${result.pages} páginas)` : ''}]\n${truncated}`)
              console.log('[Attachments] Inline extraction OK:', row.filename, result.text.length, 'chars')
            }
          } catch (extractErr) {
            console.error('[Attachments] Inline extraction failed for', row.filename, extractErr)
          }
        }

        if (inlineTexts.length > 0) {
          systemPrompt += `\n\nContenido extraído de los archivos adjuntos del usuario:\n\n${inlineTexts.join('\n\n')}`
          if (cite_mode) {
            systemPrompt += '\n\nSi usas informacion de los adjuntos, citala indicando el nombre del archivo.'
          }
        } else {
          // Final fallback: tell AI the file is processing (unsupported format or extraction failed)
          const inventory = attachmentContextRows
            .map((row, idx) => `${idx + 1}. ${row.filename || 'archivo'} (estado: ${(row.ingest_status || 'none').toLowerCase()})`)
            .join('\n')
          systemPrompt += `\n\n[ARCHIVOS ADJUNTOS DETECTADOS]\n${inventory}\n\nSi el usuario pide analizar un adjunto, no digas que falta archivo. Si no hay texto indexado todavia, explica que se esta procesando y ofrece reintentar en unos segundos.`
        }
      }
    } catch (e) {
      console.error('[Attachments] RAG error:', e)
    }
  }
  // Ã¢â€â‚¬Ã¢â€â‚¬ Mejora 4: BÃƒÂºsqueda hÃƒÂ­brida (Vector + Keyword) en Network Drive RAG Ã¢â€â‚¬Ã¢â€â‚¬
  console.log('[Chat] network_drive_rag:', network_drive_rag, 'input:', hasInput)
  if (network_drive_rag && inputText && sharedEmbedding) {
    try {
      // BÃƒÂºsqueda hÃƒÂ­brida: vector + keywords
      const rpcBaseParams = {
        p_query_embedding: JSON.stringify(sharedEmbedding),
        p_match_count: 12,
        p_similarity_threshold: 0.25,
        p_keyword_query: inputText, // Keywords originales del usuario (no HyDE)
      }

      type NetChunk = {
        id: string
        network_file_id: string
        drive_id: string
        chunk_index: number
        content: string
        meta_json?: Record<string, unknown>
        filename: string
        file_path: string
        similarity?: number
        keyword_rank?: number
        combined_score?: number
      }

      let netChunks: NetChunk[] = []
      let rpcErrorMessage: string | null = null

      const { data: activeDrives, error: drivesError } = await serviceClient
        .from('network_drives')
        .select('id')
        .eq('is_active', true)

      if (drivesError) rpcErrorMessage = drivesError.message

      let driveCandidates = activeDrives || []
      if (driveCandidates.length === 0) {
        const { data: anyDrives, error: anyDrivesError } = await serviceClient
          .from('network_drives')
          .select('id')
          .limit(50)
        if (anyDrivesError && !rpcErrorMessage) rpcErrorMessage = anyDrivesError.message
        driveCandidates = anyDrives || []
      }

      if (driveCandidates.length > 0) {
        const perDrive = await Promise.all(
          driveCandidates.map(async (d: { id: string }) => {
            const res = await serviceClient.rpc('match_network_chunks', {
              ...rpcBaseParams,
              p_drive_id: d.id,
            })
            return { data: (res.data || []) as NetChunk[], error: res.error }
          })
        )

        const successful = perDrive.filter((r) => !r.error)
        if (successful.length > 0) {
          const merged = successful.flatMap((r) => r.data)
          const dedup = new Map<string, NetChunk>()
          for (const chunk of merged) {
            const key = `${chunk.file_path || ''}|${chunk.filename || ''}|${(chunk.content || '').slice(0, 180)}`
            const prev = dedup.get(key)
            const chunkScore = Number(chunk.combined_score ?? chunk.similarity ?? 0)
            const prevScore = Number(prev?.combined_score ?? prev?.similarity ?? -Infinity)
            if (!prev || chunkScore > prevScore) dedup.set(key, chunk)
          }
          netChunks = Array.from(dedup.values())
            .sort((a, b) => Number(b.combined_score ?? b.similarity ?? 0) - Number(a.combined_score ?? a.similarity ?? 0))
            .slice(0, 12)
        } else {
          const missingDriveFn = perDrive.some((r) =>
            /match_network_chunks.*p_drive_id/i.test(r.error?.message || '')
          )
          if (missingDriveFn) {
            // Compatibilidad con esquema antiguo (solo funciÃƒÂ³n de 4 argumentos).
            const legacy = await serviceClient.rpc('match_network_chunks', rpcBaseParams)
            netChunks = (legacy.data || []) as NetChunk[]
            if (legacy.error) rpcErrorMessage = legacy.error.message
          } else {
            rpcErrorMessage = perDrive.find((r) => r.error)?.error?.message || 'No se pudo consultar match_network_chunks'
          }
        }
      } else {
        rpcErrorMessage = rpcErrorMessage || 'No hay unidades de red configuradas'
      }

      console.log('[NetworkRAG] Hybrid search result:', netChunks.length, 'chunks, error:', rpcErrorMessage || 'none')

      const asksForFileList =
        /(archivo|archivos|fichero|ficheros|fitxer|fitxers|documento|documentos|documents|pdf)/.test(normalizedInput) &&
        /(que tienes|que hay|lista|listar|disponibles|muestr|ensen|mostra|dime)/.test(normalizedInput)

      let fileInventoryContext = ''
      if (asksForFileList && driveCandidates.length > 0) {
        const driveIds = driveCandidates.map((d: { id: string }) => d.id)
        const { data: inventoryRows, error: inventoryError } = await serviceClient
          .from('network_files')
          .select('filename, file_path, extension')
          .in('drive_id', driveIds)
          .eq('status', 'done')
          .order('filename', { ascending: true })
          .limit(500)

        if (!inventoryError && inventoryRows && inventoryRows.length > 0) {
          const extCounts = new Map<string, number>()
          const validRows = inventoryRows.filter((row: { filename: string | null }) => Boolean(row.filename))

          for (const row of validRows) {
            const ext = (row.extension || 'sin_ext').toLowerCase()
            extCounts.set(ext, (extCounts.get(ext) || 0) + 1)
          }

          const extSummary = Array.from(extCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([ext, count]) => `${ext}: ${count}`)
            .join(' | ')

          const maxRowsInPrompt = 220
          const listRows = validRows.slice(0, maxRowsInPrompt)
          const listBlock = listRows
            .map((row: { filename: string | null; file_path: string | null }, idx: number) =>
              `${idx + 1}. ${row.filename}\nRuta: ${row.file_path || 'sin ruta'}`
            )
            .join('\n\n')

          const remaining = Math.max(0, validRows.length - maxRowsInPrompt)
          const remainingLine = remaining > 0 ? `\n\n... y ${remaining} archivos mas no listados por limite de contexto.` : ''

          fileInventoryContext =
            `Inventario real de archivos indexados en unidad de red (status=done): ${validRows.length} archivos.\n` +
            `Resumen por extension: ${extSummary || 'sin datos'}\n\n` +
            `${listBlock}${remainingLine}`
        }
      }

      if ((netChunks && netChunks.length > 0) || fileInventoryContext) {
        // Ã¢â€â‚¬Ã¢â€â‚¬ Mejora 7: Re-ranking con LLM Ã¢â€â‚¬Ã¢â€â‚¬
        let rankedChunks = netChunks
        if (netChunks.length > 3) {
          try {
            console.log('[Rerank] Scoring', netChunks.length, 'chunks...')
            const chunkSummaries = netChunks.map((c, i: number) =>
              `[${i}] (archivo: ${c.filename}, score: ${c.combined_score?.toFixed(3)})\n${c.content.substring(0, 300)}`
            ).join('\n\n')

            const rerankRes = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: 'gpt-4o-mini', max_tokens: 200, temperature: 0,
                messages: [
                  { role: 'system', content: `Eres un evaluador de relevancia. El usuario preguntÃƒÂ³: "${inputText}"\nPuntÃƒÂºa cada fragmento del 0 al 10 segÃƒÂºn su relevancia para responder la pregunta.\nResponde SOLO con un JSON array de objetos: [{"idx": 0, "score": 8}, {"idx": 1, "score": 3}, ...]\nNo aÃƒÂ±adas explicaciones.` },
                  { role: 'user', content: chunkSummaries },
                ],
              }),
            })
            const rerankData = await rerankRes.json()
            let scoresRaw = rerankData.choices?.[0]?.message?.content?.trim() || '[]'
            // Strip markdown code fences if present (e.g. ```json ... ```)
            scoresRaw = scoresRaw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
            const scores: { idx: number; score: number }[] = JSON.parse(scoresRaw)

            if (scores.length > 0) {
              // Filtrar chunks con score >= 4 y reordenar por score LLM
              const filtered = scores
                .filter(s => s.score >= 4)
                .sort((a, b) => b.score - a.score)
                .slice(0, 8)
                .map(s => netChunks[s.idx])
                .filter(Boolean)

              if (filtered.length > 0) {
                rankedChunks = filtered
                console.log('[Rerank] Kept', filtered.length, 'of', netChunks.length, 'chunks')
              }
            }
          } catch (e) { console.error('[Rerank] Error (using original order):', e) }
        }

        const netContext = rankedChunks.length > 0
          ? rankedChunks.map((c, i: number) =>
            `[Red ${i + 1}: ${c.filename} (${c.file_path}) - score: ${(c.combined_score || c.similarity)?.toFixed(3)}]\n${c.content}`
          ).join('\n\n')
          : ''

        const networkContextSections: string[] = []
        if (netContext) networkContextSections.push(`Fragmentos relevantes:\n${netContext}`)
        if (fileInventoryContext) networkContextSections.push(fileInventoryContext)

        systemPrompt += `\n\nDocumentos encontrados en las unidades de red de la empresa:\n${networkContextSections.join('\n\n---\n\n')}\n\nUsa esta informacion para responder. Si el usuario pide listar archivos, usa primero el inventario real (incluyendo PDFs) y luego detalla ejemplos de contenido cuando sea util. Cita las fuentes indicando el nombre del archivo cuando sea relevante.`
        console.log('[NetworkRAG] Added context. chunks:', rankedChunks.length, 'inventory:', fileInventoryContext ? 'yes' : 'no')

        // Create network sources for citations
        networkSources = rankedChunks.map((chunk, idx) => ({
          chunk_id: chunk.id,
          file_id: '', // empty for network files
          filename: chunk.filename,
          snippet: chunk.content.substring(0, 200),
          similarity: chunk.combined_score || chunk.similarity || 0,
          source_type: 'network' as const,
          network_file_id: chunk.network_file_id,
          network_file_path: chunk.file_path,
          chunk_index: chunk.chunk_index,
        }))
      }
    } catch (e) {
      console.error('[NetworkRAG] Error:', e)
    }
  }

  // Web search context with dedupe + hybrid ranking.
  let webSources: WebSearchResult[] = []
  let rankedWebSources: RankedWebSource[] = []
  let webAnswerSummary: string | null = null
  let webSearchImages: DeepResearchImage[] = []
  let deepResearchImages: DeepResearchImage[] = []

  if (web_search && inputText) {
    try {
      const webSearchStart = Date.now()
      const initialResultCount = deep_research
        ? (researchMode === 'exhaustive' ? 14 : 10)
        : 6

      console.log('[WebSearch] Searching for:', inputText)
      const rawResults = await searchWeb(inputText, initialResultCount)
      webAnswerSummary = lastSearchAnswer
      console.log('[WebSearch] Found', rawResults.length, 'results,', rawResults.filter((s) => s.pageContent).length, 'with raw content')

      if (rawResults.length > 0) {
        const hasRawContent = rawResults.some((s) => s.pageContent)
        if (hasRawContent) {
          webSources = rawResults
        } else {
          webSources = await enrichSearchResults(rawResults, researchMode === 'exhaustive' ? 4 : 3)
          console.log('[WebSearch] Enriched', webSources.filter((s) => s.pageContent).length, 'pages with content')
        }

        rankedWebSources = rankWebSources(inputText, webSources, deep_research ? (researchMode === 'exhaustive' ? 24 : 16) : 8)
        webSources = rankedWebSources.map((source) => ({
          title: source.title,
          url: source.url,
          snippet: source.snippet,
          pageContent: source.pageContent,
          score: source.score,
        }))

        let webContext = ''
        if (webAnswerSummary) {
          webContext += `[Resumen de busqueda IA]\n${webAnswerSummary}\n\n---\n\n`
        }
        webContext += rankedWebSources.map((source, idx) => {
          let entry = `[Web ${idx + 1} | hybrid ${(source.hybrid_score * 100).toFixed(0)} | autoridad ${(source.authority_score * 100).toFixed(0)} | frescura ${(source.freshness_score * 100).toFixed(0)}]\n`
          entry += `ID: ${source.source_id}\nURL: ${source.url}\nTitulo: ${source.title}\nResumen: ${source.snippet}`
          if (source.pageContent) entry += `\n\nContenido:\n${source.pageContent.substring(0, 2800)}`
          return entry
        }).join('\n\n---\n\n')

        systemPrompt += `\n\n[BUSQUEDA WEB REALIZADA - DATOS EN TIEMPO REAL]\nFecha actual: ${new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.\nUsa estos datos reales para responder con precision. Incluye cifras, fechas y fuentes concretas.\n\n${webContext}\n\nAl final de la respuesta incluye una seccion "Fuentes" con titulo + URL.`

        if (!deep_research && rankedWebSources.length > 0) {
          try {
            webSearchImages = await collectDeepResearchImages(rankedWebSources, inputText, 4)
            console.log('[WebSearch] Related images selected:', webSearchImages.length)
          } catch (imgErr) {
            console.error('[WebSearch] Image selection error:', imgErr)
          }
        }
      }

      console.log('[WebSearch] Completed in', Date.now() - webSearchStart, 'ms')
    } catch (e) {
      console.error('Web search error:', e)
    }
  }

  // Deep Research with planning, concurrency, cache, evidence matrix and telemetry.
  if (deep_research && web_search && inputText) {
    const deepResearchStart = Date.now()
    const telemetry: Record<string, string | number | boolean> = {
      mode: researchMode,
      cache_hit: false,
    }
    const deepResearchCacheKey = `${researchMode}:${normalizeForKey(inputText)}`
    let subQuestions: string[] = []
    let followUpQueries: string[] = []
    let clarifyingQuestions: string[] = []

    // Cleanup expired deep-research cache entries.
    const nowTs = Date.now()
    for (const [key, cacheEntry] of deepResearchCache.entries()) {
      if (nowTs - cacheEntry.timestamp > DEEP_RESEARCH_CACHE_TTL) {
        deepResearchCache.delete(key)
      }
    }

    try {
      console.log('[DeepResearch] Starting deep research for:', inputText, '| mode:', researchMode)
      const cachedResearch = deepResearchCache.get(deepResearchCacheKey)

      if (cachedResearch && Date.now() - cachedResearch.timestamp <= DEEP_RESEARCH_CACHE_TTL) {
        telemetry.cache_hit = true
        webSources = cachedResearch.sources
        rankedWebSources = cachedResearch.ranked_sources
        subQuestions = cachedResearch.sub_questions
        followUpQueries = cachedResearch.follow_up_queries
        clarifyingQuestions = cachedResearch.clarifying_questions
        webAnswerSummary = cachedResearch.answer_summary
        console.log('[DeepResearch] Cache hit:', rankedWebSources.length, 'ranked sources')
      } else {
        // Warm-up source set (in case web_search yielded no sources).
        const warmupStart = Date.now()
        if (webSources.length === 0) {
          const bootstrapRaw = await searchWeb(inputText, researchMode === 'exhaustive' ? 14 : 10)
          webAnswerSummary = lastSearchAnswer
          if (bootstrapRaw.some((result) => result.pageContent)) {
            webSources = bootstrapRaw
          } else {
            webSources = await enrichSearchResults(bootstrapRaw, researchMode === 'exhaustive' ? 4 : 3)
          }
        }
        telemetry.warmup_ms = Date.now() - warmupStart

        // Step 1: query decomposition + research plan.
        const planningStart = Date.now()
        const initialSummaries = webSources.slice(0, 6).map((source, idx) =>
          `[${idx + 1}] ${source.title}: ${source.snippet}`
        ).join('\n')
        const maxFollowUps = researchMode === 'exhaustive' ? 7 : 4

        const planningResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            temperature: 0.2,
            max_tokens: 600,
            messages: [
              {
                role: 'system',
                content: `Eres un planificador de investigacion.\nDevuelve SOLO JSON valido con esta forma exacta:\n{"sub_questions": string[], "follow_up_queries": string[], "clarifying_questions": string[]}\nReglas:\n- sub_questions: divide la pregunta principal en 4-8 subpreguntas concretas.\n- follow_up_queries: genera hasta ${maxFollowUps} consultas de busqueda para cubrir huecos.\n- clarifying_questions: hasta 3 preguntas cortas para pedir precision si faltan datos criticos.\nSin texto extra, sin markdown.`,
              },
              {
                role: 'user',
                content: `Pregunta original: ${inputText}\n\nResultados iniciales:\n${initialSummaries || 'Sin resultados previos'}`,
              },
            ],
          }),
        })

        if (planningResponse.ok) {
          const planningData = await planningResponse.json()
          const planningContent = planningData.choices?.[0]?.message?.content || '{}'
          const parsedPlan = parseJsonContent<Partial<DeepResearchPlan>>(planningContent, {})
          subQuestions = uniqueStrings(
            Array.isArray(parsedPlan.sub_questions)
              ? parsedPlan.sub_questions.filter((item): item is string => typeof item === 'string')
              : [],
            8
          )
          followUpQueries = uniqueStrings(
            Array.isArray(parsedPlan.follow_up_queries)
              ? parsedPlan.follow_up_queries.filter((item): item is string => typeof item === 'string')
              : [],
            maxFollowUps
          )
          clarifyingQuestions = uniqueStrings(
            Array.isArray(parsedPlan.clarifying_questions)
              ? parsedPlan.clarifying_questions.filter((item): item is string => typeof item === 'string')
              : [],
            3
          )
        }
        telemetry.planning_ms = Date.now() - planningStart

        if (followUpQueries.length === 0 && subQuestions.length > 0) {
          followUpQueries = uniqueStrings(
            subQuestions.map((subQuestion) => `datos recientes y evidencias sobre ${subQuestion}`),
            maxFollowUps
          )
        }
        if (followUpQueries.length === 0) {
          followUpQueries = uniqueStrings([
            `datos actualizados de ${inputText}`,
            `estadisticas verificables sobre ${inputText}`,
            `fuentes oficiales sobre ${inputText}`,
          ], maxFollowUps)
        }

        // Step 2: execute follow-up searches in parallel.
        const followUpStart = Date.now()
        const followUpConcurrency = researchMode === 'exhaustive' ? 4 : 3
        const resultsPerFollowUp = researchMode === 'exhaustive' ? 6 : 4

        const followUpResultSets = await runWithConcurrency(
          followUpQueries,
          followUpConcurrency,
          async (query, idx) => {
            try {
              console.log(`[DeepResearch] Follow-up ${idx + 1}/${followUpQueries.length}:`, query)
              const raw = await searchWeb(query, resultsPerFollowUp)
              if (raw.length === 0) return [] as WebSearchResult[]
              if (raw.some((source) => source.pageContent)) return raw
              return enrichSearchResults(raw, researchMode === 'exhaustive' ? 3 : 2)
            } catch (searchErr) {
              console.error('[DeepResearch] Follow-up error:', query, searchErr)
              return [] as WebSearchResult[]
            }
          }
        )

        const flattenedFollowUps = followUpResultSets.flat()
        if (flattenedFollowUps.length > 0) {
          webSources.push(...flattenedFollowUps)
        }
        telemetry.follow_up_ms = Date.now() - followUpStart

        // Step 3: dedupe + hybrid ranking.
        const rankingStart = Date.now()
        rankedWebSources = rankWebSources(inputText, webSources, researchMode === 'exhaustive' ? 24 : 16)
        webSources = rankedWebSources.map((source) => ({
          title: source.title,
          url: source.url,
          snippet: source.snippet,
          pageContent: source.pageContent,
          score: source.score,
        }))
        telemetry.ranking_ms = Date.now() - rankingStart

        deepResearchCache.set(deepResearchCacheKey, {
          timestamp: Date.now(),
          sources: webSources,
          ranked_sources: rankedWebSources,
          sub_questions: subQuestions,
          follow_up_queries: followUpQueries,
          clarifying_questions: clarifyingQuestions,
          answer_summary: webAnswerSummary,
        })
      }

      if (rankedWebSources.length === 0) {
        rankedWebSources = rankWebSources(inputText, webSources, researchMode === 'exhaustive' ? 24 : 16)
      }

      const imageSelectionStart = Date.now()
      deepResearchImages = await collectDeepResearchImages(
        rankedWebSources,
        inputText,
        4
      )
      telemetry.images = deepResearchImages.length
      telemetry.image_selection_ms = Date.now() - imageSelectionStart

      const deepWebContext = rankedWebSources.map((source) => {
        let entry = `[${source.source_id}]\n`
        entry += `URL: ${source.url}\nTitulo: ${source.title}\nResumen: ${source.snippet}`
        if (source.pageContent) entry += `\n\nContenido:\n${source.pageContent.substring(0, 3200)}`
        return entry
      }).join('\n\n---\n\n')

      const markerCandidates = ['[BUSQUEDA WEB REALIZADA', '[BÃšSQUEDA WEB REALIZADA', '[BÃƒÅ¡SQUEDA WEB REALIZADA']
      let webSearchPromptIdx = -1
      for (const marker of markerCandidates) {
        const idx = systemPrompt.indexOf(marker)
        if (idx > -1) {
          webSearchPromptIdx = idx
          break
        }
      }
      if (webSearchPromptIdx > -1) {
        systemPrompt = systemPrompt.substring(0, Math.max(0, webSearchPromptIdx - 2))
      }

      const clarificationsBlock = clarifyingQuestions.length > 0
        ? clarifyingQuestions.map((question) => `- ${question}`).join('\n')
        : '- No se requieren aclaraciones adicionales.'
      const subQuestionsBlock = subQuestions.length > 0
        ? subQuestions.map((subQuestion) => `- ${subQuestion}`).join('\n')
        : '- Sin subpreguntas adicionales.'

      systemPrompt += `\n\n[DEEP RESEARCH - ${researchMode.toUpperCase()}]\nFecha: ${new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.\nSubpreguntas de investigacion:\n${subQuestionsBlock}\n\nConsultas ejecutadas:\n1. "${inputText}"\n${followUpQueries.map((query, idx) => `${idx + 2}. "${query}"`).join('\n')}\n\nFuentes priorizadas:\n${deepWebContext}\n\nINSTRUCCIONES DE CALIDAD OBLIGATORIAS:\n1. Construye un informe estructurado con secciones ##.\n2. Para afirmaciones criticas (finanzas, legal, salud, seguridad, cifras clave), exige al menos 2 fuentes independientes.\n3. Si una afirmacion critica no tiene 2 fuentes, marcala como "Pendiente de validacion".\n4. Incluye una seccion "## Matriz de evidencias" con tabla markdown:\n| Claim | Evidencias (IDs) | Estado |\n5. Incluye una seccion "## Contradicciones detectadas" indicando acuerdo/desacuerdo entre fuentes.\n6. Verifica coherencia numerica: comprueba sumas, porcentajes y fechas antes de concluir.\n7. Si falta contexto critico, pregunta al usuario usando estas aclaraciones:\n${clarificationsBlock}\n8. Termina con "## Fuentes" (ID + titulo + URL).`

      telemetry.sources = rankedWebSources.length
      telemetry.follow_up_queries = followUpQueries.length
      telemetry.sub_questions = subQuestions.length
      telemetry.total_ms = Date.now() - deepResearchStart
      console.log('[DeepResearch][Telemetry]', telemetry)
    } catch (e) {
      console.error('[DeepResearch] Error:', e)
    }
  }
  // DB Query context
  if (db_query && inputText) {
    try {
      // Get active DB connections
      const { data: dbConns } = await serviceClient
        .from('db_connections')
        .select('*')
        .eq('is_active', true)
        .limit(1)

      const conn = dbConns?.[0]
      if (conn && conn.schema_cache?.length > 0) {
        const schemaContext = conn.schema_cache.map((t: { schema_name: string; table_name: string; columns: { name: string; type: string; nullable: boolean }[] }) =>
          `Tabla: [${t.schema_name}].[${t.table_name}]\nColumnas: ${t.columns.map((c: { name: string; type: string; nullable: boolean }) => `${c.name} (${c.type})`).join(', ')}`
        ).join('\n\n')

        // Ask AI to generate SQL
        const sqlAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: `Eres un experto en SQL Server. Genera SOLO la consulta SQL SELECT para responder la pregunta del usuario.\nREGLAS:\n- Solo SELECT, nunca INSERT/UPDATE/DELETE/DROP\n- Usa TOP 100 para limitar resultados\n- Usa los nombres exactos de tablas y columnas del esquema\n- Responde SOLO con el SQL, sin explicaciones ni markdown\n- Si la pregunta NO estÃƒÂ¡ relacionada con la BD, responde exactamente: SKIP\n- Si no puedes generar una consulta vÃƒÂ¡lida, responde: ERROR: seguido de la razÃƒÂ³n\n\nESQUEMA:\n${schemaContext}` },
              { role: 'user', content: inputText }
            ],
            temperature: 0, max_tokens: 1000,
          }),
        })
        const sqlAiData = await sqlAiRes.json()
        const generatedSQL = (sqlAiData.choices?.[0]?.message?.content?.trim() || '').replace(/```sql\n?/gi, '').replace(/```\n?/g, '').trim()

        if (generatedSQL && generatedSQL !== 'SKIP' && !generatedSQL.startsWith('ERROR:')) {
          // Validate SQL
          const upper = generatedSQL.toUpperCase().trim()
          const forbidden = ['INSERT ', 'UPDATE ', 'DELETE ', 'DROP ', 'ALTER ', 'CREATE ', 'TRUNCATE ', 'EXEC ', 'EXECUTE ']
          const isSafe = upper.startsWith('SELECT') && !forbidden.some(kw => upper.includes(kw))

          if (isSafe) {
            try {
              const pool = await sql.connect({
                server: conn.host, port: conn.port || 1433,
                database: conn.database_name || undefined,
                user: conn.username, password: conn.password,
                options: { encrypt: false, trustServerCertificate: true },
                connectionTimeout: 10000, requestTimeout: 15000,
              })
              const result = await pool.request().query(generatedSQL)
              await pool.close()

              const rows = (result.recordset || []).slice(0, 50)
              if (rows.length > 0) {
                // Format as markdown table
                const cols = Object.keys(rows[0])
                const header = `| ${cols.join(' | ')} |`
                const separator = `| ${cols.map(() => '---').join(' | ')} |`
                const dataRows = rows.map((r: Record<string, unknown>) => `| ${cols.map(c => String(r[c] ?? '')).join(' | ')} |`).join('\n')
                const tableStr = `${header}\n${separator}\n${dataRows}`

                systemPrompt += `\n\nRESULTADOS DE LA BASE DE DATOS (${conn.name}):\nConsulta SQL ejecutada: ${generatedSQL}\nResultados (${rows.length} filas):\n${tableStr}\n\nUsa estos datos para responder la pregunta del usuario. Presenta los resultados de forma clara y ÃƒÂºtil. Si se muestran datos numÃƒÂ©ricos, puedes calcular totales o promedios si es relevante.`
              } else {
                systemPrompt += `\n\nSe ejecutÃƒÂ³ una consulta en la BD (${conn.name}) pero no devolviÃƒÂ³ resultados.\nSQL: ${generatedSQL}\nInforma al usuario que no se encontraron datos.`
              }

              // Log the query
              await serviceClient.from('db_query_logs').insert({
                connection_id: conn.id, user_id: user.id, user_question: inputText,
                generated_sql: generatedSQL, row_count: rows.length, success: true,
              }).catch(() => {})
            } catch (dbErr) {
              console.error('DB query execution error:', dbErr)
              systemPrompt += `\n\nSe intentÃƒÂ³ consultar la BD pero hubo un error de conexiÃƒÂ³n. Informa al usuario que no se pudo conectar a la base de datos.`
            }
          }
        }
      }
    } catch (e) {
      console.error('DB query error:', e)
    }
  }

  // Image generation with GPT Image 1.5
  let generatedImageUrl = ''
  let generatedImagePrompt = ''
  if (image_generation && inputText) {
    try {
      console.log('[ImageGen] Generating image for:', inputText)
      const imgRes = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-image-1.5',
          prompt: inputText,
          n: 1,
          size: '1024x1024',
          quality: 'auto',
        }),
      })

      if (imgRes.ok) {
        const imgData = await imgRes.json()
        const firstImage = Array.isArray(imgData?.data) ? imgData.data[0] : null
        const tempUrl = typeof firstImage?.url === 'string' ? firstImage.url : ''
        const b64 = typeof firstImage?.b64_json === 'string' ? firstImage.b64_json : ''
        let imageBuffer: Buffer | null = null

        if (b64) {
          try {
            imageBuffer = Buffer.from(b64, 'base64')
            console.log('[ImageGen] Received base64 image payload:', Math.round(imageBuffer.length / 1024), 'KB')
          } catch (b64Err) {
            console.error('[ImageGen] Invalid base64 payload:', b64Err)
          }
        }

        // Fallback for providers that return temporary URLs.
        if (!imageBuffer && tempUrl) {
          try {
            console.log('[ImageGen] Downloading temp image to persist in Supabase Storage...')
            const imgDownload = await fetch(tempUrl)
            if (imgDownload.ok) {
              imageBuffer = Buffer.from(await imgDownload.arrayBuffer())
            } else {
              console.error('[ImageGen] Temp image download failed, using temp URL')
              generatedImageUrl = tempUrl
            }
          } catch (downloadErr) {
            console.error('[ImageGen] Temp image download error, using temp URL:', downloadErr)
            generatedImageUrl = tempUrl
          }
        }

        if (imageBuffer) {
          const imgFilename = `${user.id}/${Date.now()}_generated.png`
          const { error: uploadErr } = await serviceClient.storage
            .from('generated-images')
            .upload(imgFilename, imageBuffer, { contentType: 'image/png', upsert: false })

          if (!uploadErr) {
            const { data: publicUrlData } = serviceClient.storage
              .from('generated-images')
              .getPublicUrl(imgFilename)
            generatedImageUrl = publicUrlData?.publicUrl || tempUrl
            console.log('[ImageGen] Persisted to Supabase Storage:', generatedImageUrl)
          } else {
            console.error('[ImageGen] Upload error:', uploadErr.message)
            generatedImageUrl = tempUrl || `data:image/png;base64,${b64}`
          }
        }

        if (generatedImageUrl) {
          generatedImagePrompt = inputText
          systemPrompt += `\n\n[IMAGEN GENERADA]\nSe ha generado una imagen basada en la solicitud del usuario. La imagen se mostrarÃƒÂ¡ automÃƒÂ¡ticamente en el chat.\nDescribe brevemente lo que se ha generado e informa al usuario que la imagen estÃƒÂ¡ lista.`
        } else {
          console.error('[ImageGen] Image response did not include usable image data')
          systemPrompt += `\n\n[ERROR DE GENERACIÃƒâ€œN DE IMAGEN]\nNo se pudo procesar la imagen generada. Informa al usuario del error y sugiere que reformule su solicitud.`
        }
      } else {
        const errText = await imgRes.text()
        console.error('[ImageGen] API error:', imgRes.status, errText)
        systemPrompt += `\n\n[ERROR DE GENERACIÃƒâ€œN DE IMAGEN]\nNo se pudo generar la imagen. Informa al usuario del error y sugiere que reformule su solicitud.`
      }
    } catch (e) {
      console.error('[ImageGen] Error:', e)
    }
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Vision: detect image attachments and convert to base64 Ã¢â€â‚¬Ã¢â€â‚¬
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imageContents: Array<{ type: string; [key: string]: any }> = []
  if (validAttachmentsPayload.length > 0) {
    try {
      const imageFiles = validAttachmentsPayload.filter((file) => file.mime.toLowerCase().startsWith('image/'))
      console.log('[Vision] Found', imageFiles.length, 'image attachments out of', validAttachmentsPayload.length, 'total')

      for (const img of imageFiles) {
        try {
          const { data: imgData } = await serviceClient.storage
            .from('user-files')
            .download(img.storage_path)
          if (imgData) {
            const buffer = Buffer.from(await imgData.arrayBuffer())
            const base64 = buffer.toString('base64')
            const mimeType = img.mime || 'image/jpeg'
            imageContents.push({
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'auto' },
              // Store for Anthropic format conversion later
              _anthropic: { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
              _filename: img.filename,
              _mime: mimeType,
            })
            console.log('[Vision] Loaded image:', img.filename, '(', Math.round(base64.length / 1024), 'KB base64)')
          }
        } catch (imgErr) {
          console.error('[Vision] Error downloading image:', img.filename, imgErr)
        }
      }
    } catch (e) {
      console.error('[Vision] Error loading attachments:', e)
    }
  }

  if (effectiveOcrMode && imageContents.length > 0 && process.env.OPENAI_API_KEY) {
    try {
      const ocrRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.1,
          max_tokens: 1400,
          messages: [
            {
              role: 'system',
              content: 'Eres un OCR profesional para fotos, escaneos y facturas. Devuelve SOLO JSON valido con esta estructura: {"summary":"", "full_text":"", "document_type":"", "language":"", "confidence":0.0, "invoice_fields":{"empresa":"","nif":"","numero_factura":"","fecha":"","base_imponible":"","iva":"","total":"","moneda":""}}. Si un campo no existe, devuelve cadena vacia.',
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: `Extrae todo el texto fielmente y detecta campos clave. Adjuntos: ${imageContents.length}.` },
                ...imageContents.map((img) => ({ type: 'image_url', image_url: img.image_url })),
              ],
            },
          ],
        }),
      })

      if (ocrRes.ok) {
        const ocrData = await ocrRes.json()
        const raw = String(ocrData?.choices?.[0]?.message?.content || '')
        const parsed = parseJsonContent<OcrToolOutput>(raw, {
          summary: '',
          full_text: '',
          document_type: '',
          language: '',
          confidence: 0,
        })
        ocrOutput = {
          summary: String(parsed.summary || ''),
          full_text: String(parsed.full_text || '').slice(0, 9000),
          document_type: String(parsed.document_type || 'documento'),
          language: String(parsed.language || ''),
          confidence: Number(parsed.confidence || 0),
          invoice_fields: parsed.invoice_fields || undefined,
        }

        const invoiceFields = ocrOutput.invoice_fields
          ? Object.entries(ocrOutput.invoice_fields)
            .filter(([, value]) => String(value || '').trim().length > 0)
            .map(([key, value]) => `${key}: ${String(value)}`)
            .join('\n')
          : ''

        const ocrSections = [
          '[OCR ADJUNTOS]',
          ocrOutput.summary ? `Resumen OCR: ${ocrOutput.summary}` : '',
          ocrOutput.document_type ? `Tipo de documento: ${ocrOutput.document_type}` : '',
          ocrOutput.language ? `Idioma detectado: ${ocrOutput.language}` : '',
          Number.isFinite(ocrOutput.confidence) ? `Confianza OCR: ${Math.round(ocrOutput.confidence * 100)}%` : '',
          ocrOutput.full_text ? `Texto extraido:\n${ocrOutput.full_text}` : '',
          invoiceFields ? `Campos detectados:\n${invoiceFields}` : '',
        ].filter(Boolean).join('\n\n')

        systemPrompt += `\n\n${ocrSections}\n\nUsa estos datos OCR para responder con precision. Si hay importes o fechas de factura, valÃ­dalos y destÃ¡calos.`
      } else {
        console.error('[OCR] API error:', ocrRes.status, await ocrRes.text())
      }
    } catch (ocrErr) {
      console.error('[OCR] Error:', ocrErr)
    }
  }

  // (Messages built after provider lookup below)

  // Look up model config from database to find provider
  let apiUrl = 'https://api.openai.com/v1/chat/completions'
  let apiKey = process.env.OPENAI_API_KEY || ''
  let providerType = 'openai'
  let modelSystemPrompt = ''

  const { data: modelConfig } = await serviceClient
    .from('model_configs')
    .select('*, ai_providers(type, base_url, api_key)')
    .eq('model_id', model)
    .eq('is_visible', true)
    .limit(1)
    .single()

  if (modelConfig) {
    const provider = modelConfig.ai_providers as { type: string; base_url: string; api_key: string } | null
    if (provider) {
      providerType = provider.type
      apiKey = provider.api_key
      apiUrl = `${provider.base_url}/chat/completions`
    }
    if (modelConfig.system_prompt) {
      modelSystemPrompt = modelConfig.system_prompt
    }
  }

  // Prepend model-specific system prompt if configured
  if (modelSystemPrompt) {
    systemPrompt = systemPrompt ? (modelSystemPrompt + '\n\n' + systemPrompt) : modelSystemPrompt
  }

  // Rebuild apiMessages with updated systemPrompt (skip system message if empty)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const historyMessages: { role: string; content: any }[] = (messages || []).slice(-40).map((m: { role: string; content: string }) => ({ role: m.role, content: m.content }))

  // If there are image attachments, modify the last user message to include images (Vision)
  if (imageContents.length > 0 && historyMessages.length > 0) {
    // Find the last user message
    for (let i = historyMessages.length - 1; i >= 0; i--) {
      if (historyMessages[i].role === 'user') {
        const textContent = typeof historyMessages[i].content === 'string' ? historyMessages[i].content : ''
        historyMessages[i].content = [
          { type: 'text', text: textContent || 'Analiza esta imagen' },
          ...imageContents.map(ic => ({ type: ic.type, image_url: ic.image_url })),
        ]
        console.log('[Vision] Modified last user message with', imageContents.length, 'images')

        // Add vision instruction to system prompt if not already present
        if (!systemPrompt.includes('[VISIÃƒâ€œN]')) {
          systemPrompt += `\n\n[VISIÃƒâ€œN - ANÃƒÂLISIS DE IMÃƒÂGENES]\nEl usuario ha adjuntado ${imageContents.length} imagen(es). Analiza la(s) imagen(es) detalladamente y responde a la pregunta del usuario basÃƒÂ¡ndote en lo que ves.`
        }
        break
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalMessages: { role: string; content: any }[] = systemPrompt.trim()
    ? [{ role: 'system', content: systemPrompt }, ...historyMessages]
    : historyMessages

  // Determine if model needs max_completion_tokens (newer models) vs max_tokens (legacy)
  // Only apply token limits if use_max_tokens is enabled in model config
  const useNewTokenParam = model.startsWith('gpt-5') || model.startsWith('gpt-4.5') || model.startsWith('gpt-4.1') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')
  const shouldLimitTokens = modelConfig?.use_max_tokens === true
  const configMaxTokens = modelConfig?.max_tokens || (useNewTokenParam ? 16384 : 4096)
  const tokenParam = shouldLimitTokens
    ? (useNewTokenParam ? { max_completion_tokens: configMaxTokens } : { max_tokens: configMaxTokens })
    : {}

  // Some reasoning models don't support temperature/system messages the same way
  const isReasoningModel = model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')

  // Build request body based on provider type
  let requestBody: Record<string, unknown> = {
    model,
    messages: isReasoningModel
      ? finalMessages.map(m => m.role === 'system' ? { ...m, role: 'developer' } : m)
      : finalMessages,
    stream: true,
    stream_options: { include_usage: true }, // Include token usage in stream
    ...tokenParam,
    ...(isReasoningModel ? {} : { temperature: 0.7 }),
  }

  // Adapt for Gemini provider (uses OpenAI-compatible format via their v1beta endpoint)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (providerType === 'gemini') {
    headers['Authorization'] = `Bearer ${apiKey}`
    // Google Gemini OpenAI-compatible endpoint
    apiUrl = `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`
  } else if (providerType === 'anthropic') {
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
    // Anthropic has different API format, use messages endpoint
    apiUrl = `https://api.anthropic.com/v1/messages`
    const systemContent = finalMessages.find(m => m.role === 'system')?.content || ''
    // Convert vision messages to Anthropic format
    const anthropicMessages = finalMessages.filter(m => m.role !== 'system').map(m => {
      if (Array.isArray(m.content)) {
        // Convert OpenAI vision format to Anthropic format
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parts = m.content.map((part: any) => {
          if (part.type === 'text') return { type: 'text', text: part.text }
          if (part.type === 'image_url') {
            // Extract base64 data from data URL
            const url = part.image_url?.url || ''
            const match = url.match(/^data:([^;]+);base64,(.+)$/)
            if (match) {
              return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } }
            }
          }
          return part
        })
        return { role: m.role, content: parts }
      }
      return { role: m.role, content: m.content }
    })
    requestBody = {
      model,
      system: systemContent,
      messages: anthropicMessages,
      stream: true,
      max_tokens: configMaxTokens,
    }
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  const relatedSearchImages = deep_research ? deepResearchImages : webSearchImages
  const relatedImagesStreamPrefix = buildDeepResearchImagesStreamPrefix(relatedSearchImages)
  const spreadsheetChartsPrefix = buildSpreadsheetChartsPrefix(spreadsheetChartImages)
  const preResponseVisualPrefix = `${relatedImagesStreamPrefix}${spreadsheetChartsPrefix}`

  // Call AI provider with streaming
  let requestAborted = false
  const requestAbortHandler = () => { requestAborted = true }
  try {
    if (req.signal.aborted) requestAborted = true
    else req.signal.addEventListener('abort', requestAbortHandler, { once: true })
  } catch {
    // Ignore AbortSignal wiring issues
  }

  const openaiRes = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
    signal: req.signal,
  })

  if (!openaiRes.ok || !openaiRes.body) {
    const err = await openaiRes.text()
    return new Response(`AI provider error: ${err}`, { status: 500 })
  }

  // Stream response
  const encoder = new TextEncoder()
  let fullContent = ''
  let totalPromptTokens = 0
  let totalCompletionTokens = 0
  let totalTokens = 0

  // Helper function to send research events via SSE
  const sendResearchEvent = (type: string, message: string, data?: unknown, controller?: ReadableStreamDefaultController) => {
    if (!controller) return
    try {
      const event = {
        type: 'research_event',
        data: { type, message, data, timestamp: Date.now() }
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
    } catch (err) {
      console.error('[ResearchEvent] Failed to send event:', err)
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = openaiRes.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      try {
        // Send deep research events if applicable
        if (deep_research && rankedWebSources.length > 0) {
          sendResearchEvent('search', `Búsqueda inicial completada: ${rankedWebSources.length} fuentes encontradas`, { count: rankedWebSources.length }, controller)
          sendResearchEvent('planning', `Análisis de ${rankedWebSources.length} fuentes en progreso`, undefined, controller)
          sendResearchEvent('ranking', `Fuentes priorizadas y clasificadas`, { top_sources: rankedWebSources.slice(0, 5).map(s => s.title) }, controller)
          if (deepResearchImages.length > 0) {
            sendResearchEvent('images', `${deepResearchImages.length} imágenes relevantes seleccionadas`, { count: deepResearchImages.length }, controller)
          }
          sendResearchEvent('complete', 'Investigación profunda completada, generando respuesta...', undefined, controller)
        }

        if (preResponseVisualPrefix) {
          controller.enqueue(encoder.encode(preResponseVisualPrefix))
        }

        while (true) {
          if (requestAborted || req.signal.aborted) break
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                const token = parsed.choices?.[0]?.delta?.content
                if (token) {
                  fullContent += token
                  try {
                    controller.enqueue(encoder.encode(token))
                  } catch {
                    // Client disconnected/cancelled the stream.
                    requestAborted = true
                    break
                  }
                }
                // Capture usage data if present
                if (parsed.usage) {
                  totalPromptTokens = parsed.usage.prompt_tokens || 0
                  totalCompletionTokens = parsed.usage.completion_tokens || 0
                  totalTokens = parsed.usage.total_tokens || 0
                }
              } catch { /* ignore parse errors */ }
            }
          }
          if (requestAborted || req.signal.aborted) break
        }
      } finally {
        try { reader.cancel() } catch { /* ignore */ }
        if (requestAborted || req.signal.aborted) {
          try { controller.close() } catch { /* ignore */ }
          return
        }
        // Combine RAG + Web sources for saving
        const rankedForPersistence = rankedWebSources.length > 0
          ? rankedWebSources
          : rankWebSources(inputText || '', webSources, 12)
        const webSourcesFormatted = rankedForPersistence.map((w, i) => ({
          chunk_id: `web-${i}`,
          file_id: '',
          filename: w.title,
          chunk_index: 0,
          snippet: w.snippet,
          similarity: 0,
          url: w.url,
          source_type: 'web' as const,
          canonical_url: w.canonical_url,
          relevance_score: w.relevance_score,
          authority_score: w.authority_score,
          freshness_score: w.freshness_score,
          coverage_score: w.coverage_score,
          hybrid_score: w.hybrid_score,
          source_id: w.source_id,
        }))
        const allSources = [...ragSources, ...attachmentRagSources, ...networkSources, ...webSourcesFormatted]

        // Save AI message to DB
        const metaJson: Record<string, unknown> = {}

        // Execute Python code if Code Interpreter is active
        if (code_interpreter && fullContent) {
          const pythonCodeBlocks = extractPythonCodeBlocks(fullContent)
          if (pythonCodeBlocks.length > 0) {
            console.log(`[CodeInterpreter] Found ${pythonCodeBlocks.length} Python code block(s)`)
            const codeExecutions: unknown[] = []
            for (const codeBlock of pythonCodeBlocks) {
              try {
                const execRes = await fetch(`${req.nextUrl.origin}/api/code-interpreter`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Cookie': req.headers.get('cookie') || '' },
                  body: JSON.stringify({
                    code: codeBlock,
                    conversation_id,
                  }),
                })
                if (execRes.ok) {
                  const execData = await execRes.json()
                  codeExecutions.push({
                    code: codeBlock,
                    output: execData.output,
                    error: execData.error,
                    execution_time_ms: execData.execution_time_ms,
                    status: execData.status,
                  })
                  console.log('[CodeInterpreter] Execution successful:', execData.execution_id)
                } else {
                  console.error('[CodeInterpreter] Execution failed:', await execRes.text())
                }
              } catch (execErr) {
                console.error('[CodeInterpreter] Error executing code:', execErr)
              }
            }
            if (codeExecutions.length > 0) {
              metaJson.code_executions = codeExecutions
            }
          }
        }
        if (generatedImageUrl) metaJson.image_url = generatedImageUrl
        if (generatedImagePrompt) metaJson.image_prompt = generatedImagePrompt
        if (webSearchImages.length > 0) metaJson.web_search_images = webSearchImages
        if (deepResearchImages.length > 0) metaJson.deep_research_images = deepResearchImages
        if (spreadsheetChartImages.length > 0) metaJson.spreadsheet_charts = spreadsheetChartImages
        if (ocrOutput) metaJson.ocr = ocrOutput
        if (youtubeSummaries.length > 0) {
          metaJson.youtube_summaries = youtubeSummaries.map((item) => ({
            video_id: item.videoId,
            url: item.url,
            title: item.title,
            author: item.author,
            transcript_excerpt: item.transcript.slice(0, 1400),
          }))
        }

        const assistantGeneratedAttachments: AssistantFileAttachment[] = []
        if (effectiveDocumentGeneration && fullContent.trim().length > 0) {
          try {
            const outputFormat = requestedDocumentFormat
            const safeBaseName = sanitizeDocumentFilename(inputText || 'documento')
            const timestamp = Date.now()
            const filename = `${safeBaseName}-${timestamp}.${outputFormat.ext}`
            const storagePath = `${user.id}/${timestamp}_${filename}`
            console.log('[DocGen] Requested format:', outputFormat.ext, 'filename:', filename)
            const markdownBase = normalizeMarkdownDocument(fullContent, inputText || 'Documento')
            const markdownValidation = validateAndRepairMarkdownForExport(markdownBase)
            const normalizedForExport = markdownValidation.markdown
            if (markdownValidation.issues.length > 0) {
              console.log('[DocGen] Markdown repaired before save:', markdownValidation.issues.join(', '))
            }
            let payloadBuffer: Buffer

            if (outputFormat.ext === 'docx') {
              payloadBuffer = await buildDocxBufferFromMarkdown(normalizedForExport)
            } else if (outputFormat.ext === 'pdf') {
              payloadBuffer = await buildPdfBufferFromMarkdown(normalizedForExport, inferDocumentTitleFromPrompt(inputText || 'Documento'))
            } else if (outputFormat.ext === 'xlsx') {
              payloadBuffer = await buildXlsxBufferFromMarkdown(normalizedForExport, inputText || 'Documento')
            } else if (outputFormat.ext === 'md') {
              payloadBuffer = Buffer.from(normalizedForExport, 'utf-8')
            } else if (outputFormat.ext === 'txt') {
              payloadBuffer = Buffer.from(`${markdownToPlainText(normalizedForExport)}\n`, 'utf-8')
            } else if (outputFormat.ext === 'html') {
              const rawHtml = stripMarkdownOuterFence(fullContent).trim()
              if (/(<!doctype html|<html[\s>]|<body[\s>])/i.test(rawHtml)) {
                payloadBuffer = Buffer.from(rawHtml, 'utf-8')
              } else {
                const escaped = rawHtml
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/\n/g, '<br />')
                const title = inferDocumentTitleFromPrompt(inputText || 'Documento')
                const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><article>${escaped}</article></body></html>`
                payloadBuffer = Buffer.from(html, 'utf-8')
              }
            } else {
              const rawJson = stripMarkdownOuterFence(fullContent).trim()
              let jsonString: string
              try {
                jsonString = JSON.stringify(JSON.parse(rawJson), null, 2)
              } catch {
                jsonString = JSON.stringify({
                  title: inferDocumentTitleFromPrompt(inputText || 'Documento'),
                  content: rawJson,
                }, null, 2)
              }
              payloadBuffer = Buffer.from(`${jsonString}\n`, 'utf-8')
            }

            const { error: uploadErr } = await serviceClient.storage
              .from('user-files')
              .upload(storagePath, payloadBuffer, {
                contentType: outputFormat.mime,
                upsert: false,
              })

            if (!uploadErr) {
              console.log('[DocGen] Upload OK:', filename, 'size:', payloadBuffer.length, 'mime:', outputFormat.mime)
              const { data: insertedFile } = await serviceClient
                .from('files')
                .insert({
                  user_id: user.id,
                  project_id: null,
                  storage_path: storagePath,
                  filename,
                  mime: outputFormat.mime,
                  size: payloadBuffer.length,
                  meta_json: {
                    generated_by: 'gia',
                    generated_from: 'chat',
                    conversation_id,
                    source_prompt: inputText || '',
                    output_format: outputFormat.ext,
                  },
                })
                .select('id')
                .single()

              if (insertedFile?.id) {
                assistantGeneratedAttachments.push({
                  file_id: insertedFile.id,
                  filename,
                  mime: outputFormat.mime,
                  size: payloadBuffer.length,
                  storage_path: storagePath,
                })
              }
            } else {
              console.error('[DocGen] Upload error:', uploadErr.message)
            }
          } catch (docErr) {
            console.error('[DocGen] Error creating generated document:', docErr)
          }
        }
        const msgData: Record<string, unknown> = {
          conversation_id, user_id: user.id, role: 'assistant',
          content: fullContent, sources_json: allSources, model,
          ...(assistantGeneratedAttachments.length > 0 ? { attachments_json: assistantGeneratedAttachments } : {}),
          ...(Object.keys(metaJson).length > 0 ? { meta_json: metaJson } : {}),
        }

        let assistantMessageId: string | null = null
        if (regenerate_message_id) {
          // Create version for regeneration
          const { data: existingVersions } = await serviceClient.from('message_versions')
            .select('version_index').eq('message_id', regenerate_message_id).order('version_index', { ascending: false }).limit(1)
          const nextVersion = (existingVersions?.[0]?.version_index || 0) + 1
          await serviceClient.from('message_versions').insert({
            message_id: regenerate_message_id, version_index: nextVersion,
            content: fullContent, model, sources_json: allSources,
          })
          await serviceClient.from('messages').update({
            content: fullContent,
            sources_json: allSources,
            model,
            ...(assistantGeneratedAttachments.length > 0 ? { attachments_json: assistantGeneratedAttachments } : {}),
            ...(Object.keys(metaJson).length > 0 ? { meta_json: metaJson } : {}),
          }).eq('id', regenerate_message_id)
          assistantMessageId = regenerate_message_id
        } else {
          const { data: newMsg } = await serviceClient.from('messages').insert(msgData).select().single()
          if (newMsg) {
            // Save first version
            await serviceClient.from('message_versions').insert({
              message_id: newMsg.id, version_index: 1, content: fullContent, model, sources_json: allSources,
            })
            assistantMessageId = newMsg.id
          }
        }

        // Record token usage
        if (assistantMessageId && totalTokens > 0) {
          // Model pricing (USD per 1K tokens)
          const modelPricing: Record<string, { prompt: number; completion: number }> = {
            'gpt-4o': { prompt: 0.0025, completion: 0.01 },
            'gpt-4o-mini': { prompt: 0.00015, completion: 0.0006 },
            'gpt-4-turbo': { prompt: 0.01, completion: 0.03 },
            'gpt-4': { prompt: 0.03, completion: 0.06 },
            'gpt-3.5-turbo': { prompt: 0.0005, completion: 0.0015 },
            'claude-3-5-sonnet-20241022': { prompt: 0.003, completion: 0.015 },
            'claude-3-5-haiku-20241022': { prompt: 0.001, completion: 0.005 },
            'claude-3-opus-20240229': { prompt: 0.015, completion: 0.075 },
          }

          const pricing = modelPricing[model] || { prompt: 0, completion: 0 }
          const costUsd = (totalPromptTokens / 1000 * pricing.prompt) + (totalCompletionTokens / 1000 * pricing.completion)

          try {
            await serviceClient.from('token_usage').insert({
              user_id: user.id,
              conversation_id,
              message_id: assistantMessageId,
              model,
              prompt_tokens: totalPromptTokens,
              completion_tokens: totalCompletionTokens,
              total_tokens: totalTokens,
              cost_usd: costUsd,
            })
            console.log(`[TokenUsage] Recorded: ${totalTokens} tokens, $${costUsd.toFixed(6)} for model ${model}`)
          } catch (tokenErr) {
            console.error('[TokenUsage] Failed to record:', tokenErr)
          }
        }

        // Auto-rename conversation: generar un titulo corto con IA (emoji + 3-7 palabras)
        const { data: convForTitle } = await serviceClient.from('conversations')
          .select('title').eq('id', conversation_id).single()
        if (convForTitle && (convForTitle.title === 'Nuevo chat' || !convForTitle.title)) {
          const userInput = (inputText || '').trim()
          const assistantHint = (fullContent || '').trim().substring(0, 800)
          const titleSeed = userInput || assistantHint
          if (titleSeed) {
            let newTitle = ''
            try {
              const titleRes = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: 'gpt-4o-mini',
                  max_tokens: 40,
                  temperature: 0.4,
                  messages: [
                    {
                      role: 'system',
                      content:
                        'Genera un titulo corto y descriptivo para esta conversacion.\n' +
                        'REGLAS: 1) Devuelve SOLO el titulo (sin comillas). 2) 3-7 palabras. 3) Empieza con 1 emoji relacionado. 4) Sin punto final. 5) Sin hashtags. 6) Idioma: el mismo del usuario.',
                    },
                    { role: 'user', content: `Usuario: ${userInput || titleSeed}\n\nAsistente (resumen): ${assistantHint}`.trim() },
                  ],
                }),
              })
              const titleData = await titleRes.json()
              newTitle = (titleData.choices?.[0]?.message?.content || '').trim()
            } catch (e) {
              console.error('[Title] Error generating AI title:', e)
            }

            // Fallback: truncar el input del usuario (comportamiento anterior)
            if (!newTitle) {
              newTitle = titleSeed
              if (newTitle.length > 60) {
                newTitle = newTitle.substring(0, 60)
                const lastSpace = newTitle.lastIndexOf(' ')
                if (lastSpace > 30) newTitle = newTitle.substring(0, lastSpace)
                newTitle += '...'
              }
            }

            newTitle = newTitle
              .replace(/^[\"'`]+|[\"'`]+$/g, '')
              .replace(/\s+/g, ' ')
              .replace(/[.。．]+$/g, '')
              .trim()
              .split('\n')[0]

            if (newTitle.length > 80) newTitle = newTitle.slice(0, 80).trim()

            if (newTitle) {
              await serviceClient.from('conversations')
                .update({ title: newTitle, updated_at: new Date().toISOString() })
                .eq('id', conversation_id)
            }
          }
        }

        // Ã¢â€â‚¬Ã¢â€â‚¬ Auto-memoria: detectar nombre del usuario y guardarlo Ã¢â€â‚¬Ã¢â€â‚¬
        if (inputText && !regenerate_message_id) {
          try {
            const namePatterns = [
              /(?:me llamo|mi nombre es|ll[aÃƒÂ¡]mame)\s+([A-Za-z\u00C0-\u024F]+(?:\s+[A-Za-z\u00C0-\u024F]+){0,2})/i,
              /(?:my name is|i am|i'm|call me)\s+([A-Za-z\u00C0-\u024F]+(?:\s+[A-Za-z\u00C0-\u024F]+){0,2})/i,
              /(?:soy)\s+([A-Z\u00C0-\u024F][a-z\u00C0-\u024F]+(?:\s+[A-Z\u00C0-\u024F][a-z\u00C0-\u024F]+){0,2})/,
            ]

            for (const pattern of namePatterns) {
              const match = inputText.match(pattern)
              if (match && match[1]) {
                const userName = match[1].trim()
                // Validar que parece un nombre real (2-40 chars, no solo nÃƒÂºmeros)
                if (userName.length >= 2 && userName.length <= 40 && !/^[0-9]+$/.test(userName)) {
                  // Verificar si ya existe una memoria con el nombre
                  const { data: existingNameMemory } = await serviceClient
                    .from('memories')
                    .select('id, content')
                    .eq('user_id', user.id)
                    .eq('scope', 'user')
                    .ilike('content', '%nombre del usuario es%')
                    .limit(1)

                  if (existingNameMemory && existingNameMemory.length > 0) {
                    // Actualizar memoria existente si el nombre cambiÃƒÂ³
                    const currentContent = existingNameMemory[0].content
                    if (!currentContent.includes(userName)) {
                      await serviceClient.from('memories')
                        .update({ content: `El nombre del usuario es ${userName}` })
                        .eq('id', existingNameMemory[0].id)
                      await serviceClient.from('profiles')
                        .update({ name: userName, updated_at: new Date().toISOString() })
                        .eq('id', user.id)
                      console.log('[Auto-Memory] Updated user name to:', userName)
                    }
                  } else {
                    // Crear nueva memoria con el nombre
                    await serviceClient.from('memories').insert({
                      user_id: user.id,
                      content: `El nombre del usuario es ${userName}`,
                      scope: 'user',
                      enabled: true,
                    })
                    // Actualizar tambiÃƒÂ©n el perfil
                    await serviceClient.from('profiles')
                      .update({ name: userName, updated_at: new Date().toISOString() })
                      .eq('id', user.id)
                    console.log('[Auto-Memory] Saved user name:', userName)
                  }
                  break
                }
              }
            }
          } catch (memErr) {
            console.error('[Auto-Memory] Error detecting/saving name:', memErr)
          }
        }

        // Ã¢â€â‚¬Ã¢â€â‚¬ Webhook notifications: send to Discord/Slack when chat is long Ã¢â€â‚¬Ã¢â€â‚¬
        if (!regenerate_message_id) {
          try {
            const { count: msgCount } = await serviceClient.from('messages')
              .select('id', { count: 'exact', head: true })
              .eq('conversation_id', conversation_id)
            if (msgCount && msgCount > 0) {
              const { data: webhooks } = await serviceClient.from('webhook_configs')
                .select('*').eq('user_id', user.id).eq('enabled', true)
              if (webhooks && webhooks.length > 0) {
                const { data: profile } = await serviceClient.from('profiles')
                  .select('name').eq('id', user.id).single()
                const { data: convTitle } = await serviceClient.from('conversations')
                  .select('title').eq('id', conversation_id).single()
                const userName = profile?.name || 'Usuario'
                const title = convTitle?.title || 'Sin tÃƒÂ­tulo'
                for (const wh of webhooks) {
                  if (msgCount >= wh.min_messages) {
                    const summary = fullContent.length > 300 ? fullContent.substring(0, 300) + '...' : fullContent
                    try {
                      if (wh.webhook_type === 'discord') {
                        await fetch(wh.webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ embeds: [{ title: `Ã°Å¸â€™Â¬ Chat completado Ã¢â‚¬â€ ${title}`, description: summary, color: 0x5865F2,
                            fields: [{ name: 'Ã°Å¸â€˜Â¤ Usuario', value: userName, inline: true }, { name: 'Ã°Å¸â€œÅ  Mensajes', value: String(msgCount), inline: true }, { name: 'Ã°Å¸Â¤â€“ Modelo', value: model, inline: true }],
                            footer: { text: 'GEIA' }, timestamp: new Date().toISOString() }] }) })
                      } else {
                        await fetch(wh.webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ blocks: [
                            { type: 'header', text: { type: 'plain_text', text: `Ã°Å¸â€™Â¬ Chat completado Ã¢â‚¬â€ ${title}`, emoji: true } },
                            { type: 'section', text: { type: 'mrkdwn', text: summary } },
                            { type: 'section', fields: [{ type: 'mrkdwn', text: `*Ã°Å¸â€˜Â¤* ${userName}` }, { type: 'mrkdwn', text: `*Ã°Å¸â€œÅ * ${msgCount} msgs` }, { type: 'mrkdwn', text: `*Ã°Å¸Â¤â€“* ${model}` }] },
                          ] }) })
                      }
                    } catch (whErr) { console.error('[Webhook] Send error:', whErr) }
                  }
                }
              }
            }
          } catch (whErr) { console.error('[Webhook] Error:', whErr) }
        }

        // Send a signal that the conversation title may have been updated
        controller.enqueue(encoder.encode('\n__TITLE_UPDATED__'))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'Transfer-Encoding': 'chunked' },
  })
}
