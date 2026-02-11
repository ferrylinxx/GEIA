'use client'

import { useState, useEffect } from 'react'
import { useUIStore } from '@/store/ui-store'
import { createClient } from '@/lib/supabase/client'
import { Memory } from '@/lib/types'
import { X, Plus, Trash2, ToggleLeft, ToggleRight, Brain } from 'lucide-react'

export default function MemoryPanel({ userId }: { userId: string }) {
  const { setMemoryPanelOpen } = useUIStore()
  const [memories, setMemories] = useState<Memory[]>([])
  const [newMemory, setNewMemory] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadMemories()
  }, [])

  const loadMemories = async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from('memories').select('*')
      .eq('user_id', userId).eq('scope', 'user').order('created_at', { ascending: false })
    if (data) setMemories(data)
    setLoading(false)
  }

  const addMemory = async () => {
    if (!newMemory.trim()) return
    const supabase = createClient()
    const { data } = await supabase.from('memories').insert({
      user_id: userId, content: newMemory.trim(), scope: 'user',
    }).select().single()
    if (data) { setMemories([data, ...memories]); setNewMemory('') }
  }

  const toggleMemory = async (id: string, enabled: boolean) => {
    const supabase = createClient()
    await supabase.from('memories').update({ enabled: !enabled }).eq('id', id)
    setMemories(memories.map(m => m.id === id ? { ...m, enabled: !enabled } : m))
  }

  const deleteMemory = async (id: string) => {
    const supabase = createClient()
    await supabase.from('memories').delete().eq('id', id)
    setMemories(memories.filter(m => m.id !== id))
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setMemoryPanelOpen(false)}>
      <div className="w-full max-w-lg bg-white border border-zinc-200 rounded-xl shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
          <div className="flex items-center gap-2">
            <Brain size={18} className="text-purple-500" />
            <h2 className="text-sm font-semibold text-zinc-800">Lo que sé de ti</h2>
          </div>
          <button onClick={() => setMemoryPanelOpen(false)} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400"><X size={16} /></button>
        </div>

        <div className="p-4">
          <p className="text-xs text-zinc-500 mb-4">GIA recuerda estos datos para personalizar tus respuestas. Puedes editar, activar/desactivar o eliminar cada recuerdo.</p>

          {/* Add new */}
          <div className="flex gap-2 mb-4">
            <input value={newMemory} onChange={e => setNewMemory(e.target.value)} placeholder="Añadir un recuerdo..."
              onKeyDown={e => { if (e.key === 'Enter') addMemory() }}
              className="flex-1 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            <button onClick={addMemory} className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm text-white"><Plus size={14} /></button>
          </div>

          {/* Memories list */}
          <div className="max-h-[50vh] overflow-y-auto space-y-2">
            {loading && <p className="text-sm text-zinc-400 text-center py-4">Cargando...</p>}
            {!loading && memories.length === 0 && (
              <p className="text-sm text-zinc-400 text-center py-4">Sin recuerdos guardados</p>
            )}
            {memories.map(m => (
              <div key={m.id} className={`flex items-start gap-2 p-3 rounded-lg border ${m.enabled ? 'border-zinc-200 bg-zinc-50' : 'border-zinc-100 bg-white opacity-60'}`}>
                <p className="flex-1 text-sm text-zinc-700">{m.content}</p>
                <button onClick={() => toggleMemory(m.id, m.enabled)} className="shrink-0 text-zinc-400 hover:text-zinc-700" title={m.enabled ? 'Desactivar' : 'Activar'}>
                  {m.enabled ? <ToggleRight size={18} className="text-blue-500" /> : <ToggleLeft size={18} />}
                </button>
                <button onClick={() => deleteMemory(m.id)} className="shrink-0 text-zinc-400 hover:text-red-500" title="Eliminar">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

