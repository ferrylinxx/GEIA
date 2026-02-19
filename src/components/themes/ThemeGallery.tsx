'use client'

import { useState, useEffect } from 'react'
import { Palette, Heart, Eye, Download, Sparkles } from 'lucide-react'

interface Theme {
  id: string
  name: string
  description?: string
  colors: {
    primary?: string
    secondary?: string
    background?: string
    text?: string
  }
  gradients?: any
  effects?: any
  likes_count: number
  usage_count: number
  is_public: boolean
  user_id: string
  created_at: string
}

export default function ThemeGallery() {
  const [themes, setThemes] = useState<Theme[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<'created_at' | 'likes' | 'usage'>('likes')

  useEffect(() => {
    loadThemes()
  }, [sortBy])

  const loadThemes = async () => {
    try {
      const { data } = await fetch(`/api/themes?include_public=true&sort_by=${sortBy}`).then(r => r.json())
      if (data) {
        setThemes(data)
      }
    } catch (error) {
      console.error('Error loading themes:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleLike = async (themeId: string) => {
    try {
      await fetch(`/api/themes/${themeId}/like`, {
        method: 'POST'
      })
      loadThemes() // Reload to update likes count
    } catch (error) {
      console.error('Error toggling like:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-2xl font-bold text-zinc-800 flex items-center gap-2">
          <Palette className="w-6 h-6 text-blue-600" />
          Galería de Temas
        </h2>

        {/* Sort options */}
        <div className="flex gap-2">
          <button
            onClick={() => setSortBy('likes')}
            className={`px-4 py-2 rounded-lg transition-colors font-medium ${
              sortBy === 'likes'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-white/80 text-zinc-700 hover:bg-white border border-zinc-200'
            }`}
          >
            Más gustados
          </button>
          <button
            onClick={() => setSortBy('usage')}
            className={`px-4 py-2 rounded-lg transition-colors font-medium ${
              sortBy === 'usage'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-white/80 text-zinc-700 hover:bg-white border border-zinc-200'
            }`}
          >
            Más usados
          </button>
          <button
            onClick={() => setSortBy('created_at')}
            className={`px-4 py-2 rounded-lg transition-colors font-medium ${
              sortBy === 'created_at'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-white/80 text-zinc-700 hover:bg-white border border-zinc-200'
            }`}
          >
            Más recientes
          </button>
        </div>
      </div>

      {/* Themes grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {themes.map(theme => (
          <div
            key={theme.id}
            className="bg-white/80 backdrop-blur-sm border border-zinc-200 rounded-xl overflow-hidden hover:border-blue-400 hover:shadow-xl transition-all group"
          >
            {/* Theme preview */}
            <div
              className="h-32 relative"
              style={{
                background: theme.colors.primary
                  ? `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.secondary || theme.colors.primary})`
                  : 'linear-gradient(135deg, #8B5CF6, #EC4899)'
              }}
            >
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
            </div>

            {/* Theme info */}
            <div className="p-4 space-y-3">
              <div>
                <h3 className="font-semibold text-zinc-800 text-lg">{theme.name}</h3>
                {theme.description && (
                  <p className="text-sm text-zinc-600 line-clamp-2">{theme.description}</p>
                )}
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 text-sm text-zinc-600">
                <div className="flex items-center gap-1">
                  <Heart className="w-4 h-4 text-red-500" />
                  <span className="font-medium">{theme.likes_count}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Eye className="w-4 h-4 text-blue-500" />
                  <span className="font-medium">{theme.usage_count}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => toggleLike(theme.id)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white hover:bg-zinc-50 border border-zinc-300 text-zinc-700 rounded-lg transition-colors font-medium"
                >
                  <Heart className="w-4 h-4" />
                  Me gusta
                </button>
                <button
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium shadow-lg"
                >
                  <Download className="w-4 h-4" />
                  Usar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {themes.length === 0 && (
        <div className="text-center text-zinc-600 p-12 bg-white/80 backdrop-blur-sm border border-zinc-200 rounded-xl">
          No hay temas disponibles
        </div>
      )}
    </div>
  )
}

