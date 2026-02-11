'use client'

import { useChatStore } from '@/store/chat-store'
import { useUIStore } from '@/store/ui-store'
import { MODELS } from '@/lib/types'
import { PanelLeft, Search, Settings, BookOpen, Quote, User, Shield, Loader2 } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

interface DynamicModel {
  id: string
  name: string
  owned_by: string
}

export default function Header() {
  const { sidebarOpen, setSidebarOpen, selectedModel, setSelectedModel, focusMode, setFocusMode, ragMode, setRagMode, citeMode, setCiteMode } = useChatStore()
  const { setSearchOpen, setSettingsOpen } = useUIStore()
  const [modelOpen, setModelOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [dynamicModels, setDynamicModels] = useState<DynamicModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const modelRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Fetch dynamic models from API
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch('/api/models')
        if (res.ok) {
          const data = await res.json()
          if (data.models && data.models.length > 0) {
            setDynamicModels(data.models)
          }
        }
      } catch {
        // Fallback to static models on error
      } finally {
        setModelsLoading(false)
      }
    }
    fetchModels()
  }, [])

  // Fetch user avatar
  useEffect(() => {
    const fetchAvatar = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('avatar_url').eq('id', user.id).single()
      if (data?.avatar_url) setAvatarUrl(data.avatar_url)
    }
    fetchAvatar()
  }, [])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setModelOpen(false)
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  // Use dynamic models if available, else fallback to static
  const models = dynamicModels.length > 0
    ? dynamicModels.map(m => ({ id: m.id, name: m.name, provider: m.owned_by }))
    : MODELS.map(m => ({ id: m.id, name: m.name, provider: m.provider }))

  const currentModelName = models.find(m => m.id === selectedModel)?.name || selectedModel

  return (
    <header className="h-12 border-b border-zinc-200 flex items-center px-3 gap-2 shrink-0 bg-white">
      {!sidebarOpen && (
        <button onClick={() => setSidebarOpen(true)} className="p-1.5 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-600" aria-label="Abrir sidebar">
          <PanelLeft size={18} />
        </button>
      )}

      {/* Model selector */}
      <div className="relative" ref={modelRef}>
        <button onClick={() => setModelOpen(!modelOpen)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm hover:bg-zinc-100 rounded-lg transition-colors text-zinc-800">
          <Image src="/logo.png" alt="GIA" width={20} height={20} className="rounded-full" />
          {modelsLoading ? <Loader2 size={14} className="animate-spin text-zinc-400" /> : <span className="font-medium">{currentModelName}</span>}
          <svg className="w-3 h-3 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </button>
        {modelOpen && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-zinc-200 rounded-xl shadow-lg py-1 z-50 min-w-[260px] max-h-[400px] overflow-y-auto">
            {models.map(m => (
              <button key={m.id} onClick={() => { setSelectedModel(m.id); setModelOpen(false) }}
                className={`w-full text-left px-3 py-2.5 text-sm hover:bg-zinc-50 transition-colors flex items-center gap-2.5 ${m.id === selectedModel ? 'text-blue-600 bg-blue-50' : 'text-zinc-700'}`}>
                <Image src="/logo.png" alt="" width={18} height={18} className="rounded-full shrink-0" />
                <span>{m.name}</span>
                <span className="text-[10px] text-zinc-400 ml-auto">({m.provider})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* RAG mode selector */}
      <div className="flex items-center gap-1 ml-2">
        <button onClick={() => setRagMode(ragMode === 'off' ? 'assisted' : ragMode === 'assisted' ? 'strict' : 'off')}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${ragMode !== 'off' ? 'bg-emerald-50 text-emerald-600' : 'text-zinc-500 hover:bg-zinc-100'}`}
          title={`RAG: ${ragMode}`}>
          <BookOpen size={14} />
          <span>{ragMode === 'off' ? 'RAG' : ragMode === 'assisted' ? 'RAG+' : 'Solo KB'}</span>
        </button>
        {ragMode !== 'off' && (
          <button onClick={() => setCiteMode(!citeMode)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${citeMode ? 'bg-blue-50 text-blue-600' : 'text-zinc-500 hover:bg-zinc-100'}`}
            title="Citar fuentes">
            <Quote size={14} />
          </button>
        )}
      </div>

      <div className="flex-1" />

      {/* Actions */}
      <button onClick={() => setSearchOpen(true)} className="p-1.5 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-500" aria-label="Buscar (Ctrl+K)">
        <Search size={18} />
      </button>
      <button onClick={() => setFocusMode(!focusMode)} className={`p-1.5 rounded-lg transition-colors ${focusMode ? 'bg-blue-50 text-blue-600' : 'text-zinc-500 hover:bg-zinc-100'}`} aria-label="Modo foco">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" strokeDasharray="4 4" /></svg>
      </button>

      {/* User menu */}
      <div className="relative" ref={userRef}>
        <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="p-1 hover:bg-zinc-100 rounded-full transition-colors" aria-label="Menú usuario">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="w-7 h-7 rounded-full object-cover" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-zinc-200 flex items-center justify-center">
              <User size={16} className="text-zinc-500" />
            </div>
          )}
        </button>
        {userMenuOpen && (
          <div className="absolute top-full right-0 mt-1 bg-white border border-zinc-200 rounded-lg shadow-lg py-1 z-50 min-w-[160px]">
            <button onClick={() => { setSettingsOpen(true); setUserMenuOpen(false) }} className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 text-zinc-700 flex items-center gap-2">
              <Settings size={14} /> Ajustes
            </button>
            <button onClick={() => { router.push('/admin'); setUserMenuOpen(false) }} className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 text-zinc-700 flex items-center gap-2">
              <Shield size={14} /> Admin
            </button>
            <hr className="border-zinc-200 my-1" />
            <button onClick={handleLogout} className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 text-red-500">
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

