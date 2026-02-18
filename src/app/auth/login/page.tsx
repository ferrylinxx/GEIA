'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
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
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-black isolate">
      {/* Fondo inmersivo */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <video
          autoPlay
          muted
          loop
          playsInline
          className="w-full h-full object-cover opacity-92 scale-[1.015]"
          src="https://tecnofgb.com/wp-content/uploads/2026/02/hero-bg.mp4"
        />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Card de login */}
        <div className="
          relative rounded-3xl md:rounded-[2.75rem] overflow-hidden isolate
          bg-white/[0.052] backdrop-blur-3xl saturate-[1.92] brightness-[1.035] contrast-[1.07]
          border border-white/[0.035]
          shadow-[0_55px_130px_-45px_rgba(0,0,0,0.72),0_18px_55px_-18px_rgba(0,0,0,0.38),inset_0_4px_3px_rgba(0,0,0,0.18),inset_0_-4px_3px_rgba(0,0,0,0.18),inset_7px_7px_14px_rgba(0,0,0,0.22),inset_-7px_-7px_16px_rgba(0,0,0,0.22)]
        ">
          {/* Refracción sutil */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 opacity-28">
            <filter id="liquid-refract-clean">
              <feTurbulence type="fractalNoise" baseFrequency="0.009" numOctaves="4" seed="3" result="turbulence" />
              <feDisplacementMap in="SourceGraphic" in2="turbulence" scale="3.8" xChannelSelector="R" yChannelSelector="G" />
              <feGaussianBlur stdDeviation="0.7" result="blurred" />
              <feComponentTransfer>
                <feFuncA type="linear" slope="1.08" />
              </feComponentTransfer>
            </filter>
            <rect width="100%" height="100%" filter="url(#liquid-refract-clean)" opacity="0.16" />
          </svg>

          {/* Chromatic aberration ligera */}
          <div className="absolute inset-[-1.5px] pointer-events-none z-5 opacity-14 mix-blend-screen">
            <div className="absolute inset-0 bg-blue-300/7 blur-[1px] translate-x-[-0.7px] translate-y-[-0.7px]" />
            <div className="absolute inset-0 bg-red-300/7 blur-[1px] translate-x-[0.7px] translate-y-[0.7px]" />
          </div>

          {/* Badge pequeña arriba a la derecha: V3.0.0 */}
          <div className="
            absolute top-4 right-4 z-50
            rounded-2xl px-4 py-2
            bg-white/[0.06] backdrop-blur-3xl
            border border-white/[0.04]
            shadow-[0_8px_20px_-10px_rgba(0,0,0,0.5),inset_0_2px_1px_rgba(255,255,255,0.1),inset_0_-2px_1px_rgba(0,0,0,0.15)]
          ">
            <span className="text-white/80 text-xs md:text-sm font-medium tracking-wide">
              V3.0.0
            </span>
          </div>

          <div className="p-8 md:p-10 relative z-40">
            <div className="text-center mb-6">
              <div className="relative mx-auto w-64 h-28 md:w-80 md:h-36 mb-3">
                <Image
                  src="https://tecnofgb.com/wp-content/uploads/2026/02/logo.png"
                  alt="GEIA Logo"
                  fill
                  className="object-contain"
                  priority
                />
              </div>

              {/* Texto con efecto Liquid Glass + pequeño 3D */}
              <h1 className="
                text-3xl md:text-4xl font-semibold
                bg-clip-text text-transparent
                bg-gradient-to-br from-white/45 to-white/10
                text-shadow: 
                  0 1px 1px rgba(0,0,0,0.3),
                  0 2px 2px rgba(0,0,0,0.25),
                  0 3px 3px rgba(0,0,0,0.2),
                  0 4px 4px rgba(0,0,0,0.15),
                  0 5px 8px rgba(0,0,0,0.1)
              ">
                Inicia Sesión en GIA
              </h1>

              <p className="text-zinc-400 mt-1 text-sm md:text-base font-light">
                Ingresa tus credenciales para continuar
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              {error && (
                <div className="
                  bg-red-500/9 border border-red-400/25 text-red-200/85 rounded-2xl p-4 text-sm
                  backdrop-blur-xl
                ">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm text-zinc-300/70 mb-2 font-medium tracking-wide">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="
                    w-full px-6 py-4.5 rounded-2xl
                    bg-white/[0.04] border border-white/[0.06]
                    text-white placeholder-zinc-400/60 text-base
                    focus:outline-none focus:border-white/16 focus:ring-2 focus:ring-indigo-400/16 focus:bg-white/[0.055]
                    transition-all duration-300 ease-out
                    backdrop-blur-xl shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15),inset_-2px_-2px_5px_rgba(0,0,0,0.15)]
                  "
                  placeholder="tu@email.com"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm text-zinc-300/70 mb-2 font-medium tracking-wide">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="
                      w-full px-6 py-4.5 rounded-2xl pr-14
                      bg-white/[0.04] border border-white/[0.06]
                      text-white placeholder-zinc-400/60 text-base
                      focus:outline-none focus:border-white/16 focus:ring-2 focus:ring-indigo-400/16 focus:bg-white/[0.055]
                      transition-all duration-300 ease-out
                      backdrop-blur-xl shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15),inset_-2px_-2px_5px_rgba(0,0,0,0.15)]
                    "
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-400/65 hover:text-zinc-200 transition-colors duration-300"
                    aria-label={showPass ? "Ocultar" : "Mostrar"}
                  >
                    {showPass ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="
                  w-full py-4.5 rounded-2xl mt-3
                  bg-gradient-to-r from-blue-600/75 via-indigo-600/75 to-violet-600/75
                  hover:from-blue-500 hover:via-indigo-500 hover:to-violet-500
                  disabled:opacity-45 disabled:cursor-not-allowed
                  text-white font-semibold text-base md:text-lg tracking-wide
                  flex items-center justify-center gap-3
                  shadow-[0_10px_35px_rgba(79,70,229,0.35)]
                  transition-all duration-400 ease-out
                  hover:scale-[1.012] hover:shadow-[0_18px_55px_rgba(79,70,229,0.45)]
                  backdrop-blur-md border border-white/6
                "
              >
                <LogIn size={20} strokeWidth={2.2} />
                {loading ? 'Entrando...' : 'Iniciar sesión'}
              </button>
            </form>

            <p className="mt-8 text-center text-sm md:text-base text-zinc-400/70">
              ¿No tienes cuenta?{' '}
              <Link href="/auth/register" className="text-indigo-300/85 hover:text-indigo-200 font-medium transition-colors">
                Regístrate
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}