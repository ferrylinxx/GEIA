import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { tikaServerUrl } = await req.json()

    if (!tikaServerUrl) {
      return NextResponse.json({ error: 'tikaServerUrl is required' }, { status: 400 })
    }

    // Normalize URL: remove trailing slash if present
    const baseUrl = tikaServerUrl.replace(/\/$/, '')

    // Test connection to Tika server
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    try {
      const res = await fetch(baseUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      })

      clearTimeout(timeoutId)

      if (!res.ok) {
        return NextResponse.json({
          success: false,
          message: `HTTP ${res.status}: ${res.statusText}`,
        })
      }

      const text = await res.text()
      const version = res.headers.get('X-Tika-Version') || '3.2.3'

      // Check if it's actually a Tika server
      if (text.includes('Apache Tika')) {
        return NextResponse.json({
          success: true,
          message: `Conexión exitosa! Apache Tika ${version} Server`,
          version,
        })
      } else {
        return NextResponse.json({
          success: false,
          message: 'La URL no parece ser un servidor Apache Tika',
        })
      }
    } catch (fetchError) {
      clearTimeout(timeoutId)
      
      if (fetchError instanceof Error) {
        if (fetchError.name === 'AbortError') {
          return NextResponse.json({
            success: false,
            message: 'Timeout: El servidor no respondió en 5 segundos',
          })
        }
        return NextResponse.json({
          success: false,
          message: `Error de conexión: ${fetchError.message}`,
        })
      }
      
      return NextResponse.json({
        success: false,
        message: 'Error desconocido al conectar con Tika',
      })
    }
  } catch (error) {
    console.error('Error testing Tika connection:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Error interno del servidor' 
      },
      { status: 500 }
    )
  }
}

