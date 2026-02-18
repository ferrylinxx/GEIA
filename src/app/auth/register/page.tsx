'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ShieldAlert, ArrowLeft } from 'lucide-react'

export default function RegisterPage() {
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
        {/* Card principal con Liquid Glass */}
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

            {/* Icono de alerta */}
            <div className="flex justify-center mb-6">
              <div className="
                p-5 rounded-full 
                bg-amber-500/8 border border-amber-400/25 
                backdrop-blur-xl shadow-inner
              ">
                <ShieldAlert size={52} className="text-amber-400/90" />
              </div>
            </div>

            {/* Título */}
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
              Registro Deshabilitado
            </h1>

            {/* Bloque de mensaje ahora con Liquid Glass (naranja sutil) */}
            <div className="
              mt-6 p-6 rounded-2xl
              bg-amber-500/[0.07] backdrop-blur-3xl saturate-[1.6] brightness-[1.04]
              border border-amber-400/[0.15]
              shadow-[0_12px_40px_-10px_rgba(245,158,11,0.15),inset_0_2px_1px_rgba(255,255,255,0.08),inset_0_-2px_1px_rgba(0,0,0,0.15)]
              text-amber-100/90 text-sm md:text-base font-light
            ">
              <p className="mb-3 leading-relaxed">
                El registro público de usuarios está deshabilitado por seguridad.
              </p>
              <p className="text-amber-200/80">
                Para obtener acceso, contacta con un administrador del sistema.
              </p>
            </div>

            {/* Botón Volver al Login con Liquid Glass */}
            <Link
              href="/auth/login"
              className="
                inline-flex items-center gap-3 px-8 py-4 mt-8
                rounded-2xl
                bg-white/[0.06] backdrop-blur-3xl saturate-[1.8] brightness-[1.04]
                border border-white/[0.04]
                text-white font-medium text-base md:text-lg
                shadow-[0_12px_40px_-10px_rgba(0,0,0,0.5),inset_0_2px_1px_rgba(255,255,255,0.12),inset_0_-2px_1px_rgba(0,0,0,0.18)]
                transition-all duration-400 ease-out
                hover:scale-[1.015] hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)]
                hover:bg-white/[0.09]
              "
            >
              <ArrowLeft size={20} />
              Volver al Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}