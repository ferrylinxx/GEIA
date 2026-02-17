'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useChatStore } from '@/store/chat-store'
import { useUIStore } from '@/store/ui-store'
import ConversationItem from './ConversationItem'
import ProjectsPanel from '@/components/projects/ProjectsPanel'
import type { Conversation } from '@/lib/types'
import { Plus, Search, PanelLeftClose, FolderOpen, ChevronsLeft, ChevronsRight, Archive, Radio, Images, ChevronDown, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import { useTranslation } from '@/i18n/LanguageContext'
import { createClient } from '@/lib/supabase/client'

export default function Sidebar() {
  const { t } = useTranslation()
  const {
    conversations,
    activeConversationId,
    setActiveConversation,
    createConversation,
    setProjectContextId,
    setSidebarOpen,
    showArchived,
    setShowArchived,
    loadConversations,
  } = useChatStore()
  const { setSearchOpen, sidebarWidth, setSidebarWidth } = useUIStore()
  const router = useRouter()
  const pathname = usePathname()

  const [filter, setFilter] = useState('')
  const [showProjects, setShowProjects] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [unreadTotal, setUnreadTotal] = useState(0)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  const sidebarRef = useRef<HTMLElement>(null)

  // Persist collapsible section state (so groups stay collapsed/expanded).
  useEffect(() => {
    try {
      const raw = localStorage.getItem('geia-sidebar-collapsed-groups-v1')
      if (!raw) return
      const parsed = JSON.parse(raw) as Record<string, boolean>
      if (parsed && typeof parsed === 'object') setCollapsedGroups(parsed)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('geia-sidebar-collapsed-groups-v1', JSON.stringify(collapsedGroups))
    } catch {
      // ignore
    }
  }, [collapsedGroups])

  const isImagesPage = pathname === '/imagenes' || pathname === '/images' || pathname === '/chat/images'
  const isChannelsPage = pathname === '/channels'

  const handleCreateConversation = useCallback(async () => {
    const closeSidebarOnMobile = () => {
      try {
        const mq = window.matchMedia('(min-width: 768px)')
        if (!mq.matches) setSidebarOpen(false)
      } catch {
        setSidebarOpen(false)
      }
    }

    const activeConv = activeConversationId
      ? conversations.find((c) => c.id === activeConversationId) || null
      : null

    // If the user is currently inside a project chat, create the new chat inside the same project.
    let projectId: string | null = activeConv?.project_id || null

    // If the conversations list hasn't loaded yet (or doesn't include this chat), fallback to a direct lookup.
    if (!projectId && activeConversationId) {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('conversations')
          .select('project_id')
          .eq('id', activeConversationId)
          .single()
        if (data?.project_id) projectId = data.project_id
      } catch {
        // ignore
      }
    }
    // Persist project context so the next "first message" creates the chat inside the project.
    setProjectContextId(projectId)

    setActiveConversation(null)
    router.push('/chat')
    closeSidebarOnMobile()
  }, [activeConversationId, conversations, router, setActiveConversation, setProjectContextId, setSidebarOpen])

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/channels/unread')
      if (!res.ok) return
      const data = await res.json()
      setUnreadTotal(data.total || 0)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    const first = window.setTimeout(() => { void fetchUnread() }, 0)
    const interval = window.setInterval(() => { void fetchUnread() }, 15000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(interval)
    }
  }, [fetchUnread])

  // Main sidebar must only show global chats (not project chats).
  const mainConversations = conversations.filter((conversation) => !conversation.project_id)

  const filtered = mainConversations.filter((conversation) =>
    conversation.title.toLowerCase().includes(filter.toLowerCase())
  )

  const pinned = filtered.filter((c) => c.pinned)
  const favorites = filtered.filter((c) => c.favorite && !c.pinned)
  const rest = filtered.filter((c) => !c.pinned && !c.favorite)

  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startYesterday = new Date(startToday)
  startYesterday.setDate(startYesterday.getDate() - 1)
  const startLast7Days = new Date(startToday)
  startLast7Days.setDate(startLast7Days.getDate() - 7)
  const startLast30Days = new Date(startToday)
  startLast30Days.setDate(startLast30Days.getDate() - 30)

  const todayChats = rest.filter((c) => new Date(c.updated_at) >= startToday)
  const yesterdayChats = rest.filter((c) => {
    const d = new Date(c.updated_at)
    return d >= startYesterday && d < startToday
  })
  const last7DaysChats = rest.filter((c) => {
    const d = new Date(c.updated_at)
    return d >= startLast7Days && d < startYesterday
  })
  const last30DaysChats = rest.filter((c) => {
    const d = new Date(c.updated_at)
    return d >= startLast30Days && d < startLast7Days
  })
  const olderChats = rest.filter((c) => new Date(c.updated_at) < startLast30Days)

  const collapseGroupsEnabled = filter.trim().length === 0
  const isGroupCollapsed = useCallback((id: string) => {
    return collapseGroupsEnabled && collapsedGroups[id] === true
  }, [collapseGroupsEnabled, collapsedGroups])

  const toggleGroup = useCallback((id: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    if (!isResizing) return
    const handleMouseMove = (e: MouseEvent) => {
      setSidebarWidth(e.clientX)
    }
    const handleMouseUp = () => setIsResizing(false)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, setSidebarWidth])

  const renderGroup = (groupId: string, label: string, items: Conversation[], opts?: { accentClass?: string }) => {
    if (items.length === 0) return null
    const collapsedNow = isGroupCollapsed(groupId)
    const accent = opts?.accentClass || 'text-zinc-500'

    return (
      <div>
        <button
          type="button"
          onClick={() => toggleGroup(groupId)}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/60 transition-colors"
          title={collapseGroupsEnabled ? 'Contraer/expandir' : 'Escribe en el filtro para ver resultados'}
        >
          {collapsedNow ? <ChevronRight size={14} className="text-zinc-400" /> : <ChevronDown size={14} className="text-zinc-400" />}
          <span className={`text-[10px] uppercase tracking-widest font-semibold ${accent}`}>{label}</span>
          <span className="ml-auto text-[10px] font-semibold text-zinc-400 tabular-nums">{items.length}</span>
        </button>
        {!collapsedNow && (
          <div className="space-y-1">
            {items.map((c) => <ConversationItem key={c.id} conversation={c} active={c.id === activeConversationId} />)}
          </div>
        )}
      </div>
    )
  }

  if (collapsed) {
    return (
      <aside className="w-12 liquid-glass-sidebar flex flex-col items-center py-3 gap-2 h-full shrink-0">
        <button onClick={() => setCollapsed(false)} className="p-1.5 hover:bg-zinc-200 rounded-lg transition-colors text-zinc-500" aria-label={t.sidebar.expandSidebar} title={t.sidebar.expandSidebar}>
          <ChevronsRight size={18} />
        </button>
        <button onClick={handleCreateConversation} className="p-1.5 hover:bg-zinc-200 rounded-lg transition-colors text-zinc-500" aria-label={t.sidebar.newChat} title={t.sidebar.newChat}>
          <Plus size={18} />
        </button>
        <button onClick={() => setSearchOpen(true)} className="p-1.5 hover:bg-zinc-200 rounded-lg transition-colors text-zinc-500" aria-label="Buscar" title="Buscar (Ctrl+K)">
          <Search size={18} />
        </button>
        <button onClick={() => router.push('/imagenes')} className={`p-1.5 rounded-lg transition-colors ${isImagesPage ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:bg-zinc-200'}`} aria-label={t.sidebar.imagesLabel} title={t.sidebar.imagesLabel}>
          <Images size={18} />
        </button>
        <button onClick={() => router.push('/channels')} className={`relative p-1.5 rounded-lg transition-colors ${isChannelsPage ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:bg-zinc-200'}`} aria-label={t.sidebar.channels} title={t.sidebar.channels}>
          <Radio size={18} />
          {unreadTotal > 0 && (
            <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-gradient-to-r from-red-500 to-pink-500 text-white text-[9px] font-bold shadow-sm shadow-red-200">
              {unreadTotal > 99 ? '99+' : unreadTotal}
            </span>
          )}
        </button>
        <div className="flex-1" />
        <button onClick={() => { setCollapsed(false); setShowProjects(true) }} className="p-1.5 hover:bg-zinc-200 rounded-lg transition-colors text-zinc-500" aria-label={t.sidebar.projects} title={t.sidebar.projects}>
          <FolderOpen size={18} />
        </button>
      </aside>
    )
  }

  if (showProjects) {
    return (
      <aside ref={sidebarRef} style={{ width: sidebarWidth }} className="liquid-glass-sidebar flex flex-col h-full shrink-0">
        <ProjectsPanel onClose={() => setShowProjects(false)} />
      </aside>
    )
  }

  return (
    <aside ref={sidebarRef} style={{ width: sidebarWidth }} className="liquid-glass-sidebar flex flex-col h-full shrink-0 relative pb-[env(safe-area-inset-bottom)] md:pb-0">
      <div className="p-3 flex items-center justify-between">
        <button onClick={() => { setProjectContextId(null); setActiveConversation(null); router.push('/chat') }} className="flex items-center gap-3 hover:opacity-80 transition-opacity" title="Ir a inicio">
          <Image src="/logo.png" alt="GIA" width={44} height={44} className="rounded-xl" />
          <span className="text-lg font-bold tracking-tight text-zinc-900">GIA</span>
        </button>
        <div className="flex items-center gap-1">
          <button onClick={handleCreateConversation} className="p-1.5 hover:bg-zinc-200 rounded-lg transition-colors text-zinc-600" aria-label={t.sidebar.newChat}>
            <Plus size={18} />
          </button>
          <button onClick={() => setCollapsed(true)} className="p-1.5 hover:bg-zinc-200 rounded-lg transition-colors text-zinc-600 hidden md:block" aria-label={t.sidebar.collapseSidebar} title={t.sidebar.collapseSidebar}>
            <ChevronsLeft size={18} />
          </button>
          <button onClick={() => setSidebarOpen(false)} className="p-1.5 hover:bg-zinc-200 rounded-lg transition-colors text-zinc-600 md:hidden" aria-label={t.sidebar.closeSidebar}>
            <PanelLeftClose size={18} />
          </button>
        </div>
      </div>

      {/* Mobile: compact quick actions */}
      <div className="px-3 pb-3 md:hidden">
        <div className="liquid-glass-card rounded-2xl p-2.5 border border-white/60 shadow-[0_14px_44px_rgba(15,23,42,0.10)]">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/75 border border-white/70 text-sm text-zinc-700 hover:bg-white transition-colors"
          >
            <Search size={14} className="text-zinc-500" />
            <span className="truncate">{t.sidebar.searchChats}</span>
          </button>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => router.push('/imagenes')}
              className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors border ${
                isImagesPage
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white/75 border-white/70 text-zinc-700 hover:bg-white'
              }`}
            >
              <Images size={16} /> {t.sidebar.imagesLabel}
            </button>
            <button
              type="button"
              onClick={() => router.push('/channels')}
              className={`relative inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors border ${
                isChannelsPage
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white/75 border-white/70 text-zinc-700 hover:bg-white'
              }`}
            >
              <Radio size={16} /> {t.sidebar.channels}
              {unreadTotal > 0 && (
                <span className={`absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold shadow-sm ${
                  isChannelsPage
                    ? 'bg-white text-blue-600 shadow-blue-100'
                    : 'bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-red-200'
                }`}>
                  {unreadTotal > 99 ? '99+' : unreadTotal}
                </span>
              )}
            </button>
          </div>

          <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-white/75 border border-white/70">
            <Search size={14} className="text-zinc-400" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t.sidebar.filter}
              className="flex-1 bg-transparent text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Desktop: keep original layout */}
      <div className="hidden md:block">
        <div className="px-3 pb-2">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-white border border-zinc-200 rounded-lg text-xs text-zinc-500 hover:bg-zinc-100 transition-colors"
          >
            <Search size={14} />
            {t.sidebar.searchChats}
            <kbd className="ml-auto text-[10px] bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-400">Ctrl+K</kbd>
          </button>
        </div>

        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={handleCreateConversation}
            className="w-full inline-flex items-center gap-2 px-3 py-2 text-xs rounded-lg transition-colors border bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-100"
          >
            <Plus size={14} /> {t.sidebar.newChat}
          </button>
        </div>

        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={() => router.push('/imagenes')}
            className={`w-full inline-flex items-center gap-2 px-3 py-2 text-xs rounded-lg transition-colors border ${
              isImagesPage
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <Images size={14} /> {t.sidebar.imagesLabel}
          </button>
        </div>

        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={() => router.push('/channels')}
            className={`w-full inline-flex items-center gap-2 px-3 py-2 text-xs rounded-lg transition-colors border ${
              isChannelsPage
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <Radio size={14} /> {t.sidebar.channels}
            {unreadTotal > 0 && (
              <span className={`ml-auto flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold shadow-sm ${
                isChannelsPage
                  ? 'bg-white/95 text-blue-600'
                  : 'bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-red-200'
              }`}>
                {unreadTotal > 99 ? '99+' : unreadTotal}
              </span>
            )}
          </button>
        </div>

        <div className="px-3 pb-2">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t.sidebar.filter}
            className="w-full px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 space-y-1.5">
        {showArchived ? (
          renderGroup('archived', t.sidebar.archived, filtered, { accentClass: 'text-orange-500' })
        ) : (
          <>
            {renderGroup('pinned', t.sidebar.pinned, pinned)}
            {renderGroup('favorites', t.sidebar.favorites, favorites)}
            {renderGroup('today', t.sidebar.today, todayChats)}
            {renderGroup('yesterday', t.sidebar.yesterday, yesterdayChats)}
            {renderGroup('last7', t.sidebar.last7Days, last7DaysChats)}
            {renderGroup('last30', t.sidebar.last30Days, last30DaysChats)}
            {renderGroup('older', t.sidebar.older, olderChats)}
          </>
        )}

        {filtered.length === 0 && (
          <p className="text-xs text-zinc-400 text-center py-8">{t.sidebar.noConversations}</p>
        )}
      </div>

      <div className="p-3 border-t border-zinc-200 space-y-1">
        <button
          onClick={() => {
            setShowArchived(!showArchived)
            setTimeout(() => loadConversations(), 50)
          }}
          className={`w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg transition-colors ${
            showArchived ? 'text-orange-600 bg-orange-50/50 hover:bg-orange-100/50' : 'text-zinc-500 hover:bg-zinc-200'
          }`}
        >
          <Archive size={14} /> {showArchived ? t.sidebar.backToChats : t.sidebar.archivedLabel}
        </button>

        <button onClick={() => setShowProjects(true)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-500 hover:bg-zinc-200 rounded-lg transition-colors">
          <FolderOpen size={14} /> {t.sidebar.projects}
        </button>
      </div>

      <div
        onMouseDown={handleMouseDown}
        className={`hidden md:block resize-handle absolute top-0 right-0 w-1 h-full transition-colors ${isResizing ? 'bg-blue-400/30' : ''}`}
      />
    </aside>
  )
}
