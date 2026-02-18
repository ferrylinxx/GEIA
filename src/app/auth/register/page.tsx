'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ShieldAlert, ArrowLeft } from 'lucide-react'

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-black isolate">
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
          <div className="
            relative rounded-3xl md:rounded-[2.75rem] overflow-hidden isolate
            bg-white/[0.052] backdrop-blur-3xl saturate-[1.92] brightness-[1.035] contrast-[1.07]
            border border-white/[0.035]
            shadow-[0_55px_130px_-45px_rgba(0,0,0,0.72),0_18px_55px_-18px_rgba(0,0,0,0.38),inset_0_4px_3px_rgba(0,0,0,0.18),inset_0_-4px_3px_rgba(0,0,0,0.18),inset_7px_7px_14px_rgba(0,0,0,0.22),inset_-7px_-7px_16px_rgba(0,0,0,0.22)]
          ">
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

            <div className="absolute inset-[-1.5px] pointer-events-none z-5 opacity-14 mix-blend-screen">
              <div className="absolute inset-0 bg-blue-300/7 blur-[1px] translate-x-[-0.7px] translate-y-[-0.7px]" />
              <div className="absolute inset-0 bg-red-300/7 blur-[1px] translate-x-[0.7px] translate-y-[0.7px]" />
            </div>

            <div className="p-8 md:p-10 relative z-40 text-center">
              <div className="relative mx-auto w-64 h-28 md:w-80 md:h-36 mb-6">
                <Image
                  src="https://tecnofgb.com/wp-content/uploads/2026/02/logo.png"
                  alt="GEIA Logo"
                  fill
                  className="object-contain"
                  priority
                />
              </div>

              {/* Icon */}
              <div className="flex justify-center mb-6">
                <div className="p-4 rounded-full bg-amber-500/10 border border-amber-400/30">
                  <ShieldAlert size={48} className="text-amber-400" />
                </div>
              </div>

              {/* Title */}
              <h1 className="
                text-2xl md:text-3xl font-semibold mb-4
                bg-clip-text text-transparent
                bg-gradient-to-br from-white/90 to-white/60
              ">
                Registro Deshabilitado
              </h1>

              {/* Message */}
              <div className="bg-amber-500/10 border border-amber-400/30 text-amber-200/90 rounded-2xl p-5 text-sm md:text-base backdrop-blur-xl shadow-inner mb-6">
                <p className="mb-3">
                  El registro público de usuarios está deshabilitado por seguridad.
                </p>
                <p className="text-amber-300/70">
                  Para obtener acceso, contacta con un administrador del sistema.
                </p>
              </div>

              {/* Back to login button */}
              <Link
                href="/auth/login"
                className="
                  inline-flex items-center gap-2 px-6 py-3 rounded-xl
                  bg-gradient-to-r from-blue-600/75 via-indigo-600/75 to-violet-600/75
                  hover:from-blue-500 hover:via-indigo-500 hover:to-violet-500
                  text-white font-medium text-sm md:text-base
                  shadow-[0_10px_35px_rgba(79,70,229,0.35)]
                  transition-all duration-400 ease-out
                  hover:scale-[1.02] hover:shadow-[0_18px_55px_rgba(79,70,229,0.45)]
                  backdrop-blur-md border border-white/6
                "
              >
                <ArrowLeft size={18} />
                Volver al Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }