'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Mail } from 'lucide-react'

export default function ResetPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
    })
    if (err) { setError(err.message); setLoading(false) }
    else { setSent(true); setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white text-zinc-900 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">GIA</h1>
          <p className="text-zinc-500 mt-2 text-sm">Recuperar contraseña</p>
        </div>
        {sent ? (
          <div className="bg-green-50 border border-green-200 text-green-600 text-sm rounded-lg p-4 text-center">
            Email enviado. Revisa tu bandeja de entrada.
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-3">{error}</div>}
            <div>
              <label htmlFor="email" className="block text-sm text-zinc-500 mb-1">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="tu@email.com" required autoFocus />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors text-white">
              <Mail size={16} /> {loading ? 'Enviando...' : 'Enviar enlace'}
            </button>
          </form>
        )}
        <p className="mt-6 text-center text-sm text-zinc-500">
          <Link href="/auth/login" className="text-blue-600 hover:underline">Volver al login</Link>
        </p>
      </div>
    </div>
  )
}

