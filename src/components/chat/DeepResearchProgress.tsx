'use client'

import { useEffect, useState } from 'react'
import { useChatStore } from '@/store/chat-store'
import { FlaskConical, Search, Brain, BarChart3, Image as ImageIcon, CheckCircle2 } from 'lucide-react'

type Phase = 'warmup' | 'planning' | 'followup' | 'ranking' | 'images' | 'complete'

interface ProgressState {
  phase: Phase
  message: string
  progress: number
}

export default function DeepResearchProgress() {
  const { isStreaming, streamingContent, researchMode } = useChatStore()
  const [progressState, setProgressState] = useState<ProgressState>({
    phase: 'warmup',
    message: 'Iniciando búsqueda inicial...',
    progress: 0
  })

  useEffect(() => {
    if (!isStreaming) {
      // Reset when streaming stops
      setProgressState({
        phase: 'warmup',
        message: 'Iniciando búsqueda inicial...',
        progress: 0
      })
      return
    }

    // Simulate progress based on time and research mode
    const isExhaustive = researchMode === 'exhaustive'
    const phases: Array<{ phase: Phase; message: string; duration: number; progress: number }> = [
      { phase: 'warmup', message: `Buscando ${isExhaustive ? '14' : '10'} fuentes iniciales...`, duration: 3000, progress: 15 },
      { phase: 'planning', message: 'Analizando y generando sub-preguntas...', duration: 4000, progress: 35 },
      { phase: 'followup', message: `Ejecutando ${isExhaustive ? '7' : '4'} búsquedas paralelas...`, duration: 6000, progress: 60 },
      { phase: 'ranking', message: `Rankeando ${isExhaustive ? '24' : '16'} fuentes finales...`, duration: 3000, progress: 80 },
      { phase: 'images', message: 'Extrayendo imágenes relevantes...', duration: 2000, progress: 95 },
    ]

    let currentPhaseIndex = 0
    let phaseStartTime = Date.now()

    const interval = setInterval(() => {
      if (currentPhaseIndex >= phases.length) {
        clearInterval(interval)
        return
      }

      const currentPhase = phases[currentPhaseIndex]
      const elapsed = Date.now() - phaseStartTime

      if (elapsed >= currentPhase.duration) {
        // Move to next phase
        currentPhaseIndex++
        phaseStartTime = Date.now()
        if (currentPhaseIndex < phases.length) {
          setProgressState({
            phase: phases[currentPhaseIndex].phase,
            message: phases[currentPhaseIndex].message,
            progress: phases[currentPhaseIndex].progress
          })
        }
      } else {
        // Smooth progress within current phase
        const phaseProgress = elapsed / currentPhase.duration
        const prevProgress = currentPhaseIndex > 0 ? phases[currentPhaseIndex - 1].progress : 0
        const currentProgress = prevProgress + (currentPhase.progress - prevProgress) * phaseProgress

        setProgressState({
          phase: currentPhase.phase,
          message: currentPhase.message,
          progress: Math.round(currentProgress)
        })
      }

      // If we have streaming content, we're likely done with research
      if (streamingContent && streamingContent.length > 50) {
        setProgressState({
          phase: 'complete',
          message: '¡Investigación completada!',
          progress: 100
        })
        clearInterval(interval)
      }
    }, 200)

    return () => clearInterval(interval)
  }, [isStreaming, streamingContent, researchMode])

  if (!isStreaming || progressState.progress >= 100) return null

  const getPhaseIcon = () => {
    switch (progressState.phase) {
      case 'warmup':
        return <Search className="animate-pulse" size={16} />
      case 'planning':
        return <Brain className="animate-pulse" size={16} />
      case 'followup':
        return <Search className="animate-spin" size={16} />
      case 'ranking':
        return <BarChart3 className="animate-pulse" size={16} />
      case 'images':
        return <ImageIcon className="animate-pulse" size={16} />
      case 'complete':
        return <CheckCircle2 size={16} />
      default:
        return <FlaskConical className="animate-pulse" size={16} />
    }
  }

  const getPhaseColor = () => {
    switch (progressState.phase) {
      case 'warmup':
        return 'text-blue-600'
      case 'planning':
        return 'text-purple-600'
      case 'followup':
        return 'text-amber-600'
      case 'ranking':
        return 'text-green-600'
      case 'images':
        return 'text-pink-600'
      case 'complete':
        return 'text-emerald-600'
      default:
        return 'text-amber-600'
    }
  }

  return (
    <div className="mb-4 p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl shadow-sm animate-in fade-in duration-300">
      <div className="flex items-center gap-3 mb-3">
        <div className={`${getPhaseColor()}`}>
          {getPhaseIcon()}
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-amber-900">
            🔬 Investigación Profunda {researchMode === 'exhaustive' ? '(Modo Exhaustivo)' : '(Modo Rápido)'}
          </div>
          <div className="text-xs text-amber-700 mt-0.5">
            {progressState.message}
          </div>
        </div>
        <div className="text-xs font-bold text-amber-600">
          {progressState.progress}%
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-amber-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-300 ease-out"
          style={{ width: `${progressState.progress}%` }}
        />
      </div>
    </div>
  )
}

