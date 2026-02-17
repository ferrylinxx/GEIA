'use client'

import { useEffect, useCallback } from 'react'
import { useChatStore } from '@/store/chat-store'
import { useUIStore } from '@/store/ui-store'
import Sidebar from '@/components/sidebar/Sidebar'
import Header from '@/components/chat/Header'
import SearchModal from '@/components/search/SearchModal'
import FilePreviewModal from '@/components/files/FilePreviewModal'
import FileLibrary from '@/components/files/FileLibrary'
import MemoryPanel from '@/components/memory/MemoryPanel'
import SettingsModal from '@/components/settings/SettingsModal'
import ToastContainer from '@/components/ui/ToastContainer'
import BannerDisplay from '@/components/ui/BannerDisplay'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import UserActivityTracker from '@/components/activity/UserActivityTracker'
import { PanelLeft, Images, Radio, Settings, MessageSquareText } from 'lucide-react'
import { LanguageProvider } from '@/i18n/LanguageContext'
import { useRouter } from 'next/navigation'

interface Props {
  userId: string
  children: React.ReactNode
}

export default function ChatShell({ userId, children }: Props) {
  const { sidebarOpen, focusMode, setSidebarOpen, loadConversations, projectContextId } = useChatStore()
  const { searchOpen, setSearchOpen, filePreviewOpen, memoryPanelOpen, settingsOpen, setSettingsOpen, fileLibraryOpen, setFileLibraryOpen } = useUIStore()
  const router = useRouter()

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  // Desktop-first: open sidebar by default on md+ screens; keep it closed on mobile.
  useEffect(() => {
    try {
      const mq = window.matchMedia('(min-width: 768px)')
      if (mq.matches) setSidebarOpen(true)
    } catch {
      // ignore
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Global keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'k') {
      e.preventDefault()
      setSearchOpen(!searchOpen)
    }
    if (e.key === 'Escape') {
      setSearchOpen(false)
      setSidebarOpen(false)
    }
  }, [searchOpen, setSearchOpen, setSidebarOpen])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <LanguageProvider>
    <UserActivityTracker />
    <div className="flex h-[100dvh] overflow-hidden relative bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-50/40">
      {/* Global animated orbs — behind sidebar + header + content */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 hidden md:block">
        <div className="absolute top-[-18%] left-[-12%] w-[750px] h-[750px] rounded-full bg-gradient-to-br from-blue-400/50 to-cyan-300/40 blur-[90px]" style={{ animation: 'welcome-blob-1 12s ease-in-out infinite' }} />
        <div className="absolute top-[5%] right-[-18%] w-[700px] h-[700px] rounded-full bg-gradient-to-br from-violet-400/45 to-fuchsia-300/35 blur-[90px]" style={{ animation: 'welcome-blob-2 15s ease-in-out infinite' }} />
        <div className="absolute bottom-[-12%] left-[12%] w-[680px] h-[680px] rounded-full bg-gradient-to-br from-indigo-400/40 to-purple-300/35 blur-[85px]" style={{ animation: 'welcome-blob-3 13s ease-in-out infinite' }} />
        <div className="absolute bottom-[10%] right-[5%] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-pink-300/40 to-rose-300/30 blur-[80px]" style={{ animation: 'welcome-blob-4 16s ease-in-out infinite' }} />
        <div className="absolute top-[28%] left-[28%] w-[550px] h-[550px] rounded-full bg-gradient-to-br from-teal-300/35 to-emerald-200/30 blur-[85px]" style={{ animation: 'welcome-blob-5 14s ease-in-out infinite' }} />
      </div>

      {/* Sidebar — inline on desktop, overlay on mobile/focus (#2) */}
      {sidebarOpen && !focusMode && (
        <div className="hidden md:block">
          <Sidebar />
        </div>
      )}

      {/* Overlay sidebar (mobile) */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-[1px] md:hidden" onClick={() => setSidebarOpen(false)}
               style={{ animation: 'fade-in 0.15s ease-out' }} />
          <div className="fixed left-0 top-0 bottom-0 z-50 md:hidden sidebar-mobile-sheet"
               style={{ animation: 'message-in 0.2s ease-out' }}>
            <Sidebar />
          </div>
        </>
      )}

      {/* Overlay sidebar (desktop focus mode) */}
      {focusMode && sidebarOpen && (
        <>
          <div className="hidden md:block fixed inset-0 bg-black/40 z-40 backdrop-blur-[2px]" onClick={() => setSidebarOpen(false)}
               style={{ animation: 'fade-in 0.15s ease-out' }} />
          <div className="hidden md:block fixed left-0 top-0 bottom-0 z-50"
               style={{ animation: 'message-in 0.2s ease-out' }}>
            <Sidebar />
          </div>
        </>
      )}

      {/* Focus mode mini-sidebar trigger (desktop only) */}
      {focusMode && !sidebarOpen && (
        <div
          className="hidden md:block fixed left-0 top-0 bottom-0 w-2 z-50 hover:w-10 group transition-all"
          onMouseEnter={() => setSidebarOpen(true)}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute top-4 left-2 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-200 p-1.5 rounded-lg text-zinc-600"
            aria-label="Abrir sidebar"
          >
            <PanelLeft size={18} />
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <BannerDisplay />
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation (does not affect desktop) */}
      <nav className={`md:hidden fixed left-0 right-0 bottom-0 z-20 px-3 pb-[env(safe-area-inset-bottom)] transition-opacity ${sidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}>
        <div className="liquid-glass-dropdown menu-solid-panel rounded-2xl border border-white/60 shadow-[0_18px_50px_rgba(15,23,42,0.18)] px-2 py-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => { setSidebarOpen(true); router.push('/chat') }}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-1 rounded-xl hover:bg-white/60 text-zinc-700"
            aria-label="Chats"
          >
            <MessageSquareText size={18} />
            <span className="text-[10px] font-semibold">Chats</span>
          </button>
          <button
            type="button"
            onClick={() => { setSidebarOpen(false); router.push('/imagenes') }}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-1 rounded-xl hover:bg-white/60 text-zinc-700"
            aria-label="Imatges"
          >
            <Images size={18} />
            <span className="text-[10px] font-semibold">Imatges</span>
          </button>
          <button
            type="button"
            onClick={() => { setSidebarOpen(false); router.push('/channels') }}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-1 rounded-xl hover:bg-white/60 text-zinc-700"
            aria-label="Canales"
          >
            <Radio size={18} />
            <span className="text-[10px] font-semibold">Canales</span>
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-1 rounded-xl hover:bg-white/60 text-zinc-700"
            aria-label="Ajustes"
          >
            <Settings size={18} />
            <span className="text-[10px] font-semibold">Ajustes</span>
          </button>
        </div>
      </nav>

      {/* Modals */}
      {searchOpen && <SearchModal />}
      {filePreviewOpen && <FilePreviewModal />}
      {memoryPanelOpen && <MemoryPanel userId={userId} />}
      {settingsOpen && <SettingsModal userId={userId} />}
      {fileLibraryOpen && <FileLibrary onClose={() => setFileLibraryOpen(false)} projectId={projectContextId} />}

      {/* Global UI */}
      <ToastContainer />
      <ConfirmDialog />
    </div>
    </LanguageProvider>
  )
}
