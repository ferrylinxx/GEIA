'use client'

import { useChatStore } from '@/store/chat-store'
import { useUIStore } from '@/store/ui-store'
import { MODELS } from '@/lib/types'
import { PanelLeft, Search, Settings, BookOpen, Quote, User, Shield, Loader2, Star, Volume2, VolumeX, Check, Crown, X, FolderOpen } from 'lucide-react'
import { useState, useRef, useEffect, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/i18n/LanguageContext'
import { useProjectContext } from '@/hooks/useProjectContext'
import { useActivity } from '@/contexts/ActivityContext'
import { type ActivityStatus } from '@/lib/activity'

const APP_VERSION = 'V2.5.0(Beta)'

interface DynamicModel {
  id: string
  name: string
  owned_by: string
  icon_url?: string | null
}

export default function Header() {
  const { t } = useTranslation()
  const { sidebarOpen, setSidebarOpen, selectedModel, setSelectedModel, focusMode, setFocusMode, ragMode, setRagMode, citeMode, setCiteMode } = useChatStore()
  const { setSearchOpen, setSettingsOpen, soundEnabled, setSoundEnabled } = useUIStore()
  const [modelOpen, setModelOpen] = useState(false)
  const [modelQuery, setModelQuery] = useState('')
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [dynamicModels, setDynamicModels] = useState<DynamicModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [activityStatus, setActivityStatus] = useState<ActivityStatus>('offline')
  const [defaultModel, setDefaultModel] = useState<string | null>(null)
  const modelRef = useRef<HTMLDivElement>(null)
  const modelSheetRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const { projectId: activeProjectId, projectName: activeProjectName } = useProjectContext()

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const [modelsRes, defaultRes] = await Promise.all([
          fetch('/api/models'),
          fetch('/api/user/default-model'),
        ])
        if (modelsRes.ok) {
          const data = await modelsRes.json()
          if (data.models && data.models.length > 0) setDynamicModels(data.models)
        }
        if (defaultRes.ok) {
          const data = await defaultRes.json()
          if (data.default_model) {
            setDefaultModel(data.default_model)
            setSelectedModel(data.default_model)
          }
        }
      } catch {
        // keep static fallback
      } finally {
        setModelsLoading(false)
      }
    }
    fetchModels()
  }, [setSelectedModel])

  useEffect(() => {
    const fetchProfile = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      setUserEmail(user.email || null)
      const { data } = await supabase.from('profiles').select('avatar_url, name, role').eq('id', user.id).single()
      if (data) {
        if (data.avatar_url) setAvatarUrl(data.avatar_url)
        setUserName(data.name || user.email?.split('@')[0] || null)
        setUserRole(typeof data.role === 'string' ? data.role.toLowerCase() : 'user')
      }
    }
    fetchProfile()
  }, [])



  // Use shared activity context instead of individual fetching
  const { getStatus } = useActivity()

  useEffect(() => {
    if (!userId) return
    const statusData = getStatus(userId)
    setActivityStatus(statusData.status)
  }, [userId, getStatus])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (modelSheetRef.current && modelSheetRef.current.contains(target)) return
      if (modelRef.current && !modelRef.current.contains(target)) setModelOpen(false)
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (modelOpen) setModelQuery('')
  }, [modelOpen])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const providerConfig: Record<string, { color: string; bg: string; border: string; label: string }> = {
    openai: { color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'OpenAI' },
    google: { color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', label: 'Google' },
    anthropic: { color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', label: 'Anthropic' },
    meta: { color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200', label: 'Meta' },
    mistral: { color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200', label: 'Mistral' },
  }

  const getProviderKey = (provider: string) => {
    const p = provider.toLowerCase()
    if (p.includes('openai') || p.includes('gpt')) return 'openai'
    if (p.includes('google') || p.includes('gemini')) return 'google'
    if (p.includes('anthropic') || p.includes('claude')) return 'anthropic'
    if (p.includes('meta') || p.includes('llama')) return 'meta'
    if (p.includes('mistral')) return 'mistral'
    return 'openai'
  }

  const models = dynamicModels.length > 0
    ? dynamicModels.map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.owned_by,
      icon_url: typeof m.icon_url === 'string' ? m.icon_url : '',
    }))
    : MODELS.map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      icon_url: '',
    }))

  const currentModel = models.find((m) => m.id === selectedModel)
  const currentModelName = currentModel?.name || selectedModel
  const currentModelIconUrl = currentModel?.icon_url && currentModel.icon_url.trim().length > 0
    ? currentModel.icon_url
    : '/logo.png'
  const currentProviderKey = currentModel ? getProviderKey(currentModel.provider) : 'openai'
  const currentProviderCfg = providerConfig[currentProviderKey] || providerConfig.openai
  const isAdminUser = (userRole || '').toLowerCase() === 'admin'

  const groupedModels: { provider: string; items: typeof models }[] = []
  let lastProvider = ''
  models.forEach((m) => {
    const pk = getProviderKey(m.provider)
    if (pk !== lastProvider) {
      groupedModels.push({ provider: pk, items: [] })
      lastProvider = pk
    }
    groupedModels[groupedModels.length - 1].items.push(m)
  })

  const normalizedModelQuery = modelQuery.trim().toLowerCase()
  const groupedModelsFiltered = normalizedModelQuery
    ? groupedModels
      .map((group) => {
        const cfg = providerConfig[group.provider] || providerConfig.openai
        const items = group.items.filter((m) => {
          const name = (m.name || '').toLowerCase()
          const provider = (m.provider || '').toLowerCase()
          const providerLabel = (cfg.label || '').toLowerCase()
          return name.includes(normalizedModelQuery) || provider.includes(normalizedModelQuery) || providerLabel.includes(normalizedModelQuery)
        })
        return { ...group, items }
      })
      .filter((group) => group.items.length > 0)
    : groupedModels

  const statusConfig: Record<ActivityStatus, { label: string; dotClass: string; waveRgb: string }> = {
    online: { label: t.header.activityOnline, dotClass: 'bg-emerald-500', waveRgb: '16 185 129' },
    typing: { label: 'Escribiendo', dotClass: 'bg-blue-500', waveRgb: '59 130 246' },
    read: { label: 'Leyendo', dotClass: 'bg-purple-500', waveRgb: '168 85 247' },
    offline: { label: t.header.activityOffline, dotClass: 'bg-zinc-400', waveRgb: '161 161 170' },
  }
  const activityCfg = statusConfig[activityStatus]

  return (
    <>
    <header className="h-11 md:h-12 flex items-center px-2 md:px-3 gap-1.5 md:gap-2 shrink-0 liquid-glass-header z-10">
      {!sidebarOpen && (
        <button onClick={() => setSidebarOpen(true)} className="p-1.5 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-600" aria-label={t.header.openSidebar}>
          <PanelLeft size={18} />
        </button>
      )}

      <div className="relative" ref={modelRef}>
        <button onClick={() => setModelOpen(!modelOpen)} className="flex items-center gap-2 px-2.5 md:px-3.5 py-1.5 md:py-2 text-sm md:text-base hover:bg-white/30 rounded-xl transition-all duration-200 text-zinc-800">
          <span className="relative w-5 h-5 shrink-0">
            <span className={`absolute inset-[5px] rounded-full ${currentProviderCfg.bg.replace('bg-', 'bg-')} ${currentProviderCfg.color.replace('text-', 'bg-').replace('600', '400')}`} />
            <img
              src={currentModelIconUrl}
              alt={currentModelName}
              className="absolute inset-0 w-full h-full rounded-md object-cover border border-zinc-200/70"
              onError={(event) => {
                event.currentTarget.src = '/logo.png'
              }}
            />
          </span>
          {modelsLoading ? <Loader2 size={16} className="animate-spin text-zinc-400" /> : <span className="font-semibold tracking-tight text-[14px] md:text-[15px] truncate max-w-[140px] sm:max-w-[220px] md:max-w-none">{currentModelName}</span>}
          <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </button>
        {modelOpen && (
          <div className="hidden md:block dropdown-animated absolute top-full left-0 mt-1.5 liquid-glass-dropdown menu-solid-panel py-2 z-50 w-[calc(100vw-24px)] max-w-[420px] md:w-auto md:min-w-[360px] max-h-[480px] overflow-y-auto rounded-2xl">
            {groupedModels.map((group, gi) => {
              const cfg = providerConfig[group.provider] || providerConfig.openai
              return (
                <div key={group.provider}>
                  {gi > 0 && <hr className="border-white/30 my-1.5 mx-3" />}
                  <div className="px-4 py-2">
                    <span className={`text-[11px] font-bold uppercase tracking-widest ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  {group.items.map((m) => {
                    const isSelected = m.id === selectedModel
                    const mCfg = providerConfig[getProviderKey(m.provider)] || providerConfig.openai
                    return (
                      <div key={m.id} className={`flex items-center gap-3 px-4 py-2.5 mx-1.5 rounded-xl transition-all duration-200 ${isSelected ? 'bg-white/40' : 'hover:bg-white/25'}`}>
                        <button onClick={() => { setSelectedModel(m.id); setModelOpen(false) }}
                          className={`flex-1 text-left text-[15px] flex items-center gap-3 ${isSelected ? mCfg.color : 'text-zinc-700'}`}>
                          <span className="relative w-5 h-5 shrink-0">
                            <span className={`absolute inset-[5px] rounded-full ${mCfg.color.replace('text-', 'bg-').replace('600', '400')}`} />
                            <img
                              src={m.icon_url || '/logo.png'}
                              alt={m.name}
                              className="absolute inset-0 w-full h-full rounded-md object-cover border border-zinc-200/70"
                              onError={(event) => {
                                event.currentTarget.src = '/logo.png'
                              }}
                            />
                          </span>
                          <span className="font-medium">{m.name}</span>
                          {isSelected && <Check size={16} className={`ml-auto checkmark-animated ${mCfg.color}`} />}
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            const newDefault = defaultModel === m.id ? null : m.id
                            setDefaultModel(newDefault)
                            await fetch('/api/user/default-model', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: newDefault }) })
                          }}
                          className={`p-1.5 rounded-lg transition-colors ${defaultModel === m.id ? 'text-yellow-500' : 'text-zinc-300 hover:text-yellow-400'}`}
                          title={defaultModel === m.id ? t.header.removeDefault : t.header.setDefault}
                        >
                          <Star size={15} fill={defaultModel === m.id ? 'currentColor' : 'none'} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 ml-1 md:ml-2">
        <button onClick={() => setRagMode(ragMode === 'off' ? 'assisted' : ragMode === 'assisted' ? 'strict' : 'off')}
          className={`flex items-center gap-1 px-1.5 md:px-2 py-1 text-xs rounded-md transition-colors ${ragMode !== 'off' ? 'bg-emerald-50 text-emerald-600' : 'text-zinc-500 hover:bg-zinc-100'}`}
          title={`RAG: ${ragMode}`}>
          <BookOpen size={14} />
          <span className="hidden sm:inline">{ragMode === 'off' ? t.header.ragOff : ragMode === 'assisted' ? t.header.ragAssisted : t.header.ragStrict}</span>
        </button>
        {ragMode !== 'off' && (
          <button onClick={() => setCiteMode(!citeMode)}
            className={`flex items-center gap-1 px-1.5 md:px-2 py-1 text-xs rounded-md transition-colors ${citeMode ? 'bg-blue-50 text-blue-600' : 'text-zinc-500 hover:bg-zinc-100'}`}
            title={t.header.citeSources}>
            <Quote size={14} />
          </button>
        )}
      </div>

      {activeProjectId && (
        <div className="flex items-center gap-1.5 px-2 md:px-2.5 py-1 rounded-full border border-cyan-200/80 bg-cyan-50/90 text-cyan-700 shadow-sm max-w-[150px] sm:max-w-[240px] md:max-w-[320px]">
          <FolderOpen size={12} className="shrink-0" />
          <span className="text-[10px] sm:text-[11px] md:text-xs font-semibold truncate">
            {activeProjectName ? `${t.header.projectIn}: ${activeProjectName}` : t.header.projectActive}
          </span>
        </div>
      )}

      <div className="flex-1" />

      <span className="inline-flex items-center px-2 md:px-2.5 py-0.5 md:py-1 rounded-full border border-indigo-200/70 bg-indigo-50/80 text-[10px] sm:text-[11px] md:text-xs font-bold tracking-wide text-indigo-600 shadow-sm">
        {APP_VERSION}
      </span>
      <button onClick={() => setSearchOpen(true)} className="p-2 md:p-1.5 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-500" aria-label={t.header.search}>
        <Search size={18} />
      </button>
      <button onClick={() => setFocusMode(!focusMode)} className={`hidden md:inline-flex p-1.5 rounded-lg transition-colors ${focusMode ? 'bg-blue-50 text-blue-600' : 'text-zinc-500 hover:bg-zinc-100'}`} aria-label={t.header.focusMode}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" strokeDasharray="4 4" /></svg>
      </button>
      <button onClick={() => setSoundEnabled(!soundEnabled)} className={`p-2 md:p-1.5 rounded-lg transition-colors ${soundEnabled ? 'text-blue-500 hover:bg-blue-50' : 'text-zinc-400 hover:bg-zinc-100'}`}
        aria-label={soundEnabled ? t.header.disableSound : t.header.enableSound} title={soundEnabled ? t.header.soundOn : t.header.soundOff}>
        {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
      </button>

      <div className="relative" ref={userRef}>
        <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="relative p-1.5 md:p-1 hover:bg-zinc-100 rounded-full transition-colors" aria-label={t.header.userMenu}>
          <div className={`relative ${isAdminUser ? 'admin-crown-wrap' : ''}`}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className={`w-7 h-7 rounded-full object-cover ${isAdminUser ? 'admin-crown-ring' : ''}`} />
            ) : (
              <div className={`w-7 h-7 rounded-full bg-zinc-200 flex items-center justify-center ${isAdminUser ? 'admin-crown-ring' : ''}`}>
                <User size={16} className="text-zinc-500" />
              </div>
            )}
            {isAdminUser && (
              <span className="admin-crown-badge" aria-hidden="true">
                <Crown size={8} strokeWidth={2.2} />
              </span>
            )}
          </div>
          <span
            className={`status-wave-dot absolute right-0.5 bottom-0.5 w-2.5 h-2.5 rounded-full border border-white ${activityCfg.dotClass}`}
            style={{ '--status-rgb': activityCfg.waveRgb } as CSSProperties}
          />
        </button>
        {userMenuOpen && (
          <div className="dropdown-animated absolute top-full right-0 mt-1.5 liquid-glass-dropdown menu-solid-panel rounded-2xl py-2 z-50 min-w-[200px]">
            <div className="px-3 py-2 border-b border-zinc-100">
              <p className="text-sm font-semibold text-zinc-800 truncate tracking-tight">{userName || t.header.userFallback}</p>
              {userEmail && <p className="text-[11px] text-zinc-400 truncate">{userEmail}</p>}
              <div className="mt-1 flex items-center gap-1.5 text-[10px] text-zinc-500">
                <span className={`w-2 h-2 rounded-full ${activityCfg.dotClass}`} />
                <span>{activityCfg.label}</span>
              </div>
              {isAdminUser && <span className="inline-block mt-1 px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded text-[10px] font-medium">{t.header.adminBadge}</span>}
            </div>
            <button onClick={() => { setSettingsOpen(true); setUserMenuOpen(false) }} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50/50 text-zinc-700 flex items-center gap-2 transition-colors">
              <Settings size={14} className="text-blue-500" /> {t.header.settings}
            </button>
            {isAdminUser && (
              <button onClick={() => { router.push('/admin'); setUserMenuOpen(false) }} className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50/50 text-zinc-700 flex items-center gap-2 transition-colors">
                <Shield size={14} className="text-purple-500" /> {t.header.adminPanel}
              </button>
            )}
            <hr className="border-zinc-100 my-1" />
            <button onClick={handleLogout} className="w-full text-left px-3 py-2 text-sm hover:bg-red-50/50 text-red-500 transition-colors">
              {t.header.logout}
            </button>
          </div>
        )}
      </div>
    </header>

    {/* Mobile: model selector bottom sheet */}
    {modelOpen && (
      <div className="md:hidden pointer-events-auto">
        <div
          className="fixed inset-0 z-[140] bg-black/35 backdrop-blur-[2px]"
          onClick={() => setModelOpen(false)}
          aria-hidden="true"
        />
        <div
          ref={modelSheetRef}
          className="fixed left-0 right-0 bottom-0 z-[150] px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]"
          style={{ animation: 'message-in 0.18s ease-out' }}
        >
          <div className="liquid-glass-dropdown menu-solid-panel rounded-3xl p-2 shadow-[0_20px_60px_rgba(15,23,42,0.25)] border border-white/70">
            <div className="flex items-center justify-between px-2.5 py-2">
              <p className="text-[11px] font-bold text-zinc-600 tracking-tight">{t.header.models}</p>
              <button
                type="button"
                onClick={() => setModelOpen(false)}
                className="p-2 rounded-xl text-zinc-500 hover:bg-white/60"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-2.5 pb-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/75 border border-white/70">
                <Search size={14} className="text-zinc-400" />
                <input
                  value={modelQuery}
                  onChange={(e) => setModelQuery(e.target.value)}
                  placeholder={t.header.searchModels}
                  className="flex-1 bg-transparent text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="max-h-[62vh] overflow-y-auto px-1 pb-1">
              {groupedModelsFiltered.length === 0 && (
                <p className="px-3 py-6 text-sm text-zinc-500 text-center">{t.header.noModelsFound}</p>
              )}

              {groupedModelsFiltered.map((group, gi) => {
                const cfg = providerConfig[group.provider] || providerConfig.openai
                return (
                  <div key={group.provider}>
                    {gi > 0 && <hr className="border-white/40 my-2 mx-3" />}
                    <div className="px-3 pt-2 pb-1 flex items-center justify-between">
                      <span className={`text-[11px] font-bold uppercase tracking-widest ${cfg.color}`}>{cfg.label}</span>
                      <span className="text-[11px] text-zinc-400 tabular-nums">{group.items.length}</span>
                    </div>

                    {group.items.map((m) => {
                      const isSelected = m.id === selectedModel
                      const mCfg = providerConfig[getProviderKey(m.provider)] || providerConfig.openai
                      return (
                        <div
                          key={m.id}
                          className={`flex items-center gap-3 px-3 py-3 mx-1.5 rounded-2xl transition-colors ${
                            isSelected ? 'bg-white/60' : 'hover:bg-white/50'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => { setSelectedModel(m.id); setModelOpen(false) }}
                            className={`flex-1 text-left text-[15px] flex items-center gap-3 ${
                              isSelected ? mCfg.color : 'text-zinc-800'
                            }`}
                          >
                            <span className="relative w-5 h-5 shrink-0">
                              <span className={`absolute inset-[5px] rounded-full ${mCfg.color.replace('text-', 'bg-').replace('600', '400')}`} />
                              <img
                                src={m.icon_url || '/logo.png'}
                                alt={m.name}
                                className="absolute inset-0 w-full h-full rounded-md object-cover border border-zinc-200/70"
                                onError={(event) => {
                                  event.currentTarget.src = '/logo.png'
                                }}
                              />
                            </span>
                            <span className="font-semibold truncate">{m.name}</span>
                            {isSelected && <Check size={18} className={`ml-auto checkmark-animated ${mCfg.color}`} />}
                          </button>

                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation()
                              const newDefault = defaultModel === m.id ? null : m.id
                              setDefaultModel(newDefault)
                              await fetch('/api/user/default-model', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: newDefault }) })
                            }}
                            className={`p-2 rounded-xl transition-colors ${
                              defaultModel === m.id ? 'text-yellow-500 bg-white/50' : 'text-zinc-300 hover:text-yellow-400 hover:bg-white/50'
                            }`}
                            title={defaultModel === m.id ? t.header.removeDefault : t.header.setDefault}
                          >
                            <Star size={18} fill={defaultModel === m.id ? 'currentColor' : 'none'} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
