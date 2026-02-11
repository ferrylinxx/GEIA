export interface WebSearchResult {
  title: string
  url: string
  snippet: string
  pageContent?: string  // Full extracted text from the page
  score?: number        // Relevance score from Tavily
}

/** Tavily-generated summary answer (when available) */
export let lastSearchAnswer: string | null = null

export async function searchWeb(query: string, numResults = 5): Promise<WebSearchResult[]> {
  lastSearchAnswer = null
  // Try Tavily first if API key is available (best for AI apps)
  if (process.env.TAVILY_API_KEY) {
    try {
      return await searchWithTavily(query, numResults)
    } catch (e) {
      console.error('[Tavily] Error, falling back to DuckDuckGo:', e)
    }
  }

  // Fallback to DuckDuckGo HTML scraping (no API key needed)
  return searchWithDuckDuckGo(query, numResults)
}

/**
 * Detect if query is news-related to choose proper Tavily topic/time_range
 */
function detectQueryParams(query: string): { topic: 'general' | 'news' | 'finance'; time_range?: string; country?: string } {
  const q = query.toLowerCase()
  const newsKeywords = ['noticias', 'noticia', 'hoy', 'ayer', 'última hora', 'actualidad', 'reciente', 'resultado', 'resultados', 'clasificación', 'jornada', 'partido', 'marcador', 'fichaje', 'elecciones', 'breaking']
  const financeKeywords = ['cotización', 'bolsa', 'acciones', 'ibex', 'nasdaq', 'dow jones', 'crypto', 'bitcoin', 'precio acciones', 'stock price']
  const isNews = newsKeywords.some(kw => q.includes(kw))
  const isFinance = financeKeywords.some(kw => q.includes(kw))
  const topic = isFinance ? 'finance' : isNews ? 'news' : 'general'
  // For news queries, limit to recent results
  const time_range = isNews ? 'week' : undefined
  // Detect Spanish context
  const spanishKeywords = ['liga', 'laliga', 'españa', 'spanish', 'madrid', 'barcelona', 'gobierno español', 'ibex']
  const country = spanishKeywords.some(kw => q.includes(kw)) ? 'spain' : undefined
  return { topic, time_range, country }
}

async function searchWithTavily(query: string, numResults: number): Promise<WebSearchResult[]> {
  const params = detectQueryParams(query)
  console.log('[Tavily] Params:', { query: query.substring(0, 60), ...params, depth: 'advanced', raw_content: true })

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      max_results: numResults,
      search_depth: 'advanced',
      include_raw_content: 'markdown',
      include_answer: 'basic',
      topic: params.topic,
      ...(params.time_range ? { time_range: params.time_range } : {}),
      ...(params.country ? { country: params.country } : {}),
      chunks_per_source: 3,
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    console.error('[Tavily] API error:', res.status, errText)
    throw new Error(`Tavily search failed: ${res.status}`)
  }
  const data = await res.json()

  // Save Tavily's generated answer if available
  if (data.answer) {
    lastSearchAnswer = data.answer
    console.log('[Tavily] Got answer:', data.answer.substring(0, 100) + '...')
  }

  return (data.results || []).slice(0, numResults).map((r: { title?: string; url?: string; content?: string; raw_content?: string; score?: number }) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.content || '',
    pageContent: r.raw_content ? r.raw_content.slice(0, 6000) : undefined,
    score: r.score || 0,
  }))
}

async function searchWithDuckDuckGo(query: string, numResults: number): Promise<WebSearchResult[]> {
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })
    const html = await res.text()
    const results: WebSearchResult[] = []

    // Split by result blocks
    const blocks = html.split(/class="result\s+results_links/)
    for (let i = 1; i < Math.min(blocks.length, numResults + 1); i++) {
      const block = blocks[i]

      // Extract URL from uddg parameter
      const uddgMatch = block.match(/uddg=([^&"]+)/)
      const url = uddgMatch ? decodeURIComponent(uddgMatch[1]) : ''

      // Extract title text
      const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/)
      let title = titleMatch
        ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
        : ''

      // Extract snippet text
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)
      const snippet = snippetMatch
        ? snippetMatch[1].replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
        : ''

      if (url && (title || snippet)) {
        if (!title) title = url
        results.push({ title, url, snippet })
      }
    }

    return results
  } catch (e) {
    console.error('DuckDuckGo search error:', e)
    return []
  }
}

/**
 * Fetch and extract readable text content from a URL.
 * Returns truncated plain text (max ~4000 chars) suitable for LLM context.
 */
export async function fetchPageContent(url: string, maxChars = 4000): Promise<string> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      },
    })
    clearTimeout(timeout)

    if (!res.ok) return ''
    const html = await res.text()

    // Remove script, style, nav, header, footer, aside tags and their content
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')

    // Convert table rows to readable format (important for classification tables)
    text = text.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_, row) => {
      const cells = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || []
      const cellTexts = cells.map((c: string) => c.replace(/<[^>]+>/g, '').trim()).filter(Boolean)
      return cellTexts.join(' | ') + '\n'
    })

    // Convert list items
    text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '• $1\n')

    // Convert headings to text with newlines
    text = text.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n$1\n')

    // Convert <br> and <p> to newlines
    text = text.replace(/<br\s*\/?>/gi, '\n')
    text = text.replace(/<\/p>/gi, '\n')
    text = text.replace(/<\/div>/gi, '\n')

    // Strip all remaining HTML tags
    text = text.replace(/<[^>]+>/g, '')

    // Decode HTML entities
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))

    // Clean up whitespace
    text = text
      .split('\n')
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(line => line.length > 0)
      .join('\n')

    // Remove duplicate consecutive lines
    text = text.replace(/^(.+)$\n(?=\1$)/gm, '')

    return text.slice(0, maxChars)
  } catch (e) {
    console.error(`[fetchPageContent] Error fetching ${url}:`, e instanceof Error ? e.message : e)
    return ''
  }
}

/**
 * Enrich search results by fetching actual page content from the top N URLs.
 * This gives the LLM real data instead of just snippets.
 */
export async function enrichSearchResults(results: WebSearchResult[], topN = 3): Promise<WebSearchResult[]> {
  const toFetch = results.slice(0, topN)
  const rest = results.slice(topN)

  const enriched = await Promise.all(
    toFetch.map(async (r) => {
      const pageContent = await fetchPageContent(r.url)
      return { ...r, pageContent: pageContent || undefined }
    })
  )

  return [...enriched, ...rest]
}
