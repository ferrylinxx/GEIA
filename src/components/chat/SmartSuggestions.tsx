'use client'

import { useEffect, useState } from 'react'
import { Lightbulb, X, Sparkles, FileText, Globe, Database, BarChart3, Image as ImageIcon } from 'lucide-react'
import { useChatStore } from '@/store/chat-store'
import { FileAttachment } from '@/lib/types'

interface Suggestion {
  id: string
  icon: React.ReactNode
  text: string
  action: () => void
  type: 'tool' | 'prompt' | 'followup'
}

interface SmartSuggestionsProps {
  input: string
  attachments: FileAttachment[]
  onApplySuggestion: (text: string, toolActivations?: {
    webSearch?: boolean
    dbQuery?: boolean
    imageGeneration?: boolean
    spreadsheetAnalysis?: boolean
  }) => void
}

export default function SmartSuggestions({ input, attachments, onApplySuggestion }: SmartSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [dismissed, setDismissed] = useState(false)
  const { streamingContent } = useChatStore()

  useEffect(() => {
    // Reset dismissed state when input or attachments change
    setDismissed(false)
    
    const newSuggestions: Suggestion[] = []

    // ── Attachment-based suggestions ──
    if (attachments.length > 0) {
      const hasPDF = attachments.some(a => a.mime?.includes('pdf') || a.filename?.toLowerCase().endsWith('.pdf'))
      const hasSpreadsheet = attachments.some(a => 
        a.mime?.includes('spreadsheet') || 
        a.mime?.includes('excel') ||
        a.filename?.toLowerCase().match(/\.(xlsx?|csv)$/)
      )
      const hasImage = attachments.some(a => a.mime?.startsWith('image/'))
      const hasDocument = attachments.some(a => 
        a.mime?.includes('document') || 
        a.mime?.includes('word') ||
        a.filename?.toLowerCase().match(/\.(docx?|txt|rtf)$/)
      )

      if (hasPDF && !input.toLowerCase().includes('resumen')) {
        newSuggestions.push({
          id: 'summarize-pdf',
          icon: <FileText size={14} />,
          text: '¿Resumir este documento en 3 puntos clave?',
          type: 'prompt',
          action: () => onApplySuggestion('Resume este documento en 3 puntos clave principales')
        })
      }

      if (hasSpreadsheet && !input.toLowerCase().includes('analiz')) {
        newSuggestions.push({
          id: 'analyze-spreadsheet',
          icon: <BarChart3 size={14} />,
          text: '¿Analizar datos de esta hoja de cálculo?',
          type: 'tool',
          action: () => onApplySuggestion('Analiza los datos de esta hoja de cálculo y muestra insights clave', {
            spreadsheetAnalysis: true
          })
        })
      }

      if (hasImage && !input) {
        newSuggestions.push({
          id: 'describe-image',
          icon: <ImageIcon size={14} />,
          text: '¿Describir el contenido de esta imagen?',
          type: 'prompt',
          action: () => onApplySuggestion('Describe detalladamente el contenido de esta imagen')
        })
      }

      if (hasDocument && !input.toLowerCase().includes('extraer')) {
        newSuggestions.push({
          id: 'extract-data',
          icon: <FileText size={14} />,
          text: '¿Extraer datos estructurados del documento?',
          type: 'prompt',
          action: () => onApplySuggestion('Extrae todos los datos estructurados de este documento en formato tabla')
        })
      }
    }

    // ── Input-based suggestions ──
    const lowerInput = input.toLowerCase()

    // Suggest web search for current events, news, or recent data
    if (!attachments.length && (
      lowerInput.match(/\b(hoy|ahora|actual|últim[oa]s?|reciente|noticia|precio|cotización)\b/) ||
      lowerInput.match(/\b(2024|2025|2026)\b/) ||
      lowerInput.match(/\b(qué pasó|qué pasa|cómo está)\b/)
    )) {
      newSuggestions.push({
        id: 'enable-web-search',
        icon: <Globe size={14} />,
        text: '¿Activar búsqueda web para datos actuales?',
        type: 'tool',
        action: () => onApplySuggestion(input, { webSearch: true })
      })
    }

    // Suggest database query for data analysis
    if (lowerInput.match(/\b(cuántos|total|suma|promedio|máximo|mínimo|lista|tabla)\b/) &&
        lowerInput.match(/\b(usuarios|clientes|ventas|productos|pedidos|registros)\b/)) {
      newSuggestions.push({
        id: 'enable-db-query',
        icon: <Database size={14} />,
        text: '¿Consultar base de datos para esta información?',
        type: 'tool',
        action: () => onApplySuggestion(input, { dbQuery: true })
      })
    }

    // Suggest image generation for creative requests
    if (lowerInput.match(/\b(crea|genera|diseña|dibuja|imagen|logo|ilustración)\b/) &&
        !lowerInput.match(/\b(documento|informe|texto|tabla)\b/)) {
      newSuggestions.push({
        id: 'enable-image-gen',
        icon: <ImageIcon size={14} />,
        text: '¿Generar imagen con IA?',
        type: 'tool',
        action: () => onApplySuggestion(input, { imageGeneration: true })
      })
    }

    // Limit to 3 suggestions max
    setSuggestions(newSuggestions.slice(0, 3))
  }, [input, attachments, onApplySuggestion])

  // Don't show if streaming, dismissed, or no suggestions
  if (streamingContent || dismissed || suggestions.length === 0) {
    return null
  }

  return (
    <div className="mb-2 p-3 rounded-xl bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-100/50 shadow-sm">
      <div className="flex items-start gap-2">
        <Sparkles size={16} className="text-purple-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-purple-700 mb-2">Sugerencias inteligentes</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                onClick={suggestion.action}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-purple-200 text-xs text-purple-700 hover:bg-purple-50 hover:border-purple-300 transition-all shadow-sm hover:shadow"
              >
                {suggestion.icon}
                <span>{suggestion.text}</span>
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-purple-400 hover:text-purple-600 transition-colors shrink-0"
          aria-label="Cerrar sugerencias"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

