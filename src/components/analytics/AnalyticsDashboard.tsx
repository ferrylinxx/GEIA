'use client'

import { useState, useEffect } from 'react'
import { BarChart3, TrendingUp, DollarSign, MessageSquare, Zap } from 'lucide-react'

interface AnalyticsData {
  user_id?: string
  total_messages: number
  total_tokens: number
  total_cost_usd: number
  avg_tokens_per_message: number
  models_used: string[]
  rag_uses: number
  last_activity?: string
}

interface AnalyticsDashboardProps {
  isAdmin?: boolean
}

export default function AnalyticsDashboard({ isAdmin }: AnalyticsDashboardProps) {
  const [data, setData] = useState<AnalyticsData | AnalyticsData[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAnalytics()
  }, [])

  const loadAnalytics = async () => {
    try {
      const { data: analyticsData } = await fetch('/api/analytics/dashboard').then(r => r.json())
      setData(analyticsData)
    } catch (error) {
      console.error('Error loading analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
      </div>
    )
  }

  // For regular users (single data object)
  if (!isAdmin && data && !Array.isArray(data)) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-purple-500" />
          Analytics Dashboard
        </h2>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Messages */}
          <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <MessageSquare className="w-8 h-8 text-purple-400" />
              <TrendingUp className="w-5 h-5 text-green-400" />
            </div>
            <div className="text-3xl font-bold text-white mb-1">
              {data.total_messages.toLocaleString()}
            </div>
            <div className="text-sm text-white/60">Mensajes totales</div>
          </div>

          {/* Total Tokens */}
          <div className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <Zap className="w-8 h-8 text-blue-400" />
              <TrendingUp className="w-5 h-5 text-green-400" />
            </div>
            <div className="text-3xl font-bold text-white mb-1">
              {data.total_tokens.toLocaleString()}
            </div>
            <div className="text-sm text-white/60">Tokens usados</div>
          </div>

          {/* Total Cost */}
          <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="w-8 h-8 text-green-400" />
              <TrendingUp className="w-5 h-5 text-green-400" />
            </div>
            <div className="text-3xl font-bold text-white mb-1">
              ${data.total_cost_usd.toFixed(2)}
            </div>
            <div className="text-sm text-white/60">Costo total</div>
          </div>

          {/* Avg Tokens */}
          <div className="bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/30 rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <BarChart3 className="w-8 h-8 text-orange-400" />
            </div>
            <div className="text-3xl font-bold text-white mb-1">
              {Math.round(data.avg_tokens_per_message)}
            </div>
            <div className="text-sm text-white/60">Tokens promedio/msg</div>
          </div>
        </div>

        {/* Models Used */}
        <div className="bg-white/5 border border-white/10 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Modelos utilizados</h3>
          <div className="flex flex-wrap gap-2">
            {data.models_used && data.models_used.length > 0 ? (
              data.models_used.map((model, index) => (
                <span
                  key={index}
                  className="px-3 py-1.5 bg-purple-500/20 border border-purple-500/30 text-purple-300 rounded-full text-sm"
                >
                  {model}
                </span>
              ))
            ) : (
              <span className="text-white/60">No hay datos de modelos</span>
            )}
          </div>
        </div>

        {/* RAG Usage */}
        {data.rag_uses > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-2">Uso de RAG</h3>
            <div className="text-2xl font-bold text-purple-400">
              {data.rag_uses} veces
            </div>
          </div>
        )}
      </div>
    )
  }

  // For admins (array of data)
  if (isAdmin && Array.isArray(data)) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-purple-500" />
          Analytics Dashboard (Admin)
        </h2>

        {/* Admin view - show top users */}
        <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-white/5">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                  Usuario
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                  Mensajes
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                  Tokens
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                  Costo
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {data.slice(0, 10).map((user, index) => (
                <tr key={index} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                    {user.user_id?.substring(0, 8)}...
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                    {user.total_messages.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                    {user.total_tokens.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-400 font-semibold">
                    ${user.total_cost_usd.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="text-center text-white/60 p-12">
      No hay datos de analytics disponibles
    </div>
  )
}

