'use client'

import { useUIStore } from '@/store/ui-store'
import { AlertTriangle } from 'lucide-react'
import { useEffect, useRef } from 'react'

export default function ConfirmDialog() {
  const { confirmDialog, hideConfirm } = useUIStore()
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (confirmDialog) confirmBtnRef.current?.focus()
  }, [confirmDialog])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hideConfirm()
    }
    if (confirmDialog) {
      document.addEventListener('keydown', handleKey)
      return () => document.removeEventListener('keydown', handleKey)
    }
  }, [confirmDialog, hideConfirm])

  if (!confirmDialog) return null

  const isDanger = confirmDialog.variant === 'danger'

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={hideConfirm}
           style={{ animation: 'fade-in 0.15s ease-out' }} />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl border border-zinc-200 max-w-sm w-full mx-4 p-6"
           style={{ animation: 'dialog-in 0.2s ease-out' }}>
        <div className="flex items-start gap-3">
          {isDanger && (
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <AlertTriangle size={20} className="text-red-600" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-zinc-900">{confirmDialog.title}</h3>
            <p className="mt-1 text-sm text-zinc-500">{confirmDialog.message}</p>
          </div>
        </div>

        <div className="mt-5 flex gap-2 justify-end">
          <button
            onClick={hideConfirm}
            className="px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors"
          >
            {confirmDialog.cancelLabel || 'Cancelar'}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={() => { confirmDialog.onConfirm(); hideConfirm() }}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
              isDanger
                ? 'bg-red-600 hover:bg-red-700 focus:ring-2 focus:ring-red-500'
                : 'bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500'
            }`}
          >
            {confirmDialog.confirmLabel || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

