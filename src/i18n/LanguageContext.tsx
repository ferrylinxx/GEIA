'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { es, type TranslationKeys } from './translations/es'
import { ca } from './translations/ca'

export type Language = 'es' | 'ca'

const translations: Record<Language, TranslationKeys> = { es, ca }

const STORAGE_KEY = 'geia-language'

function getStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'es'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'es' || stored === 'ca') return stored
  return 'es'
}

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: TranslationKeys
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'es',
  setLanguage: () => {},
  t: es,
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('es')

  useEffect(() => {
    setLanguageState(getStoredLanguage())
  }, [])

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem(STORAGE_KEY, lang)
  }, [])

  const t = translations[language]

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useTranslation() {
  return useContext(LanguageContext)
}

