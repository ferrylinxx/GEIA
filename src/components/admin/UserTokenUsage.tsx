'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BarChart3, DollarSign, MessageSquare, TrendingUp, Loader2, Zap } from 'lucide-react'

interface TokenStats {
  total_requests: number
  total_prompt_tokens: number
  total_completion_tokens: number
  total_tokens: number
  total_cost_usd: number
  last_usage_at: string | null
  stats_by_model?: Record<string, {
    requests: number
    tokens: number
    cost: number
  }>
}

interface UserTokenUsageProps {
  userId: string
}

export default function UserTokenUsage({ userId }: UserTokenUsageProps) {
  const [stats, setStats] = useState<TokenStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [recentActivity, setRecentActivity] = useState<Array<{
    id: string
    model: string
    total_tokens: number
    cost_usd: number
    created_at: string
  }>>([])

  // Tasa de cambio USD a EUR (aproximada, puedes actualizarla)
  const USD_TO_EUR = 0.92

  useEffect(() => {
    const supabase = createClient()
    
    // Cargar estadísticas
    const loadStats = async () => {
      setLoading(true)
      
      // Cargar stats agregadas
      const { data: statsData } = await supabase
        .from('user_token_stats')
        .select('*')
        .eq('user_id', userId)
        .single()
      
      if (statsData) {
        setStats(statsData as TokenStats)
      }

      // Cargar TODA la actividad (sin límite)
      const { data: recentData } = await supabase
        .from('token_usage')
        .select('id, model, total_tokens, cost_usd, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      
      if (recentData) {
        setRecentActivity(recentData)
      }
      
      setLoading(false)
    }
    
    loadStats()
    
    // Suscripción realtime a cambios en token_usage
    const channel = supabase
      .channel(`token-usage-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'token_usage',
        filter: `user_id=eq.${userId}`
      }, () => {
        console.log('[UserTokenUsage] New token usage detected, reloading...')
        loadStats()
      })
      .subscribe()
    
    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 size={24} className="animate-spin text-purple-500" />
      </div>
    )
  }

  if (!stats || stats.total_requests === 0) {
    return (
      <div className="p-6 text-center text-zinc-500 text-sm">
        <Zap size={32} className="mx-auto mb-2 text-zinc-300" />
        <p>No hay consumo de tokens registrado</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Estadísticas principales */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <MessageSquare size={14} />
            <span className="text-xs font-medium">Requests</span>
          </div>
          <div className="text-xl font-bold text-blue-900">
            {stats.total_requests.toLocaleString()}
          </div>
        </div>
        
        <div className="p-3 bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-lg border border-purple-200">
          <div className="flex items-center gap-2 text-purple-600 mb-1">
            <BarChart3 size={14} />
            <span className="text-xs font-medium">Tokens</span>
          </div>
          <div className="text-xl font-bold text-purple-900">
            {stats.total_tokens.toLocaleString()}
          </div>
          <div className="text-[10px] text-purple-600 mt-0.5">
            {stats.total_prompt_tokens.toLocaleString()} in / {stats.total_completion_tokens.toLocaleString()} out
          </div>
        </div>
        
        <div className="p-3 bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-lg border border-emerald-200 col-span-2">
          <div className="flex items-center gap-2 text-emerald-600 mb-1">
            <DollarSign size={14} />
            <span className="text-xs font-medium">Costo Total</span>
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold text-emerald-900">
              €{(stats.total_cost_usd * USD_TO_EUR).toFixed(4)}
            </div>
            <div className="text-sm text-emerald-600">
              (${stats.total_cost_usd.toFixed(4)})
            </div>
          </div>
          {stats.last_usage_at && (
            <div className="text-[10px] text-emerald-600 mt-0.5">
              Último uso: {new Date(stats.last_usage_at).toLocaleString('es-ES')}
            </div>
          )}
        </div>
      </div>

      {/* Actividad reciente */}
      {recentActivity.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold text-zinc-600 mb-2 flex items-center gap-1">
            <TrendingUp size={12} />
            Actividad Reciente
          </h4>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-center justify-between p-2 bg-zinc-50 rounded text-xs">
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-zinc-700">{activity.model}</span>
                  <span className="text-zinc-400 ml-2">{activity.total_tokens.toLocaleString()} tokens</span>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-emerald-600">
                    €{(activity.cost_usd * USD_TO_EUR).toFixed(4)}
                  </div>
                  <div className="text-[10px] text-zinc-400">${activity.cost_usd.toFixed(4)}</div>
                  <div className="text-[10px] text-zinc-400">
                    {new Date(activity.created_at).toLocaleTimeString('es-ES')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

