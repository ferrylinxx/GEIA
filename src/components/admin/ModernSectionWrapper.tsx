'use client'

import { ReactNode } from 'react'
import { LucideIcon } from 'lucide-react'

interface ModernSectionWrapperProps {
  title: string
  subtitle?: string
  icon?: LucideIcon
  gradient?: string
  actions?: ReactNode
  children: ReactNode
}

const gradients = {
  blue: 'from-slate-900 via-blue-900 to-indigo-900 dark:from-white dark:via-blue-100 dark:to-indigo-100',
  purple: 'from-slate-900 via-purple-900 to-pink-900 dark:from-white dark:via-purple-100 dark:to-pink-100',
  green: 'from-slate-900 via-green-900 to-emerald-900 dark:from-white dark:via-green-100 dark:to-emerald-100',
  orange: 'from-slate-900 via-orange-900 to-amber-900 dark:from-white dark:via-orange-100 dark:to-amber-100',
  pink: 'from-slate-900 via-pink-900 to-rose-900 dark:from-white dark:via-pink-100 dark:to-rose-100',
  indigo: 'from-slate-900 via-indigo-900 to-purple-900 dark:from-white dark:via-indigo-100 dark:to-purple-100',
  cyan: 'from-slate-900 via-cyan-900 to-blue-900 dark:from-white dark:via-cyan-100 dark:to-blue-100',
  teal: 'from-slate-900 via-teal-900 to-cyan-900 dark:from-white dark:via-teal-100 dark:to-cyan-100',
  yellow: 'from-slate-900 via-yellow-900 to-amber-900 dark:from-white dark:via-yellow-100 dark:to-amber-100',
  red: 'from-slate-900 via-red-900 to-rose-900 dark:from-white dark:via-red-100 dark:to-rose-100',
}

export default function ModernSectionWrapper({
  title,
  subtitle,
  icon: Icon,
  gradient = 'blue',
  actions,
  children
}: ModernSectionWrapperProps) {
  const gradientClass = gradients[gradient as keyof typeof gradients] || gradients.blue

  return (
    <div className="p-8 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              {Icon && (
                <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 dark:from-blue-500/20 dark:to-indigo-500/20">
                  <Icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
              )}
              <h1 className={`text-4xl font-bold bg-gradient-to-r ${gradientClass} bg-clip-text text-transparent`}>
                {title}
              </h1>
            </div>
            {subtitle && (
              <p className="text-slate-600 dark:text-slate-400 ml-[60px]">
                {subtitle}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-2">
              {actions}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="space-y-4">
          {children}
        </div>
      </div>
    </div>
  )
}

