'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogIn, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError(err.message)
      setLoading(false)
    } else {
      router.push('/chat')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white text-zinc-900 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">GIA</h1>
          <p className="text-zinc-500 mt-2 text-sm">Inicia sesión para continuar</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-3">{error}</div>}
          <div>
            <label htmlFor="email" className="block text-sm text-zinc-500 mb-1">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="tu@email.com" required autoFocus />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm text-zinc-500 mb-1">Contraseña</label>
            <div className="relative">
              <input id="password" type={showPass ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm pr-10"
                placeholder="••••••••" required />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700" aria-label="Mostrar contraseña">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors text-white">
            <LogIn size={16} /> {loading ? 'Entrando...' : 'Iniciar sesión'}
          </button>
        </form>
        <div className="mt-6 text-center text-sm text-zinc-500 space-y-2">
          <p>¿No tienes cuenta? <Link href="/auth/register" className="text-blue-600 hover:underline">Regístrate</Link></p>
          <p><Link href="/auth/reset" className="text-blue-600 hover:underline">¿Olvidaste tu contraseña?</Link></p>
        </div>
      </div>
    </div>
  )
}

