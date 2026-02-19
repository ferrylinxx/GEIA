'use client'

import { useState } from 'react'
import { Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react'

interface DatasetUploaderProps {
  onUploadComplete?: (datasetId: string) => void
}

export default function DatasetUploader({ onUploadComplete }: DatasetUploaderProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [trainingData, setTrainingData] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      // Parse training data as JSON
      let parsedData
      try {
        parsedData = JSON.parse(trainingData)
      } catch (err) {
        throw new Error('El formato de datos de entrenamiento no es JSON válido')
      }

      // Validate format (should be array of objects with prompt/completion)
      if (!Array.isArray(parsedData)) {
        throw new Error('Los datos de entrenamiento deben ser un array')
      }

      const response = await fetch('/api/fine-tuning/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          training_data: parsedData
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Error al crear dataset')
      }

      setSuccess(true)
      setName('')
      setDescription('')
      setTrainingData('')

      if (onUploadComplete && result.data) {
        onUploadComplete(result.data.id)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-6">
      <div className="flex items-center gap-2 mb-6">
        <Upload className="w-6 h-6 text-purple-500" />
        <h2 className="text-xl font-bold text-white">Subir Dataset de Entrenamiento</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">
            Nombre del Dataset
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-purple-500"
            placeholder="Ej: Dataset de Soporte Técnico"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">
            Descripción (opcional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-purple-500"
            placeholder="Describe el propósito de este dataset..."
          />
        </div>

        {/* Training Data */}
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">
            Datos de Entrenamiento (JSON)
          </label>
          <textarea
            value={trainingData}
            onChange={(e) => setTrainingData(e.target.value)}
            required
            rows={10}
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-purple-500 font-mono text-sm"
            placeholder={`[\n  {\n    "prompt": "¿Cómo reseteo mi contraseña?",\n    "completion": "Para resetear tu contraseña..."\n  },\n  {\n    "prompt": "...",\n    "completion": "..."\n  }\n]`}
          />
          <p className="text-xs text-white/40 mt-1">
            Formato: Array de objetos con "prompt" y "completion"
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Success message */}
        {success && (
          <div className="flex items-center gap-2 p-3 bg-green-500/20 border border-green-500/30 rounded-lg text-green-300">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">Dataset creado exitosamente!</span>
          </div>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 rounded-lg font-medium transition-colors"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
              Creando dataset...
            </>
          ) : (
            <>
              <FileText className="w-5 h-5" />
              Crear Dataset
            </>
          )}
        </button>
      </form>
    </div>
  )
}

