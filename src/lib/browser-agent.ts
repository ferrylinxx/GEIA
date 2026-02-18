/**
 * Browser Agent - Sistema de automatización de navegador tipo Browser Web UI
 * Controla un navegador de forma autónoma para realizar búsquedas y tareas web
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright'

export type BrowserEventCallback = (type: string, message: string, data?: unknown, url?: string, progress?: number, screenshot?: string) => void

export interface BrowserAgentTask {
  query: string
  maxSteps?: number
  takeScreenshots?: boolean
}

export interface BrowserAgentResult {
  success: boolean
  data?: unknown
  error?: string
  screenshots?: string[]
}

export class BrowserAgent {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null
  private onEvent?: BrowserEventCallback

  constructor(onEvent?: BrowserEventCallback) {
    this.onEvent = onEvent
  }

  private emitEvent(type: string, message: string, data?: unknown, url?: string, progress?: number, screenshot?: string) {
    this.onEvent?.(type, message, data, url, progress, screenshot)
  }

  async initialize() {
    try {
      this.emitEvent('browser_init', '🌐 Iniciando navegador Chrome...', undefined, undefined, 5)
      
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      })

      this.context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      })

      this.page = await this.context.newPage()
      
      this.emitEvent('browser_init', '✅ Navegador iniciado correctamente', undefined, undefined, 10)
    } catch (error) {
      this.emitEvent('browser_error', `❌ Error al iniciar navegador: ${error}`, undefined, undefined, 0)
      throw error
    }
  }

  async searchGoogle(query: string): Promise<BrowserAgentResult> {
    if (!this.page) {
      throw new Error('Browser not initialized')
    }

    try {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`
      
      this.emitEvent('web_access', `🔍 Buscando en Google: "${query}"`, undefined, searchUrl, 20)
      
      await this.page.goto(searchUrl, { waitUntil: 'networkidle' })
      
      this.emitEvent('analyzing', '✨ Analizando resultados de búsqueda...', undefined, undefined, 40)
      
      // Tomar screenshot
      const screenshot = await this.page.screenshot({ encoding: 'base64', fullPage: false })
      this.emitEvent('screenshot', '📸 Captura de pantalla tomada', undefined, undefined, 50, screenshot)
      
      // Extraer resultados
      const results = await this.page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('div.g'))
        return items.slice(0, 10).map(item => {
          const titleEl = item.querySelector('h3')
          const linkEl = item.querySelector('a')
          const snippetEl = item.querySelector('.VwiC3b, .yXK7lf')
          
          return {
            title: titleEl?.textContent || '',
            url: linkEl?.getAttribute('href') || '',
            snippet: snippetEl?.textContent || ''
          }
        }).filter(r => r.title && r.url)
      })

      this.emitEvent('extracting', `📄 Extraídos ${results.length} resultados`, { count: results.length }, undefined, 60)
      
      return {
        success: true,
        data: results,
        screenshots: [screenshot]
      }
    } catch (error) {
      this.emitEvent('browser_error', `❌ Error en búsqueda: ${error}`, undefined, undefined, 0)
      return {
        success: false,
        error: String(error)
      }
    }
  }

  async visitPage(url: string): Promise<BrowserAgentResult> {
    if (!this.page) {
      throw new Error('Browser not initialized')
    }

    try {
      this.emitEvent('web_access', `🌐 Visitando: ${url}`, undefined, url, 70)
      
      await this.page.goto(url, { waitUntil: 'networkidle', timeout: 15000 })
      
      this.emitEvent('analyzing', '✨ Analizando contenido de la página...', undefined, undefined, 80)
      
      // Tomar screenshot
      const screenshot = await this.page.screenshot({ encoding: 'base64', fullPage: false })
      this.emitEvent('screenshot', '📸 Captura de pantalla tomada', undefined, undefined, 85, screenshot)
      
      // Extraer contenido
      const content = await this.page.evaluate(() => {
        // Remover scripts, styles, etc.
        const clone = document.body.cloneNode(true) as HTMLElement
        clone.querySelectorAll('script, style, nav, header, footer, aside').forEach(el => el.remove())
        return clone.innerText.slice(0, 5000)
      })

      this.emitEvent('extracting', `📄 Extraídos ${content.length} caracteres`, undefined, undefined, 90)
      
      return {
        success: true,
        data: { content, url },
        screenshots: [screenshot]
      }
    } catch (error) {
      this.emitEvent('browser_error', `❌ Error al visitar página: ${error}`, undefined, undefined, 0)
      return {
        success: false,
        error: String(error)
      }
    }
  }

  async close() {
    this.emitEvent('browser_close', '🔒 Cerrando navegador...', undefined, undefined, 95)
    
    if (this.page) await this.page.close()
    if (this.context) await this.context.close()
    if (this.browser) await this.browser.close()
    
    this.emitEvent('complete', '✅ Navegador cerrado correctamente', undefined, undefined, 100)
  }
}

