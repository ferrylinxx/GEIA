'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

// Temas disponibles localmente
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
}

const ThemeContext = createContext<ThemeContextType>({
  currentTheme: AVAILABLE_THEMES['liquid-glass'],
  setTheme: () => {},
  availableThemes: AVAILABLE_THEMES,
})

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState<Theme>(AVAILABLE_THEMES['liquid-glass'])

  // Cargar tema desde localStorage al iniciar
  useEffect(() => {
    if (typeof window === 'undefined') return

    const savedTheme = localStorage.getItem('geia-theme') as ThemeSlug | null
    if (savedTheme && AVAILABLE_THEMES[savedTheme]) {
      setCurrentTheme(AVAILABLE_THEMES[savedTheme])
      applyTheme(savedTheme)
      console.log('[Theme] Loaded from localStorage:', savedTheme)
    } else {
      // Aplicar tema por defecto
      applyTheme('liquid-glass')
      console.log('[Theme] Using default theme: liquid-glass')
    }
  }, [])

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

    // Guardar en localStorage
    localStorage.setItem('geia-theme', slug)
    console.log('[Theme] Theme changed to:', slug)
  }

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme, availableThemes: AVAILABLE_THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

