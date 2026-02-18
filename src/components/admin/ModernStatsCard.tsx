'use client'

import { LucideIcon } from 'lucide-react'
import { ReactNode } from 'react'

interface ModernStatsCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  trend?: {
    value: number
    label: string
    isPositive?: boolean
  }
  color?: 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'indigo' | 'cyan' | 'teal'
  subtitle?: string
  action?: ReactNode
}

const colorClasses = {
  blue: {
    gradient: 'from-blue-500 to-cyan-500',
    bg: 'bg-blue-500/10 dark:bg-blue-500/20',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-800',
    shadow: 'shadow-blue-500/20'
  },
  purple: {
    gradient: 'from-purple-500 to-pink-500',
    bg: 'bg-purple-500/10 dark:bg-purple-500/20',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-800',
    shadow: 'shadow-purple-500/20'
  },
  green: {
    gradient: 'from-green-500 to-emerald-500',
    bg: 'bg-green-500/10 dark:bg-green-500/20',
    text: 'text-green-600 dark:text-green-400',
    border: 'border-green-200 dark:border-green-800',
    shadow: 'shadow-green-500/20'
  },
  orange: {
    gradient: 'from-orange-500 to-amber-500',
    bg: 'bg-orange-500/10 dark:bg-orange-500/20',
    text: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-200 dark:border-orange-800',
    shadow: 'shadow-orange-500/20'
  },
  pink: {
    gradient: 'from-pink-500 to-rose-500',
    bg: 'bg-pink-500/10 dark:bg-pink-500/20',
    text: 'text-pink-600 dark:text-pink-400',
    border: 'border-pink-200 dark:border-pink-800',
    shadow: 'shadow-pink-500/20'
  },
  indigo: {
    gradient: 'from-indigo-500 to-purple-500',
    bg: 'bg-indigo-500/10 dark:bg-indigo-500/20',
    text: 'text-indigo-600 dark:text-indigo-400',
    border: 'border-indigo-200 dark:border-indigo-800',
    shadow: 'shadow-indigo-500/20'
  },
  cyan: {
    gradient: 'from-cyan-500 to-blue-500',
    bg: 'bg-cyan-500/10 dark:bg-cyan-500/20',
    text: 'text-cyan-600 dark:text-cyan-400',
    border: 'border-cyan-200 dark:border-cyan-800',
    shadow: 'shadow-cyan-500/20'
  },
  teal: {
    gradient: 'from-teal-500 to-cyan-500',
    bg: 'bg-teal-500/10 dark:bg-teal-500/20',
    text: 'text-teal-600 dark:text-teal-400',
    border: 'border-teal-200 dark:border-teal-800',
    shadow: 'shadow-teal-500/20'
  }
}

export default function ModernStatsCard({
  title,
  value,
  icon: Icon,
  trend,
  color = 'blue',
  subtitle,
  action
}: ModernStatsCardProps) {
  const colors = colorClasses[color]

  return (
    <div className={`
      relative overflow-hidden rounded-2xl border ${colors.border}
      bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl
      hover:shadow-xl ${colors.shadow} transition-all duration-300
      group
    `}>
      {/* Gradient Background */}
      <div className={`absolute inset-0 bg-gradient-to-br ${colors.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
      
      <div className="relative p-6">
        <div className="flex items-start justify-between mb-4">
          <div className={`p-3 rounded-xl ${colors.bg}`}>
            <Icon className={`w-6 h-6 ${colors.text}`} />
          </div>
          {action && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              {action}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {title}
          </p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">
            {value.toLocaleString()}
          </p>
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-500">
              {subtitle}
            </p>
          )}
        </div>

        {trend && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${trend.isPositive !== false ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {trend.isPositive !== false ? '↑' : '↓'} {Math.abs(trend.value)}%
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-500">
                {trend.label}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

