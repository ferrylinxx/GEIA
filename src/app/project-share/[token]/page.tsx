'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface ShareInfo {
  project?: { id: string; name: string; description?: string | null }
  role?: string
  requires_password?: boolean
  expires_at?: string | null
  error?: string
}

export default function ProjectSharePage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [info, setInfo] = useState<ShareInfo | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    void (async () => {
      const resolved = await params
      if (!mounted) return
      setToken(resolved.token || '')
      const res = await fetch(`/api/project-share?token=${encodeURIComponent(resolved.token || '')}`)
      const data = await res.json().catch(() => ({}))
      if (!mounted) return
      if (!res.ok) {
        setInfo({ error: data?.error || 'Enlace invalido' })
      } else {
        setInfo(data)
      }
      setLoading(false)
    })()
    return () => {
      mounted = false
    }
  }, [params])

  const acceptShare = async () => {
    if (!token) return
    setJoining(true)
    setError(null)
    const res = await fetch('/api/project-share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    const data = await res.json().catch(() => ({}))
    setJoining(false)
    if (!res.ok) {
      setError(data?.error || 'No se pudo unir al proyecto')
      return
    }
    router.push('/chat')
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-sm text-zinc-600">Cargando enlace...</div>
      </main>
    )
  }

  const hasError = Boolean(info?.error)
  return (
    <main className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_20%_20%,#dbeafe,transparent_55%),radial-gradient(circle_at_80%_0%,#f5d0fe,transparent_45%),#f8fafc] p-4">
      <div className="w-full max-w-xl liquid-glass-card rounded-3xl border border-white/60 bg-white/70 shadow-[0_30px_90px_rgba(15,23,42,0.18)] p-6">
        {hasError ? (
          <>
            <h1 className="text-xl font-semibold text-zinc-900">Enlace no disponible</h1>
            <p className="mt-2 text-sm text-zinc-600">{info?.error}</p>
          </>
        ) : (
          <>
            <p className="text-xs uppercase tracking-[0.15em] font-semibold text-blue-600">Compartir proyecto</p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-900">{info?.project?.name || 'Proyecto'}</h1>
            {info?.project?.description && (
              <p className="mt-2 text-sm text-zinc-600">{info.project.description}</p>
            )}
            <div className="mt-4 rounded-2xl border border-white/70 bg-white/65 px-4 py-3 text-sm text-zinc-700">
              Acceso al unirte: <span className="font-semibold">{info?.role || 'viewer'}</span>
            </div>

            {info?.requires_password && (
              <div className="mt-4">
                <label className="text-xs font-semibold text-zinc-600">Contrasena del enlace</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Introduce la contrasena"
                  className="mt-2 w-full px-3 py-2 rounded-xl border border-zinc-200 bg-white/80 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                />
              </div>
            )}

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                onClick={acceptShare}
                disabled={joining}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-60"
              >
                {joining ? 'Uniendo...' : 'Unirme al proyecto'}
              </button>
              <button
                type="button"
                onClick={() => router.push('/chat')}
                className="px-4 py-2 rounded-xl text-sm text-zinc-600 hover:bg-white/70"
              >
                Volver
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

