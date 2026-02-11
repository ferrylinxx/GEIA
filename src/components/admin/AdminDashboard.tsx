'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Users, MessageSquare, FileText, Database, Shield, ShieldOff } from 'lucide-react'

interface Props {
  stats: { users: number; conversations: number; messages: number; files: number; chunks: number }
  users: { id: string; name: string | null; role: string; created_at: string }[]
}

export default function AdminDashboard({ stats, users: initialUsers }: Props) {
  const [users, setUsers] = useState(initialUsers)
  const router = useRouter()

  const toggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin'
    const supabase = createClient()
    await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
    setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u))
  }

  const statCards = [
    { label: 'Usuarios', value: stats.users, icon: <Users size={20} />, color: 'text-blue-600 bg-blue-50' },
    { label: 'Conversaciones', value: stats.conversations, icon: <MessageSquare size={20} />, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Mensajes', value: stats.messages, icon: <MessageSquare size={20} />, color: 'text-purple-600 bg-purple-50' },
    { label: 'Archivos', value: stats.files, icon: <FileText size={20} />, color: 'text-yellow-600 bg-yellow-50' },
    { label: 'Chunks RAG', value: stats.chunks, icon: <Database size={20} />, color: 'text-red-600 bg-red-50' },
  ]

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="border-b border-zinc-200 px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/chat')} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-600"><ArrowLeft size={18} /></button>
        <Shield size={20} className="text-purple-500" />
        <h1 className="text-lg font-bold">Panel de Administración</h1>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {statCards.map(s => (
            <div key={s.label} className="bg-white border border-zinc-200 rounded-xl p-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${s.color}`}>{s.icon}</div>
              <p className="text-2xl font-bold text-zinc-800">{s.value.toLocaleString()}</p>
              <p className="text-xs text-zinc-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Users table */}
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-200">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-zinc-800"><Users size={14} /> Usuarios ({users.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="text-left px-4 py-2 text-xs text-zinc-500 font-medium">ID</th>
                  <th className="text-left px-4 py-2 text-xs text-zinc-500 font-medium">Nombre</th>
                  <th className="text-left px-4 py-2 text-xs text-zinc-500 font-medium">Rol</th>
                  <th className="text-left px-4 py-2 text-xs text-zinc-500 font-medium">Creado</th>
                  <th className="text-left px-4 py-2 text-xs text-zinc-500 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="px-4 py-2.5 font-mono text-[11px] text-zinc-400">{u.id.substring(0, 8)}...</td>
                    <td className="px-4 py-2.5 text-zinc-700">{u.name || <span className="text-zinc-400 italic">Sin nombre</span>}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${u.role === 'admin' ? 'bg-purple-50 text-purple-600' : 'bg-zinc-100 text-zinc-500'}`}>{u.role}</span>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500">{new Date(u.created_at).toLocaleDateString('es-ES')}</td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => toggleRole(u.id, u.role)}
                        className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-zinc-100 rounded text-zinc-500 hover:text-zinc-800 transition-colors">
                        {u.role === 'admin' ? <ShieldOff size={12} /> : <Shield size={12} />}
                        {u.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}

