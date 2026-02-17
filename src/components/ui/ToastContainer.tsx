'use client'

import { useUIStore, Toast } from '@/store/ui-store'
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react'

const ICONS: Record<Toast['type'], typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
}

const COLORS: Record<Toast['type'], string> = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
}

const ICON_COLORS: Record<Toast['type'], string> = {
  success: 'text-emerald-500',
  error: 'text-red-500',
  info: 'text-blue-500',
  warning: 'text-amber-500',
}

export default function ToastContainer() {
  const { toasts, removeToast } = useUIStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type]
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-md ${COLORS[toast.type]}`}
            style={{ animation: 'toast-in 0.3s ease-out' }}
          >
            <Icon size={18} className={`shrink-0 mt-0.5 ${ICON_COLORS[toast.type]}`} />
            <span className="text-sm flex-1">{toast.message}</span>
            <button onClick={() => removeToast(toast.id)} className="shrink-0 p-0.5 rounded hover:bg-black/5 transition-colors">
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

