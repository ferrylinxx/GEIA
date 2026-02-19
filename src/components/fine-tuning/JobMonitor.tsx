'use client'

import { useState, useEffect } from 'react'
import { Activity, Clock, CheckCircle, XCircle, Loader } from 'lucide-react'

interface Job {
  id: string
  dataset_id: string
  base_model: string
  fine_tuned_model_name?: string
  status: string
  hyperparameters: any
  progress_percentage?: number
  error_message?: string
  started_at?: string
  completed_at?: string
  created_at: string
  dataset?: {
    name: string
    total_examples: number
  }
}

export default function JobMonitor() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadJobs()
    const interval = setInterval(loadJobs, 10000) // Refresh every 10s
    return () => clearInterval(interval)
  }, [])

  const loadJobs = async () => {
    try {
      const { data } = await fetch('/api/fine-tuning/jobs').then(r => r.json())
      if (data) {
        setJobs(data)
      }
    } catch (error) {
      console.error('Error loading jobs:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />
      case 'running':
        return <Loader className="w-5 h-5 text-blue-500 animate-spin" />
      default:
        return <Clock className="w-5 h-5 text-yellow-500" />
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Pendiente'
      case 'running':
        return 'En progreso'
      case 'completed':
        return 'Completado'
      case 'failed':
        return 'Fallido'
      default:
        return status
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 border-green-500/30 text-green-300'
      case 'failed':
        return 'bg-red-500/20 border-red-500/30 text-red-300'
      case 'running':
        return 'bg-blue-500/20 border-blue-500/30 text-blue-300'
      default:
        return 'bg-yellow-500/20 border-yellow-500/30 text-yellow-300'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Activity className="w-6 h-6 text-blue-600" />
        <h2 className="text-xl font-bold text-zinc-800">Monitor de Entrenamiento</h2>
      </div>

      {jobs.length === 0 ? (
        <div className="text-center text-zinc-600 p-12 bg-white/80 backdrop-blur-sm border border-zinc-200 rounded-xl">
          No hay trabajos de fine-tuning en progreso
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map(job => (
            <div
              key={job.id}
              className="bg-white/80 backdrop-blur-sm border border-zinc-200 rounded-xl p-6 hover:border-blue-400 hover:shadow-xl transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {getStatusIcon(job.status)}
                  <div>
                    <h3 className="font-semibold text-zinc-800">
                      {job.fine_tuned_model_name || `Fine-tuning ${job.base_model}`}
                    </h3>
                    <p className="text-sm text-zinc-600">
                      Dataset: {job.dataset?.name || 'N/A'} ({job.dataset?.total_examples || 0} ejemplos)
                    </p>
                  </div>
                </div>

                <span className={`px-3 py-1 rounded-full text-sm border font-medium ${getStatusColor(job.status)}`}>
                  {getStatusLabel(job.status)}
                </span>
              </div>

              {/* Progress bar */}
              {job.status === 'running' && job.progress_percentage !== undefined && (
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm text-zinc-600 mb-2">
                    <span className="font-medium">Progreso</span>
                    <span className="font-bold text-blue-600">{job.progress_percentage}%</span>
                  </div>
                  <div className="w-full bg-zinc-200 rounded-full h-2.5">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${job.progress_percentage}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Error message */}
              {job.error_message && (
                <div className="mb-4 p-3 bg-red-50 border border-red-300 rounded-lg text-red-700 text-sm font-medium">
                  {job.error_message}
                </div>
              )}

              {/* Metadata */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-zinc-600">Modelo base:</span>
                  <p className="text-zinc-800 font-medium">{job.base_model}</p>
                </div>
                <div>
                  <span className="text-zinc-600">Creado:</span>
                  <p className="text-zinc-800 font-medium">
                    {new Date(job.created_at).toLocaleDateString()}
                  </p>
                </div>
                {job.started_at && (
                  <div>
                    <span className="text-zinc-600">Iniciado:</span>
                    <p className="text-zinc-800 font-medium">
                      {new Date(job.started_at).toLocaleTimeString()}
                    </p>
                  </div>
                )}
                {job.completed_at && (
                  <div>
                    <span className="text-zinc-600">Completado:</span>
                    <p className="text-zinc-800 font-medium">
                      {new Date(job.completed_at).toLocaleTimeString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

