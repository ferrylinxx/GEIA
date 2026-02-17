'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useChatStore } from '@/store/chat-store'
import { useUIStore } from '@/store/ui-store'
import { createClient } from '@/lib/supabase/client'
import { ImageIcon, Loader2, MessageSquare, RefreshCw, Search, Download, Grid3x3, LayoutGrid, Calendar, Sparkles, Eye, Heart, Share2, Trash2, Filter, X, Clock, Zap, List } from 'lucide-react'
import { useTranslation } from '@/i18n/LanguageContext'

interface GalleryImage {
  id: string
  conversation_id: string
  image_url: string
  prompt: string
  created_at: string
  conversation_title: string
}

function formatDateKey(dateValue: string): string {
  const d = new Date(dateValue)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return 'Hoy'
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer'

  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export default function ImagesGalleryPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { setActiveConversation } = useChatStore()
  const { openImagePreview, addToast } = useUIStore()

  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [images, setImages] = useState<GalleryImage[]>([])
  const [viewMode, setViewMode] = useState<'grid' | 'masonry' | 'list'>('masonry')
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all')
  const [sortBy, setSortBy] = useState<'date' | 'chat'>('date')
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(false)
  const [hoveredImage, setHoveredImage] = useState<string | null>(null)

  const loadImages = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setImages([])
        return
      }

      const { data: rows } = await supabase
        .from('messages')
        .select('id, conversation_id, meta_json, created_at')
        .eq('user_id', user.id)
        .eq('role', 'assistant')
        .order('created_at', { ascending: false })
        .limit(700)

      const parsed = (rows || [])
        .map((row: {
          id: string
          conversation_id: string
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          meta_json: Record<string, any> | null
          created_at: string
        }) => {
          const imageUrl = row.meta_json?.image_url
          const imagePrompt = row.meta_json?.image_prompt
          if (typeof imageUrl !== 'string' || imageUrl.trim().length === 0) return null
          return {
            id: row.id,
            conversation_id: row.conversation_id,
            image_url: imageUrl,
            prompt: typeof imagePrompt === 'string' ? imagePrompt : '',
            created_at: row.created_at,
          }
        })
        .filter((item): item is { id: string; conversation_id: string; image_url: string; prompt: string; created_at: string } => Boolean(item))

      const conversationIds = Array.from(new Set(parsed.map((item) => item.conversation_id).filter(Boolean)))
      const titleMap = new Map<string, string>()
      if (conversationIds.length > 0) {
        const { data: conversations } = await supabase
          .from('conversations')
          .select('id, title')
          .in('id', conversationIds)

        for (const row of conversations || []) {
          titleMap.set(row.id, row.title || 'Chat')
        }
      }

      const merged: GalleryImage[] = parsed.map((item) => ({
        ...item,
        conversation_title: titleMap.get(item.conversation_id) || 'Chat',
      }))

      setImages(merged)
    } catch {
      setImages([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadImages()
  }, [loadImages])

  const filtered = useMemo(() => {
    let result = images

    // Apply date filter
    if (dateFilter !== 'all') {
      const now = new Date()
      const cutoff = new Date()

      if (dateFilter === 'today') {
        cutoff.setHours(0, 0, 0, 0)
      } else if (dateFilter === 'week') {
        cutoff.setDate(now.getDate() - 7)
      } else if (dateFilter === 'month') {
        cutoff.setMonth(now.getMonth() - 1)
      }

      result = result.filter(item => new Date(item.created_at) >= cutoff)
    }

    // Apply search query
    const q = query.trim().toLowerCase()
    if (q) {
      result = result.filter((item) =>
        item.prompt.toLowerCase().includes(q) ||
        item.conversation_title.toLowerCase().includes(q)
      )
    }

    // Apply sorting
    if (sortBy === 'chat') {
      result = [...result].sort((a, b) => a.conversation_title.localeCompare(b.conversation_title))
    }

    return result
  }, [images, query, dateFilter, sortBy])

  const grouped = useMemo(() => {
    const map = new Map<string, GalleryImage[]>()
    for (const item of filtered) {
      const key = formatDateKey(item.created_at)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    return Array.from(map.entries())
  }, [filtered])

  const imageUrls = useMemo(() => filtered.map((item) => item.image_url), [filtered])

  const downloadImage = async (url: string, prompt: string) => {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `${prompt.slice(0, 50).replace(/[^a-z0-9]/gi, '_')}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(blobUrl)
      addToast?.({ type: 'success', message: 'Imagen descargada correctamente' })
    } catch (error) {
      console.error('Error downloading image:', error)
      addToast?.({ type: 'error', message: 'Error al descargar la imagen' })
    }
  }

  const toggleImageSelection = (id: string) => {
    const newSet = new Set(selectedImages)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedImages(newSet)
  }

  const clearSelection = () => {
    setSelectedImages(new Set())
  }

  const downloadSelected = async () => {
    const selected = filtered.filter(img => selectedImages.has(img.id))
    for (const img of selected) {
      await downloadImage(img.image_url, img.prompt)
    }
    clearSelection()
  }

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-purple-50/30 via-white to-pink-50/30">
      <div className="max-w-7xl mx-auto px-4 py-6 pb-28 md:pb-10">
        {/* SUPER PRO Header */}
        <div className="relative overflow-hidden liquid-glass-card rounded-3xl p-6 mb-6 shadow-2xl shadow-purple-200/30 border border-white/60">
          {/* Animated Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-pink-500/5 to-blue-500/5 animate-gradient" />

          <div className="relative z-10">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg shadow-purple-500/30">
                    <Sparkles size={20} className="text-white" />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-purple-600 font-bold">Galería Pro</p>
                    <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600">
                      Imágenes Generadas
                    </h1>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 border border-purple-200/50 shadow-sm">
                    <Eye size={14} className="text-purple-500" />
                    <span className="text-sm font-bold text-purple-700">{filtered.length}</span>
                    <span className="text-xs text-zinc-500">{filtered.length === 1 ? 'imagen' : 'imágenes'}</span>
                  </div>
                  {selectedImages.size > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30">
                      <Heart size={14} className="fill-current" />
                      <span className="text-sm font-bold">{selectedImages.size}</span>
                      <span className="text-xs">seleccionadas</span>
                    </div>
                  )}
                  {dateFilter !== 'all' && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-100 border border-blue-200">
                      <Filter size={12} className="text-blue-600" />
                      <span className="text-xs font-medium text-blue-700">
                        {dateFilter === 'today' ? 'Hoy' : dateFilter === 'week' ? 'Última semana' : 'Último mes'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* View Mode Toggle */}
                <div className="flex items-center gap-1 p-1 rounded-xl bg-white/90 border border-white/80 shadow-lg">
                  <button
                    type="button"
                    onClick={() => setViewMode('masonry')}
                    className={`p-2.5 rounded-lg transition-all ${viewMode === 'masonry' ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50'}`}
                    title="Vista Masonry"
                  >
                    <LayoutGrid size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={`p-2.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50'}`}
                    title="Vista Grid"
                  >
                    <Grid3x3 size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={`p-2.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50'}`}
                    title="Vista Lista"
                  >
                    <List size={16} />
                  </button>
                </div>

                {selectedImages.size > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={downloadSelected}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white text-sm font-medium hover:from-green-600 hover:to-emerald-600 shadow-lg shadow-green-500/30 transition-all"
                    >
                      <Download size={14} /> Descargar ({selectedImages.size})
                    </button>
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="p-2.5 rounded-xl bg-white/90 border border-white/80 text-zinc-600 hover:bg-zinc-50 shadow-lg transition-all"
                      title="Limpiar selección"
                    >
                      <X size={16} />
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => { void loadImages() }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/90 border border-white/80 text-sm font-medium text-zinc-700 hover:bg-white hover:shadow-xl transition-all"
                >
                  <RefreshCw size={14} /> Recargar
                </button>
              </div>
            </div>

            {/* Search and Filters */}
            <div className="mt-5 flex gap-3 flex-wrap">
              <div className="flex-1 min-w-[250px] relative">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar por prompt o chat..."
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/90 border border-white/80 text-sm text-zinc-700 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 shadow-lg transition-all"
                />
              </div>

              {/* Date Filter */}
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-purple-400" />
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)}
                  className="px-4 py-3 rounded-xl bg-white/90 border border-white/80 text-sm font-medium text-zinc-700 focus:outline-none focus:ring-2 focus:ring-purple-500/50 shadow-lg transition-all cursor-pointer"
                >
                  <option value="all">Todas las fechas</option>
                  <option value="today">Hoy</option>
                  <option value="week">Última semana</option>
                  <option value="month">Último mes</option>
                </select>
              </div>

              {/* Sort By */}
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-purple-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="px-4 py-3 rounded-xl bg-white/90 border border-white/80 text-sm font-medium text-zinc-700 focus:outline-none focus:ring-2 focus:ring-purple-500/50 shadow-lg transition-all cursor-pointer"
                >
                  <option value="date">Por fecha</option>
                  <option value="chat">Por chat</option>
                </select>
              </div>
            </div>
          </div>
        </div>


        {/* Loading State */}
        {loading && (
          <div className="liquid-glass-card rounded-3xl p-20 flex flex-col items-center justify-center gap-4 text-zinc-500 shadow-xl">
            <div className="relative">
              <Loader2 size={48} className="animate-spin text-purple-500" />
              <div className="absolute inset-0 blur-xl bg-purple-500/30 animate-pulse" />
            </div>
            <span className="text-base font-semibold text-zinc-700">Cargando imágenes...</span>
          </div>
        )}

        {/* Empty State */}
        {!loading && filtered.length === 0 && (
          <div className="liquid-glass-card rounded-3xl p-20 text-center shadow-xl">
            <div className="relative w-24 h-24 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-100 via-pink-100 to-blue-100 flex items-center justify-center">
                <ImageIcon size={48} className="text-purple-400" />
              </div>
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 blur-2xl animate-pulse" />
            </div>
            <h3 className="text-xl font-bold text-zinc-800 mb-3">No hay imágenes</h3>
            <p className="text-sm text-zinc-500 max-w-md mx-auto leading-relaxed">
              {query || dateFilter !== 'all'
                ? 'No se encontraron imágenes con los filtros aplicados. Intenta ajustar tus criterios de búsqueda.'
                : 'Aún no has generado ninguna imagen. Usa el chat con la opción "Generar Imagen" activada para crear tu primera obra de arte.'}
            </p>
          </div>
        )}

        {/* Gallery */}
        {!loading && grouped.length > 0 && (
          <div className="space-y-10">
            {grouped.map(([dateKey, items]) => (
              <section key={dateKey}>
                {/* Date Separator */}
                <div className="mb-6 px-1 flex items-center gap-3">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-purple-200 to-transparent" />
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-100 to-pink-100 border border-purple-200/50 shadow-lg">
                    <Clock size={14} className="text-purple-600" />
                    <p className="text-sm font-bold tracking-wide text-purple-700 uppercase">
                      {dateKey}
                    </p>
                  </div>
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-purple-200 to-transparent" />
                </div>

                {/* Images Grid/Masonry/List */}
                <div className={
                  viewMode === 'masonry'
                    ? 'columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-5 space-y-5'
                    : viewMode === 'grid'
                    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5'
                    : 'flex flex-col gap-4'
                }>
                  {items.map((item) => {
                    const globalIndex = filtered.findIndex((entry) => entry.id === item.id)
                    const isSelected = selectedImages.has(item.id)
                    const isHovered = hoveredImage === item.id

                    return (
                      <article
                        key={item.id}
                        onMouseEnter={() => setHoveredImage(item.id)}
                        onMouseLeave={() => setHoveredImage(null)}
                        className={`group relative liquid-glass-card rounded-2xl overflow-hidden transition-all duration-300 ${
                          viewMode === 'masonry' ? 'break-inside-avoid' : ''
                        } ${
                          isSelected
                            ? 'ring-4 ring-purple-500 shadow-2xl shadow-purple-500/40'
                            : 'hover:shadow-2xl hover:shadow-purple-200/60'
                        }`}
                      >
                        {/* Selection Checkbox */}
                        <div className="absolute top-3 left-3 z-20">
                          <button
                            type="button"
                            onClick={() => toggleImageSelection(item.id)}
                            className={`w-7 h-7 rounded-lg border-2 transition-all ${
                              isSelected
                                ? 'bg-gradient-to-br from-purple-500 to-pink-500 border-white shadow-lg'
                                : 'bg-white/90 border-white/80 hover:bg-white hover:border-purple-300'
                            }`}
                          >
                            {isSelected && (
                              <Heart size={14} className="text-white fill-current mx-auto" />
                            )}
                          </button>
                        </div>

                        {/* Image */}
                        <div className="relative overflow-hidden">
                          <button
                            type="button"
                            onClick={() => openImagePreview(imageUrls, Math.max(globalIndex, 0), item.prompt || null)}
                            className="w-full text-left block"
                          >
                            <img
                              src={item.image_url}
                              alt={item.prompt || t.chatArea.generatedImage}
                              className={`w-full object-cover transition-all duration-500 ${
                                isHovered ? 'scale-110' : 'scale-100'
                              } ${viewMode === 'grid' ? 'h-72' : viewMode === 'list' ? 'h-48' : ''}`}
                            />
                          </button>

                          {/* Hover Overlay with Actions */}
                          <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent transition-opacity duration-300 ${
                            isHovered ? 'opacity-100' : 'opacity-0'
                          }`}>
                            <div className="absolute bottom-4 right-4 flex gap-2">
                              <button
                                type="button"
                                onClick={() => downloadImage(item.image_url, item.prompt)}
                                className="p-3 rounded-xl bg-white/95 backdrop-blur-sm text-zinc-700 hover:bg-white hover:scale-110 transition-all shadow-xl"
                                title="Descargar imagen"
                              >
                                <Download size={18} />
                              </button>
                              <button
                                type="button"
                                onClick={() => openImagePreview(imageUrls, Math.max(globalIndex, 0), item.prompt || null)}
                                className="p-3 rounded-xl bg-white/95 backdrop-blur-sm text-zinc-700 hover:bg-white hover:scale-110 transition-all shadow-xl"
                                title="Ver en grande"
                              >
                                <Eye size={18} />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Content */}
                        <div className="p-5 space-y-3">
                          <p className="text-sm font-semibold text-zinc-800 line-clamp-2 leading-relaxed">
                            {item.prompt || t.chatArea.generatedImage}
                          </p>

                          <div className="flex items-center gap-2 text-xs text-zinc-500">
                            <MessageSquare size={13} className="text-purple-400" />
                            <span className="truncate flex-1 font-medium">{item.conversation_title}</span>
                          </div>

                          <div className="flex items-center justify-between gap-3 pt-3 border-t border-zinc-100">
                            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                              <Clock size={11} />
                              <span>
                                {new Date(item.created_at).toLocaleDateString('es-ES', {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveConversation(item.conversation_id)
                                router.push(`/chat/${item.conversation_id}`)
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500 hover:scale-105 transition-all shadow-lg shadow-purple-500/30"
                            >
                              <Zap size={11} /> Ver chat
                            </button>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


