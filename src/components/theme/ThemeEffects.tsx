'use client'

import { useTheme } from '@/contexts/ThemeContext'
import { useEffect, useState } from 'react'

export function ThemeEffects() {
  const { currentTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || !currentTheme) return null

  const slug = currentTheme.slug
  const config = currentTheme.config_json

  return (
    <>
      {/* Halloween Effects */}
      {slug === 'halloween' && (
        <>
          {/* Floating Bats */}
          {config.elements?.bats && (
            <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="absolute text-4xl animate-float-bat"
                  style={{
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                    animationDelay: `${i * 2}s`,
                    animationDuration: `${8 + Math.random() * 4}s`,
                  }}
                >
                  🦇
                </div>
              ))}
            </div>
          )}

          {/* Pumpkins in corners */}
          {config.elements?.pumpkins && (
            <>
              <div className="fixed bottom-4 left-4 text-6xl animate-pulse-slow pointer-events-none z-40">
                🎃
              </div>
              <div className="fixed bottom-4 right-4 text-6xl animate-pulse-slow pointer-events-none z-40" style={{ animationDelay: '1s' }}>
                🎃
              </div>
            </>
          )}

          {/* Spiderwebs */}
          {config.elements?.spiderwebs && (
            <>
              <div className="fixed top-0 left-0 text-8xl opacity-30 pointer-events-none z-40">
                🕸️
              </div>
              <div className="fixed top-0 right-0 text-8xl opacity-30 pointer-events-none z-40 scale-x-[-1]">
                🕸️
              </div>
            </>
          )}

          {/* Floating Ghosts */}
          {config.elements?.ghosts && (
            <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="absolute text-5xl animate-float-ghost"
                  style={{
                    left: `${20 + i * 30}%`,
                    top: `${10 + i * 20}%`,
                    animationDelay: `${i * 3}s`,
                  }}
                >
                  👻
                </div>
              ))}
            </div>
          )}

          {/* Purple glow particles */}
          {config.effects?.particles && (
            <div className="fixed inset-0 pointer-events-none z-30 overflow-hidden">
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-2 h-2 bg-purple-500 rounded-full animate-particle"
                  style={{
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                    animationDelay: `${Math.random() * 5}s`,
                    animationDuration: `${3 + Math.random() * 2}s`,
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Christmas Effects */}
      {slug === 'navidad' && (
        <>
          {/* Snowfall */}
          {config.elements?.snowflakes && (
            <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
              {[...Array(50)].map((_, i) => (
                <div
                  key={i}
                  className="absolute text-white text-2xl animate-snowfall"
                  style={{
                    left: `${Math.random() * 100}%`,
                    animationDelay: `${Math.random() * 5}s`,
                    animationDuration: `${5 + Math.random() * 5}s`,
                    opacity: 0.6 + Math.random() * 0.4,
                  }}
                >
                  ❄️
                </div>
              ))}
            </div>
          )}

          {/* Christmas ornaments in corners */}
          {config.elements?.ornaments && (
            <>
              <div className="fixed top-4 left-4 text-5xl animate-swing pointer-events-none z-40">
                🎄
              </div>
              <div className="fixed top-4 right-4 text-5xl animate-swing pointer-events-none z-40" style={{ animationDelay: '0.5s' }}>
                🎄
              </div>
            </>
          )}

          {/* Twinkling stars */}
          {config.elements?.stars && (
            <div className="fixed inset-0 pointer-events-none z-30 overflow-hidden">
              {[...Array(15)].map((_, i) => (
                <div
                  key={i}
                  className="absolute text-yellow-400 text-3xl animate-twinkle"
                  style={{
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                    animationDelay: `${Math.random() * 3}s`,
                  }}
                >
                  ⭐
                </div>
              ))}
            </div>
          )}

          {/* Christmas lights string */}
          {config.elements?.lights && (
            <div className="fixed top-0 left-0 right-0 h-12 pointer-events-none z-40 flex justify-around items-center">
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className="w-3 h-3 rounded-full animate-blink"
                  style={{
                    backgroundColor: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'][i % 5],
                    animationDelay: `${i * 0.1}s`,
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}

