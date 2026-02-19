'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

// Temas disponibles
const AVAILABLE_THEMES = {
  'liquid-glass': {
    id: 'liquid-glass',
    name: 'Liquid Glass',
    slug: 'liquid-glass',
    description: 'Tema moderno con efectos de vidrio'
  },
  'halloween': {
    id: 'halloween',
    name: 'Halloween',
    slug: 'halloween',
    description: 'Tema oscuro épico con gradiente negro-naranja'
  },
  'navidad': {
    id: 'navidad',
    name: 'Navidad',
    slug: 'navidad',
    description: 'Tema festivo navideño'
  }
} as const

type ThemeSlug = keyof typeof AVAILABLE_THEMES

interface Theme {
  id: string
  name: string
  slug: string
  description: string
}

interface ThemeContextType {
  currentTheme: Theme
  setTheme: (slug: ThemeSlug) => void
  availableThemes: typeof AVAILABLE_THEMES
  refreshTheme: () => Promise<void>
}

const ThemeContext = createContext<ThemeContextType>({
  currentTheme: AVAILABLE_THEMES['liquid-glass'],
  setTheme: () => {},
  availableThemes: AVAILABLE_THEMES,
  refreshTheme: async () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState<Theme>(AVAILABLE_THEMES['liquid-glass'])

  // Cargar tema desde Supabase al iniciar
  useEffect(() => {
    void loadThemeFromServer()
  }, [])

  const loadThemeFromServer = async () => {
    try {
      console.log('[Theme] Loading from server...')
      const res = await fetch('/api/public/app-settings', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      })

      if (!res.ok) {
        console.error('[Theme] Failed to load from server, using default')
        applyTheme('liquid-glass')
        return
      }

      const data = await res.json()
      const themeSlug = data.active_theme?.slug || 'liquid-glass'

      if (AVAILABLE_THEMES[themeSlug as ThemeSlug]) {
        setCurrentTheme(AVAILABLE_THEMES[themeSlug as ThemeSlug])
        applyTheme(themeSlug as ThemeSlug)
        console.log('[Theme] Loaded from server:', themeSlug)
      } else {
        console.error('[Theme] Invalid theme from server:', themeSlug)
        applyTheme('liquid-glass')
      }
    } catch (err) {
      console.error('[Theme] Error loading from server:', err)
      applyTheme('liquid-glass')
    }
  }

  const applyTheme = (slug: ThemeSlug) => {
    if (typeof window === 'undefined') return

    const root = document.documentElement
    root.setAttribute('data-theme', slug)
    console.log(`[Theme] Applied theme: ${slug}`)
  }

  const setTheme = (slug: ThemeSlug) => {
    if (!AVAILABLE_THEMES[slug]) {
      console.error('[Theme] Invalid theme slug:', slug)
      return
    }

    const theme = AVAILABLE_THEMES[slug]
    setCurrentTheme(theme)
    applyTheme(slug)
    console.log('[Theme] Theme changed to:', slug)
  }

  const refreshTheme = async () => {
    await loadThemeFromServer()
  }

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme, availableThemes: AVAILABLE_THEMES, refreshTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

