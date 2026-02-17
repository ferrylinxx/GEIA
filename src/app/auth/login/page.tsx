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
        {/* Liquid Glass sin brillos */}
        <div className="
          relative rounded-[2.75rem] overflow-hidden isolate
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

          <div className="p-8 md:p-10 relative z-40">
            <div className="text-center mb-6">
              <div className="relative mx-auto w-64 h-28 md:w-80 md:h-36">
                <Image
                  src="https://tecnofgb.com/wp-content/uploads/2026/02/logo.png"
                  alt="GEIA Logo"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
              <p className="text-zinc-300/80 mt-2 text-base md:text-lg font-light tracking-wide">
                Inicia sesión para continuar
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
                <label className="block text-sm text-zinc-300/70 mb-2 font-medium tracking-wide">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="
                    w-full px-5 py-4 rounded-2xl
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
                <label className="block text-sm text-zinc-300/70 mb-2 font-medium tracking-wide">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="
                      w-full px-5 py-4 rounded-2xl pr-12
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
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400/65 hover:text-zinc-200 transition-colors duration-300"
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
                  w-full py-4 rounded-2xl mt-3
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

            <div className="mt-8 text-center text-sm md:text-base text-zinc-400/70 space-y-3">
              <p>
                ¿No tienes cuenta?{' '}
                <Link href="/auth/register" className="text-indigo-300/85 hover:text-indigo-200 font-medium transition-colors">
                  Regístrate
                </Link>
              </p>
              <p>
                <Link href="/auth/reset" className="text-indigo-300/85 hover:text-indigo-200 transition-colors">
                  ¿Olvidaste tu contraseña?
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}