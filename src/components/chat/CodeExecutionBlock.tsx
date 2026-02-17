'use client'

import { useState } from 'react'
import { Code2, Play, CheckCircle2, XCircle, Clock, Loader2, Eye } from 'lucide-react'

interface CodeExecutionBlockProps {
  code: string
  output?: string
  error?: string
  execution_time_ms?: number
  status?: 'pending' | 'running' | 'completed' | 'failed'
  allowManualExecution?: boolean
  conversationId?: string
}

export default function CodeExecutionBlock({
  code,
  output,
  error,
  execution_time_ms,
  status = 'completed',
  allowManualExecution = true,
  conversationId
}: CodeExecutionBlockProps) {
  const [showCode, setShowCode] = useState(true)
  const [executing, setExecuting] = useState(false)
  const [manualOutput, setManualOutput] = useState<string | undefined>(output)
  const [manualError, setManualError] = useState<string | undefined>(error)
  const [manualTime, setManualTime] = useState<number | undefined>(execution_time_ms)
  const [showHtmlPreview, setShowHtmlPreview] = useState(false)

  const handleExecute = async () => {
    if (!conversationId) {
      setManualError('No se puede ejecutar: conversación no disponible')
      return
    }

    setExecuting(true)
    setManualError(undefined)
    setManualOutput(undefined)

    try {
      const res = await fetch('/api/code-interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, conversation_id: conversationId }),
      })

      if (res.ok) {
        const data = await res.json()
        setManualOutput(data.output || undefined)
        setManualError(data.error || undefined)
        setManualTime(data.execution_time_ms)
      } else {
        const errorData = await res.json()
        setManualError(errorData.error || 'Error al ejecutar el código')
      }
    } catch (err) {
      setManualError('Error de red al ejecutar el código')
    } finally {
      setExecuting(false)
    }
  }

  const isHtmlOutput = (text: string | undefined) => {
    if (!text) return false
    return text.trim().startsWith('<') && (text.includes('<html') || text.includes('<div') || text.includes('<svg'))
  }

  const statusConfig = {
    pending: { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-50', label: 'Pendiente' },
    running: { icon: Play, color: 'text-blue-500', bg: 'bg-blue-50', label: 'Ejecutando...' },
    completed: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50', label: 'Completado' },
    failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', label: 'Error' },
  }

  const currentStatus = executing ? 'running' : status
  const config = statusConfig[currentStatus]
  const StatusIcon = config.icon

  const displayOutput = manualOutput !== undefined ? manualOutput : output
  const displayError = manualError !== undefined ? manualError : error
  const displayTime = manualTime !== undefined ? manualTime : execution_time_ms

  // Debug: log props
  console.log('CodeExecutionBlock props:', { allowManualExecution, conversationId, code: code.substring(0, 50) })

  return (
    <div className="my-3 rounded-xl border border-zinc-200 overflow-hidden bg-white shadow-sm">
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-2.5 ${config.bg} border-b border-zinc-200`}>
        <div className="flex items-center gap-2">
          <Code2 size={16} className="text-orange-500" />
          <span className="text-sm font-semibold text-zinc-700">Code Interpreter</span>
          <div className={`flex items-center gap-1.5 text-xs ${config.color}`}>
            {executing ? <Loader2 size={14} className="animate-spin" /> : <StatusIcon size={14} />}
            <span>{config.label}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {displayTime !== undefined && (
            <span className="text-xs text-zinc-500">
              {displayTime < 1000 ? `${displayTime}ms` : `${(displayTime / 1000).toFixed(2)}s`}
            </span>
          )}
          {allowManualExecution && (
            <button
              onClick={handleExecute}
              disabled={executing}
              className="px-3 py-1 text-xs font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              title="Ejecutar código"
            >
              {executing ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Ejecutando...
                </>
              ) : (
                <>
                  <Play size={12} />
                  Ejecutar
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Code Section */}
      <div className="border-b border-zinc-200">
        <button
          onClick={() => setShowCode(!showCode)}
          className="w-full px-4 py-2 text-left text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors flex items-center justify-between"
        >
          <span>Código Python</span>
          <span className="text-zinc-400">{showCode ? '▼' : '▶'}</span>
        </button>
        {showCode && (
          <pre className="px-4 py-3 bg-zinc-900 text-zinc-100 text-xs overflow-x-auto">
            <code>{code}</code>
          </pre>
        )}
      </div>

      {/* Output Section */}
      {displayOutput && (
        <div className="px-4 py-3 bg-zinc-50">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-zinc-600">Salida:</p>
            {isHtmlOutput(displayOutput) && (
              <button
                onClick={() => setShowHtmlPreview(!showHtmlPreview)}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <Eye size={12} />
                {showHtmlPreview ? 'Ver código' : 'Vista previa HTML'}
              </button>
            )}
          </div>
          {showHtmlPreview && isHtmlOutput(displayOutput) ? (
            <div className="bg-white p-3 rounded border border-zinc-200 overflow-auto max-h-96">
              <iframe
                srcDoc={displayOutput}
                className="w-full min-h-[200px] border-0"
                sandbox="allow-scripts"
                title="HTML Preview"
              />
            </div>
          ) : (
            <pre className="text-xs text-zinc-800 whitespace-pre-wrap font-mono bg-white p-3 rounded border border-zinc-200 max-h-96 overflow-auto">
              {displayOutput}
            </pre>
          )}
        </div>
      )}

      {/* Error Section */}
      {displayError && (
        <div className="px-4 py-3 bg-red-50 border-t border-red-100">
          <p className="text-xs font-medium text-red-700 mb-2">Error:</p>
          <pre className="text-xs text-red-600 whitespace-pre-wrap font-mono bg-white p-3 rounded border border-red-200">
            {displayError}
          </pre>
        </div>
      )}
    </div>
  )
}

