'use client'

import { useState, useEffect } from 'react'
import { Loader2, Trophy, Play, RefreshCw, Calendar, TrendingUp } from 'lucide-react'

export default function FCBAgentPage() {
  const [agentId, setAgentId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const createAgent = async () => {
    setCreating(true)
    setError(null)

    try {
      const res = await fetch('/api/create-fcb-agent', {
        method: 'POST',
      })

      const data = await res.json()

      if (res.ok) {
        setAgentId(data.agent.id)
        if (!data.already_exists) {
          alert('✅ Agente FC Barcelona creado exitosamente!')
        }
      } else {
        setError(data.error || 'Error al crear agente')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red')
    } finally {
      setCreating(false)
    }
  }

  const executeAgent = async () => {
    if (!agentId) {
      alert('Primero debes crear el agente')
      return
    }

    setExecuting(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/agents/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId }),
      })

      const data = await res.json()

      if (res.ok) {
        setResult(data.result)
      } else {
        setError(data.error || 'Error al ejecutar agente')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red')
    } finally {
      setExecuting(false)
    }
  }

  useEffect(() => {
    // Auto-create agent on mount
    createAgent()
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-red-900 to-blue-800 p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-24 h-24 bg-gradient-to-br from-blue-600 to-red-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-2xl">
            <Trophy className="text-white" size={48} />
          </div>
          <h1 className="text-5xl font-bold text-white mb-3 drop-shadow-lg">
            FC Barcelona
          </h1>
          <p className="text-blue-200 text-lg">
            Agente IA para resultados y noticias del Barça
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white/95 backdrop-blur rounded-3xl shadow-2xl p-8 border border-white/20">
          {/* Action Buttons */}
          <div className="flex gap-4 mb-8">
            <button
              onClick={createAgent}
              disabled={creating || !!agentId}
              className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg hover:shadow-xl"
            >
              {creating ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Creando Agente...
                </>
              ) : agentId ? (
                <>
                  <Trophy size={20} />
                  Agente Creado
                </>
              ) : (
                <>
                  <Trophy size={20} />
                  Crear Agente
                </>
              )}
            </button>

            <button
              onClick={executeAgent}
              disabled={!agentId || executing}
              className="flex-1 px-6 py-4 bg-gradient-to-r from-blue-600 to-red-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg hover:shadow-xl"
            >
              {executing ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Buscando Resultados...
                </>
              ) : (
                <>
                  <Play size={20} />
                  Obtener Resultados
                </>
              )}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-zinc-800 flex items-center gap-2">
                  <TrendingUp className="text-blue-600" size={28} />
                  Resultados del FC Barcelona
                </h2>
                <button
                  onClick={executeAgent}
                  className="px-4 py-2 bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200 transition-colors flex items-center gap-2"
                >
                  <RefreshCw size={16} />
                  Actualizar
                </button>
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-red-50 border border-blue-200 rounded-2xl p-6">
                <pre className="whitespace-pre-wrap text-sm text-zinc-800 font-sans leading-relaxed">
                  {result}
                </pre>
              </div>
            </div>
          )}

          {/* Instructions */}
          {!result && !executing && (
            <div className="text-center py-12">
              <Calendar className="mx-auto text-zinc-300 mb-4" size={64} />
              <h3 className="text-xl font-semibold text-zinc-700 mb-2">
                Obtén los últimos resultados del Barça
              </h3>
              <p className="text-zinc-500 mb-6">
                Haz clic en "Obtener Resultados" para buscar información actualizada
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-xs text-blue-600 font-semibold">Último Partido</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <p className="text-xs text-red-600 font-semibold">Próximo Partido</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-4">
                  <p className="text-xs text-yellow-600 font-semibold">Clasificación</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-xs text-green-600 font-semibold">Noticias</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-blue-200 text-sm">
            Powered by AI Agents • Búsqueda web en tiempo real
          </p>
        </div>
      </div>
    </div>
  )
}

