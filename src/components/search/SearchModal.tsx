'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useUIStore } from '@/store/ui-store'
import { useChatStore } from '@/store/chat-store'
import { createClient } from '@/lib/supabase/client'
import { Search, X, MessageSquare, Star, Pin, Paperclip, Calendar } from 'lucide-react'

interface SearchResult {
  conversation_id: string
  title: string
  message_id: string
  message_content: string
  message_role: string
  created_at: string
}

export default function SearchModal() {
  const { setSearchOpen } = useUIStore()
  const { setActiveConversation } = useChatStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ favorites: false, pinned: false, hasFiles: false })
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const doSearch = useCallback(async () => {
    if (!query.trim()) { setResults([]); return }
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.rpc('search_conversations', {
      p_user_id: user.id,
      p_query: query.trim(),
      p_limit: 20,
    })
    if (data) setResults(data)
    setLoading(false)
  }, [query])

  useEffect(() => {
    const timer = setTimeout(doSearch, 300)
    return () => clearTimeout(timer)
  }, [doSearch])

  const handleSelect = (convId: string) => {
    setActiveConversation(convId)
    setSearchOpen(false)
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center pt-[15vh]" onClick={() => setSearchOpen(false)}>
      <div className="w-full max-w-2xl bg-white border border-zinc-200 rounded-xl shadow-xl" onClick={e => e.stopPropagation()}>
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200">
          <Search size={18} className="text-zinc-400" />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar en chats y mensajes..."
            className="flex-1 bg-transparent text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none" />
          <kbd className="text-[10px] text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded">ESC</kbd>
          <button onClick={() => setSearchOpen(false)} className="text-zinc-400 hover:text-zinc-700"><X size={16} /></button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 px-4 py-2 border-b border-zinc-200">
          <button onClick={() => setFilters(f => ({ ...f, favorites: !f.favorites }))}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md ${filters.favorites ? 'bg-yellow-50 text-yellow-600' : 'text-zinc-500 hover:bg-zinc-100'}`}>
            <Star size={12} /> Favoritos
          </button>
          <button onClick={() => setFilters(f => ({ ...f, pinned: !f.pinned }))}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md ${filters.pinned ? 'bg-blue-50 text-blue-600' : 'text-zinc-500 hover:bg-zinc-100'}`}>
            <Pin size={12} /> Anclados
          </button>
          <button onClick={() => setFilters(f => ({ ...f, hasFiles: !f.hasFiles }))}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md ${filters.hasFiles ? 'bg-purple-50 text-purple-600' : 'text-zinc-500 hover:bg-zinc-100'}`}>
            <Paperclip size={12} /> Con archivos
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {loading && <div className="text-center py-8 text-sm text-zinc-400">Buscando...</div>}
          {!loading && results.length === 0 && query && (
            <div className="text-center py-8 text-sm text-zinc-400">Sin resultados</div>
          )}
          {!loading && !query && (
            <div className="text-center py-8 text-sm text-zinc-400">Escribe para buscar</div>
          )}
          {results.map((r, i) => (
            <button key={i} onClick={() => handleSelect(r.conversation_id)}
              className="w-full text-left px-4 py-3 hover:bg-zinc-50 transition-colors border-b border-zinc-100">
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare size={12} className="text-zinc-400" />
                <span className="text-sm font-medium text-zinc-700 truncate">{r.title}</span>
                <span className="text-[10px] text-zinc-400 ml-auto flex items-center gap-1">
                  <Calendar size={10} /> {new Date(r.created_at).toLocaleDateString('es-ES')}
                </span>
              </div>
              <p className="text-xs text-zinc-500 line-clamp-2 pl-5">{r.message_content}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

