'use client'

import { useState } from 'react'
import { useChatStore } from '@/store/chat-store'
import { useUIStore } from '@/store/ui-store'
import ConversationItem from './ConversationItem'
import ProjectsPanel from '@/components/projects/ProjectsPanel'
import { Plus, Search, PanelLeftClose, FolderOpen } from 'lucide-react'

export default function Sidebar() {
  const {
    conversations, activeConversationId, createConversation,
    setActiveConversation, setSidebarOpen,
  } = useChatStore()
  const { setSearchOpen } = useUIStore()
  const [filter, setFilter] = useState('')
  const [showProjects, setShowProjects] = useState(false)

  const filtered = conversations.filter(c =>
    c.title.toLowerCase().includes(filter.toLowerCase())
  )

  const pinned = filtered.filter(c => c.pinned)
  const favorites = filtered.filter(c => c.favorite && !c.pinned)
  const rest = filtered.filter(c => !c.pinned && !c.favorite)

  // Group by date
  const today = new Date()
  const todayChats = rest.filter(c => {
    const d = new Date(c.created_at)
    return d.toDateString() === today.toDateString()
  })
  const olderChats = rest.filter(c => {
    const d = new Date(c.created_at)
    return d.toDateString() !== today.toDateString()
  })

  if (showProjects) {
    return (
      <aside className="w-64 bg-zinc-50 border-r border-zinc-200 flex flex-col h-full shrink-0">
        <ProjectsPanel onClose={() => setShowProjects(false)} />
      </aside>
    )
  }

  return (
    <aside className="w-64 bg-zinc-50 border-r border-zinc-200 flex flex-col h-full shrink-0">
      {/* Header */}
      <div className="p-3 flex items-center justify-between">
        <h1 className="text-base font-bold tracking-tight text-zinc-900">GIA</h1>
        <div className="flex items-center gap-1">
          <button onClick={() => createConversation()} className="p-1.5 hover:bg-zinc-200 rounded-lg transition-colors text-zinc-600" aria-label="Nuevo chat">
            <Plus size={18} />
          </button>
          <button onClick={() => setSidebarOpen(false)} className="p-1.5 hover:bg-zinc-200 rounded-lg transition-colors text-zinc-600" aria-label="Cerrar sidebar">
            <PanelLeftClose size={18} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <button onClick={() => setSearchOpen(true)}
          className="w-full flex items-center gap-2 px-3 py-2 bg-white border border-zinc-200 rounded-lg text-xs text-zinc-500 hover:bg-zinc-100 transition-colors">
          <Search size={14} /> Buscar chats... <kbd className="ml-auto text-[10px] bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-400">⌘K</kbd>
        </button>
      </div>

      {/* Filter */}
      <div className="px-3 pb-2">
        <input type="text" value={filter} onChange={e => setFilter(e.target.value)}
          placeholder="Filtrar..." className="w-full px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500" />
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {pinned.length > 0 && (
          <div>
            <p className="text-[10px] text-zinc-400 uppercase tracking-wider px-2 py-1">📌 Anclados</p>
            {pinned.map(c => <ConversationItem key={c.id} conversation={c} active={c.id === activeConversationId} />)}
          </div>
        )}

        {favorites.length > 0 && (
          <div>
            <p className="text-[10px] text-zinc-400 uppercase tracking-wider px-2 py-1">⭐ Favoritos</p>
            {favorites.map(c => <ConversationItem key={c.id} conversation={c} active={c.id === activeConversationId} />)}
          </div>
        )}

        {todayChats.length > 0 && (
          <div>
            <p className="text-[10px] text-zinc-400 uppercase tracking-wider px-2 py-1">Hoy</p>
            {todayChats.map(c => <ConversationItem key={c.id} conversation={c} active={c.id === activeConversationId} />)}
          </div>
        )}

        {olderChats.length > 0 && (
          <div>
            <p className="text-[10px] text-zinc-400 uppercase tracking-wider px-2 py-1">Anteriores</p>
            {olderChats.map(c => <ConversationItem key={c.id} conversation={c} active={c.id === activeConversationId} />)}
          </div>
        )}

        {filtered.length === 0 && (
          <p className="text-xs text-zinc-400 text-center py-8">Sin conversaciones</p>
        )}
      </div>

      {/* Projects link */}
      <div className="p-3 border-t border-zinc-200">
        <button onClick={() => setShowProjects(true)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-500 hover:bg-zinc-200 rounded-lg transition-colors">
          <FolderOpen size={14} /> Proyectos
        </button>
      </div>
    </aside>
  )
}

