'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  X,
  Info,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  BellRing,
  ExternalLink,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface ActiveBanner {
  id: string
  title: string
  message: string
  type: 'info' | 'warning' | 'error' | 'success'
  display_mode: 'banner' | 'popup' | 'both'
  priority: number
  dismissible: boolean
  show_once: boolean
  cta_label: string | null
  cta_url: string | null
  image_url: string | null
  accent_color: string | null
}

const DISMISSED_KEY = 'geia-dismissed-banners-v2'
const VIEWED_POPUPS_KEY = 'geia-viewed-popup-banners-v1'

const DEFAULT_ACCENT: Record<ActiveBanner['type'], string> = {
  info: '#3b82f6',
  warning: '#f59e0b',
  error: '#ef4444',
  success: '#10b981',
}

function readStoredIds(key: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function pushStoredId(key: string, id: string): string[] {
  const current = readStoredIds(key)
  if (current.includes(id)) return current
  const next = [...current, id]
  localStorage.setItem(key, JSON.stringify(next))
  return next
}

function bannerMeta(type: ActiveBanner['type']) {
  if (type === 'warning') {
    return {
      icon: <AlertTriangle size={16} />,
      chip: 'Aviso',
      text: 'text-amber-900',
      subText: 'text-amber-800/85',
      iconClass: 'text-amber-600 bg-amber-100/70',
      bgGradient: 'from-amber-100/92 via-yellow-50/94 to-white/95',
      glow: 'rgba(245,158,11,0.26)',
    }
  }
  if (type === 'error') {
    return {
      icon: <AlertCircle size={16} />,
      chip: 'Importante',
      text: 'text-rose-900',
      subText: 'text-rose-800/85',
      iconClass: 'text-rose-600 bg-rose-100/70',
      bgGradient: 'from-rose-100/92 via-red-50/94 to-white/95',
      glow: 'rgba(239,68,68,0.22)',
    }
  }
  if (type === 'success') {
    return {
      icon: <CheckCircle size={16} />,
      chip: 'Novedad',
      text: 'text-emerald-900',
      subText: 'text-emerald-800/85',
      iconClass: 'text-emerald-600 bg-emerald-100/70',
      bgGradient: 'from-emerald-100/92 via-green-50/94 to-white/95',
      glow: 'rgba(16,185,129,0.2)',
    }
  }

  return {
    icon: <Info size={16} />,
    chip: 'Informacion',
    text: 'text-blue-900',
    subText: 'text-blue-800/85',
    iconClass: 'text-blue-600 bg-blue-100/70',
    bgGradient: 'from-blue-100/92 via-indigo-50/94 to-white/95',
    glow: 'rgba(59,130,246,0.22)',
  }
}

export default function BannerDisplay() {
  const [banners, setBanners] = useState<ActiveBanner[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [dismissed, setDismissed] = useState<string[]>(() => readStoredIds(DISMISSED_KEY))
  const [seenPopups, setSeenPopups] = useState<string[]>(() => readStoredIds(VIEWED_POPUPS_KEY))
  const [sessionClosedPopups, setSessionClosedPopups] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/banners')
      .then((response) => (response.ok ? response.json() : []))
      .then((data: ActiveBanner[]) => setBanners(Array.isArray(data) ? data : []))
      .catch(() => {})

    const loadRole = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()
        setIsAdmin((profile?.role || '').toLowerCase() === 'admin')
      } catch {
        setIsAdmin(false)
      }
    }

    void loadRole()
  }, [])

  const visibleInline = useMemo(() => {
    return banners.filter((banner) => {
      if (dismissed.includes(banner.id)) return false
      return banner.display_mode === 'banner' || banner.display_mode === 'both'
    }).slice(0, 3)
  }, [banners, dismissed])

  const activePopup = useMemo(() => {
    const candidate = banners.find((banner) => {
      if (dismissed.includes(banner.id)) return false
      const isPopup = banner.display_mode === 'popup' || banner.display_mode === 'both'
      if (!isPopup) return false
      if (banner.show_once && seenPopups.includes(banner.id)) return false
      if (sessionClosedPopups.includes(banner.id)) return false
      return true
    })
    return candidate || null
  }, [banners, dismissed, seenPopups, sessionClosedPopups])

  const dismissBanner = (id: string) => {
    const next = pushStoredId(DISMISSED_KEY, id)
    setDismissed(next)
  }

  const markPopupSeen = (id: string) => {
    const next = pushStoredId(VIEWED_POPUPS_KEY, id)
    setSeenPopups(next)
  }

  const closePopup = (banner: ActiveBanner, persistDismiss: boolean) => {
    if (persistDismiss && banner.dismissible) {
      dismissBanner(banner.id)
    }
    if (banner.show_once) {
      markPopupSeen(banner.id)
    } else {
      setSessionClosedPopups((prev) => (prev.includes(banner.id) ? prev : [...prev, banner.id]))
    }
  }

  const openPopupCta = (banner: ActiveBanner) => {
    if (banner.cta_url) {
      window.open(banner.cta_url, '_blank', 'noopener,noreferrer')
    }
    closePopup(banner, false)
  }

  if (visibleInline.length === 0 && !activePopup) return null

  return (
    <>
      {visibleInline.length > 0 && (
        <div className="w-full px-4 pt-2 pb-1 space-y-2">
          {visibleInline.map((banner, index) => {
            const meta = bannerMeta(banner.type)
            const accent = banner.accent_color || DEFAULT_ACCENT[banner.type]
            return (
              <section
                key={banner.id}
                className={`relative overflow-hidden rounded-2xl border border-white/75 bg-gradient-to-r ${meta.bgGradient} backdrop-blur-md liquid-glass-card`}
                style={{
                  animation: `message-in 0.3s ease-out ${index * 0.06}s both`,
                  boxShadow: `0 12px 34px ${meta.glow}`,
                }}
              >
                <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: accent }} />
                <div className="absolute -top-14 -right-10 h-40 w-40 rounded-full blur-3xl opacity-25" style={{ background: accent }} />
                <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.52),transparent_54%)]" />
                <div className="relative px-4 py-3 pl-5 flex items-start gap-3">
                  <div className={`shrink-0 h-8 w-8 rounded-lg flex items-center justify-center ${meta.iconClass}`}>
                    {meta.icon}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full bg-white/75 border border-white/80 font-semibold ${meta.subText}`}>
                        {meta.chip}
                      </span>
                      {isAdmin && banner.priority > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/5 text-zinc-600">
                          Prioridad {banner.priority}
                        </span>
                      )}
                    </div>
                    <p className={`text-[13px] font-semibold mt-1 ${meta.text}`}>{banner.title}</p>
                    {banner.message && (
                      <p className={`text-xs leading-relaxed mt-0.5 ${meta.subText}`}>{banner.message}</p>
                    )}
                  </div>

                  {banner.image_url && (
                    <div className="hidden sm:block shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-white/80 shadow-sm bg-white/70">
                      <img src={banner.image_url} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}

                  <div className="flex items-center gap-1 shrink-0">
                    {banner.cta_url && banner.cta_label && (
                      <button
                        type="button"
                        onClick={() => window.open(banner.cta_url!, '_blank', 'noopener,noreferrer')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-white shadow-sm hover:opacity-95"
                        style={{ background: accent }}
                      >
                        {banner.cta_label} <ExternalLink size={11} />
                      </button>
                    )}
                    {banner.dismissible && (
                      <button
                        type="button"
                        onClick={() => dismissBanner(banner.id)}
                        className="p-1.5 rounded-lg hover:bg-black/5 text-zinc-400 hover:text-zinc-600"
                        aria-label="Cerrar aviso"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      )}

      {activePopup && (
        <div
          className="fixed inset-0 z-[140] bg-slate-900/45 backdrop-blur-[3px] flex items-center justify-center px-4"
          onClick={() => {
            if (!activePopup.dismissible) return
            closePopup(activePopup, true)
          }}
        >
          <article
            className="w-full max-w-xl rounded-[28px] overflow-hidden border border-white/75 bg-white/92 backdrop-blur-2xl shadow-[0_36px_88px_rgba(15,23,42,0.36)] liquid-glass-dropdown"
            onClick={(event) => event.stopPropagation()}
            style={{
              animation: 'message-in 0.24s ease-out',
              '--popup-accent': activePopup.accent_color || DEFAULT_ACCENT[activePopup.type],
            } as CSSProperties}
          >
            <div className="relative px-6 py-5 bg-gradient-to-br from-white via-white to-slate-50 border-b border-white/70">
              <div
                className="absolute inset-x-0 top-0 h-1"
                style={{ background: 'var(--popup-accent)' }}
              />
              <div className="absolute -top-16 -right-8 h-44 w-44 rounded-full blur-3xl opacity-25" style={{ background: 'var(--popup-accent)' }} />
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                  <BellRing size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 font-semibold">Comunicado global</p>
                  <h3 className="text-xl font-semibold text-zinc-900 leading-tight mt-1">{activePopup.title}</h3>
                </div>
                {activePopup.dismissible && (
                  <button
                    type="button"
                    onClick={() => closePopup(activePopup, true)}
                    className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600"
                    aria-label="Cerrar popup"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>

            {activePopup.image_url && (
              <div className="px-6 pt-5">
                <img
                  src={activePopup.image_url}
                  alt=""
                  className="w-full max-h-56 object-cover rounded-2xl border border-zinc-200/70"
                />
              </div>
            )}

            <div className="px-6 py-5">
              {activePopup.message && (
                <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">
                  {activePopup.message}
                </p>
              )}

              {isAdmin && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                    Modo {activePopup.display_mode}
                  </span>
                  <span className="text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                    Prioridad {activePopup.priority || 0}
                  </span>
                  <span className="text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                    {activePopup.show_once ? 'Mostrar una vez' : 'Repetible'}
                  </span>
                </div>
              )}
            </div>

            <div className="px-6 pb-6 pt-1 flex items-center justify-end gap-2">
              {activePopup.dismissible && (
                <button
                  type="button"
                  onClick={() => closePopup(activePopup, true)}
                  className="px-3.5 py-2 rounded-xl border border-zinc-200 text-zinc-600 text-sm hover:bg-zinc-50"
                >
                  Cerrar
                </button>
              )}

              {activePopup.cta_url && activePopup.cta_label ? (
                <button
                  type="button"
                  onClick={() => openPopupCta(activePopup)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-white shadow-sm hover:opacity-95"
                  style={{ background: 'var(--popup-accent)' }}
                >
                  {activePopup.cta_label}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => closePopup(activePopup, false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-white shadow-sm hover:opacity-95"
                  style={{ background: 'var(--popup-accent)' }}
                >
                  Entendido
                </button>
              )}
            </div>
          </article>
        </div>
      )}
    </>
  )
}
