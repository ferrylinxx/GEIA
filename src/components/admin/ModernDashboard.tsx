'use client'

import { Users, MessageSquare, FileText, Database, TrendingUp, Activity, Clock, Zap } from 'lucide-react'
import ModernStatsCard from './ModernStatsCard'
import { useEffect, useState } from 'react'

interface DashboardStats {
  users: number
  conversations: number
  messages: number
  files: number
  chunks: number
}

interface ModernDashboardProps {
  stats: DashboardStats
}

export default function ModernDashboard({ stats }: ModernDashboardProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="p-8 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-40 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 dark:from-white dark:via-blue-100 dark:to-indigo-100 bg-clip-text text-transparent">
          Panel de Control
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Bienvenido al panel de administración de GEIA
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <ModernStatsCard
          title="Usuarios Totales"
          value={stats.users}
          icon={Users}
          color="blue"
          trend={{ value: 12, label: 'vs mes anterior', isPositive: true }}
          subtitle="Usuarios activos en la plataforma"
        />
        
        <ModernStatsCard
          title="Conversaciones"
          value={stats.conversations}
          icon={MessageSquare}
          color="purple"
          trend={{ value: 8, label: 'vs mes anterior', isPositive: true }}
          subtitle="Total de conversaciones creadas"
        />
        
        <ModernStatsCard
          title="Mensajes"
          value={stats.messages}
          icon={Activity}
          color="green"
          trend={{ value: 23, label: 'vs mes anterior', isPositive: true }}
          subtitle="Mensajes intercambiados"
        />
        
        <ModernStatsCard
          title="Archivos"
          value={stats.files}
          icon={FileText}
          color="orange"
          trend={{ value: 5, label: 'vs mes anterior', isPositive: true }}
          subtitle="Documentos procesados"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ModernStatsCard
          title="Chunks Procesados"
          value={stats.chunks}
          icon={Database}
          color="indigo"
          subtitle="Fragmentos de texto indexados"
        />
        
        <ModernStatsCard
          title="Tasa de Éxito"
          value="98.5%"
          icon={TrendingUp}
          color="teal"
          subtitle="Procesamiento de documentos"
        />
        
        <ModernStatsCard
          title="Tiempo Promedio"
          value="2.3s"
          icon={Zap}
          color="pink"
          subtitle="Respuesta del sistema"
        />
      </div>

      {/* Activity Chart Placeholder */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Actividad Reciente
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Últimos 7 días
              </p>
            </div>
            <Clock className="w-5 h-5 text-slate-400" />
          </div>
          
          <div className="space-y-4">
            {[
              { label: 'Nuevos usuarios', value: 12, color: 'bg-blue-500' },
              { label: 'Conversaciones', value: 45, color: 'bg-purple-500' },
              { label: 'Archivos subidos', value: 23, color: 'bg-green-500' },
              { label: 'Mensajes enviados', value: 156, color: 'bg-orange-500' },
            ].map((item, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-300">{item.label}</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{item.value}</span>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${item.color} rounded-full transition-all duration-500`}
                    style={{ width: `${(item.value / 156) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Estado del Sistema
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Servicios en tiempo real
              </p>
            </div>
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
          </div>
          
          <div className="space-y-4">
            {[
              { service: 'API Principal', status: 'Operativo', uptime: '99.9%', color: 'text-green-500' },
              { service: 'Base de Datos', status: 'Operativo', uptime: '99.8%', color: 'text-green-500' },
              { service: 'Procesamiento IA', status: 'Operativo', uptime: '99.5%', color: 'text-green-500' },
              { service: 'Almacenamiento', status: 'Operativo', uptime: '100%', color: 'text-green-500' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${item.color.replace('text-', 'bg-')}`} />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{item.service}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.status}</p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {item.uptime}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

