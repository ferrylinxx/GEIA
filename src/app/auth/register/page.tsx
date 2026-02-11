'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { UserPlus, Eye, EyeOff } from 'lucide-react'

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    if (err) {
      setError(err.message)
      setLoading(false)
    } else {
      setSuccess(true)
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-zinc-900 px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-3xl font-bold tracking-tight mb-4">GIA</h1>
          <div className="bg-green-50 border border-green-200 text-green-600 text-sm rounded-lg p-4">
            ¡Cuenta creada! Revisa tu email para confirmar tu cuenta.
          </div>
          <Link href="/auth/login" className="text-blue-600 hover:underline mt-4 inline-block text-sm">Ir al login</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white text-zinc-900 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">GIA</h1>
          <p className="text-zinc-500 mt-2 text-sm">Crea tu cuenta</p>
        </div>
        <form onSubmit={handleRegister} className="space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-3">{error}</div>}
          <div>
            <label htmlFor="name" className="block text-sm text-zinc-500 mb-1">Nombre</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="Tu nombre" required autoFocus />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm text-zinc-500 mb-1">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="tu@email.com" required />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm text-zinc-500 mb-1">Contraseña</label>
            <div className="relative">
              <input id="password" type={showPass ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm pr-10"
                placeholder="Mínimo 6 caracteres" required minLength={6} />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700" aria-label="Mostrar contraseña">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors text-white">
            <UserPlus size={16} /> {loading ? 'Creando...' : 'Crear cuenta'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-zinc-500">
          ¿Ya tienes cuenta? <Link href="/auth/login" className="text-blue-600 hover:underline">Inicia sesión</Link>
        </p>
      </div>
    </div>
  )
}

