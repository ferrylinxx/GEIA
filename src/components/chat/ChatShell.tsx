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
import { PanelLeft } from 'lucide-react'

interface Props {
  userId: string
  children: React.ReactNode
}

export default function ChatShell({ userId, children }: Props) {
  const { sidebarOpen, focusMode, setSidebarOpen, loadConversations } = useChatStore()
  const { searchOpen, setSearchOpen, filePreviewOpen, memoryPanelOpen, settingsOpen, fileLibraryOpen, setFileLibraryOpen } = useUIStore()

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  // Global keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'k') {
      e.preventDefault()
      setSearchOpen(!searchOpen)
    }
    if (e.key === 'Escape') {
      setSearchOpen(false)
    }
  }, [searchOpen, setSearchOpen])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      {sidebarOpen && !focusMode && <Sidebar />}

      {/* Focus mode mini-sidebar trigger */}
      {focusMode && !sidebarOpen && (
        <div
          className="fixed left-0 top-0 bottom-0 w-2 z-50 hover:w-10 group transition-all"
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

      {/* Focus mode sidebar overlay */}
      {focusMode && sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
          <div className="fixed left-0 top-0 bottom-0 z-50">
            <Sidebar />
          </div>
        </>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>

      {/* Modals */}
      {searchOpen && <SearchModal />}
      {filePreviewOpen && <FilePreviewModal />}
      {memoryPanelOpen && <MemoryPanel userId={userId} />}
      {settingsOpen && <SettingsModal userId={userId} />}
      {fileLibraryOpen && <FileLibrary onClose={() => setFileLibraryOpen(false)} />}
    </div>
  )
}

