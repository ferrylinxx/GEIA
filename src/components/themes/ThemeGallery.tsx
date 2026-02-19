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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Palette className="w-6 h-6 text-purple-500" />
          Galería de Temas
        </h2>

        {/* Sort options */}
        <div className="flex gap-2">
          <button
            onClick={() => setSortBy('likes')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              sortBy === 'likes'
                ? 'bg-purple-600 text-white'
                : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
          >
            Más gustados
          </button>
          <button
            onClick={() => setSortBy('usage')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              sortBy === 'usage'
                ? 'bg-purple-600 text-white'
                : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
          >
            Más usados
          </button>
          <button
            onClick={() => setSortBy('created_at')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              sortBy === 'created_at'
                ? 'bg-purple-600 text-white'
                : 'bg-white/5 text-white/60 hover:bg-white/10'
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
            className="bg-white/5 border border-white/10 rounded-lg overflow-hidden hover:border-purple-500/50 transition-all group"
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
                <h3 className="font-semibold text-white text-lg">{theme.name}</h3>
                {theme.description && (
                  <p className="text-sm text-white/60 line-clamp-2">{theme.description}</p>
                )}
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 text-sm text-white/60">
                <div className="flex items-center gap-1">
                  <Heart className="w-4 h-4" />
                  <span>{theme.likes_count}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  <span>{theme.usage_count}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => toggleLike(theme.id)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
                >
                  <Heart className="w-4 h-4" />
                  Me gusta
                </button>
                <button
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
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
        <div className="text-center text-white/60 p-12">
          No hay temas disponibles
        </div>
      )}
    </div>
  )
}

