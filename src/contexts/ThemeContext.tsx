'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ThemeConfig {
  primary?: string
  secondary?: string
  background?: string
  accent?: string
  glass?: boolean
  [key: string]: any
}

interface Theme {
  id: string
  name: string
  slug: string
  config_json: ThemeConfig
  is_active: boolean
}

interface ThemeContextType {
  currentTheme: Theme | null
  loading: boolean
  refreshTheme: () => Promise<void>
}

const ThemeContext = createContext<ThemeContextType>({
  currentTheme: null,
  loading: true,
  refreshTheme: async () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState<Theme | null>(null)
  const [loading, setLoading] = useState(true)

  const loadActiveTheme = async () => {
    try {
      console.log('[Theme] Loading active theme from Supabase...')
      const supabase = createClient()
      const { data, error } = await supabase
        .from('app_themes')
        .select('*')
        .eq('is_active', true)
        .single()

      if (error) {
        console.error('[Theme] Error loading active theme:', error)
        // Set default theme if none is active
        const defaultTheme = {
          id: 'default',
          name: 'Liquid Glass',
          slug: 'liquid-glass',
          config_json: {
            primary: '#3b82f6',
            background: '#ffffff',
            glass: true
          },
          is_active: true
        }
        console.log('[Theme] Using default theme:', defaultTheme)
        setCurrentTheme(defaultTheme)
      } else {
        console.log('[Theme] Loaded theme from DB:', data)
        setCurrentTheme(data)
      }
    } catch (err) {
      console.error('[Theme] Failed to load theme:', err)
    } finally {
      setLoading(false)
    }
  }

  const applyTheme = (theme: Theme | null) => {
    if (!theme) return

    const config = theme.config_json
    const root = document.documentElement

    // Apply CSS variables
    if (config.primary) root.style.setProperty('--theme-primary', config.primary)
    if (config.secondary) root.style.setProperty('--theme-secondary', config.secondary)
    if (config.background) root.style.setProperty('--theme-background', config.background)
    if (config.accent) root.style.setProperty('--theme-accent', config.accent)

    // Apply theme class
    root.setAttribute('data-theme', theme.slug)

    console.log(`[Theme] Applied theme: ${theme.name}`, config)
  }

  useEffect(() => {
    void loadActiveTheme()
  }, [])

  useEffect(() => {
    if (currentTheme) {
      applyTheme(currentTheme)
    }
  }, [currentTheme])

  const refreshTheme = async () => {
    setLoading(true)
    await loadActiveTheme()
  }

  return (
    <ThemeContext.Provider value={{ currentTheme, loading, refreshTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

