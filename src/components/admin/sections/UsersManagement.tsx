'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import ModernSectionWrapper from '../ModernSectionWrapper'
import { Users, Plus, Edit3, Trash2, MessageCircle, Crown, Check, X, Loader2 } from 'lucide-react'

interface UserRow {
  id: string
  name: string | null
  email: string
  role: string
  avatar_url: string | null
  created_at: string
  activity_status?: 'online' | 'idle' | 'offline'
  activity_last_seen_at?: string | null
}

export default function UsersManagement({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [saving, setSaving] = useState(false)
  const [openingDmUserId, setOpeningDmUserId] = useState<string | null>(null)
  const [showCreateUserModal, setShowCreateUserModal] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, role, avatar_url, created_at, activity_status, activity_last_seen_at')
        .order('created_at', { ascending: false })

      if (error) throw error
      setUsers(data || [])
    } catch (error) {
      console.error('Error loading users:', error)
    } finally {
      setLoading(false)
    }
  }

  async function saveUser(userId: string) {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ name: editName, role: editRole })
        .eq('id', userId)

      if (error) throw error
      await loadUsers()
      setEditingUser(null)
    } catch (error) {
      console.error('Error saving user:', error)
      alert('Error al guardar usuario')
    } finally {
      setSaving(false)
    }
  }

  async function openPrivateChat(userId: string) {
    setOpeningDmUserId(userId)
    try {
      const res = await fetch('/api/conversations/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otherUserId: userId })
      })
      if (!res.ok) throw new Error('Failed to create DM')
      const { conversationId } = await res.json()
      router.push(`/chat/${conversationId}`)
    } catch (error) {
      console.error('Error opening DM:', error)
      alert('Error al abrir chat privado')
    } finally {
      setOpeningDmUserId(null)
    }
  }

  function statusInfo(status?: string) {
    switch (status) {
      case 'online': return { label: 'En línea', dot: 'bg-emerald-500', text: 'text-emerald-600' }
      case 'typing': return { label: 'Escribiendo...', dot: 'bg-blue-500', text: 'text-blue-600' }
      case 'read': return { label: 'Leído', dot: 'bg-purple-500', text: 'text-purple-600' }
      default: return { label: 'Desconectado', dot: 'bg-zinc-300', text: 'text-zinc-500' }
    }
  }

  function formatLastSeen(lastSeenAt?: string | null) {
    if (!lastSeenAt) return null
    const date = new Date(lastSeenAt)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 60) return `hace ${diffMins}m`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `hace ${diffHours}h`
    const diffDays = Math.floor(diffHours / 24)
    return `hace ${diffDays}d`
  }

  if (loading) {
    return (
      <ModernSectionWrapper title="Usuarios" subtitle="Cargando usuarios..." icon={Users} gradient="purple">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </ModernSectionWrapper>
    )
  }

  return (
    <ModernSectionWrapper
      title="Usuarios"
      subtitle={`Gestiona los ${users.length} usuarios de la plataforma`}
      icon={Users}
      gradient="purple"
      actions={
        <button
          onClick={() => setShowCreateUserModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm rounded-xl hover:from-purple-500 hover:to-pink-500 transition-all shadow-lg hover:shadow-xl"
        >
          <Plus size={16} />
          Crear Usuario
        </button>
      }
    >
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-slate-50 to-slate-100/50 dark:from-slate-800 dark:to-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <th className="text-left px-4 py-3 text-xs text-slate-600 dark:text-slate-400 font-semibold">Usuario</th>
                <th className="text-left px-4 py-3 text-xs text-slate-600 dark:text-slate-400 font-semibold">Email</th>
                <th className="text-left px-4 py-3 text-xs text-slate-600 dark:text-slate-400 font-semibold">Actividad</th>
                <th className="text-left px-4 py-3 text-xs text-slate-600 dark:text-slate-400 font-semibold">Rol</th>
                <th className="text-left px-4 py-3 text-xs text-slate-600 dark:text-slate-400 font-semibold">Creado</th>
                <th className="text-left px-4 py-3 text-xs text-slate-600 dark:text-slate-400 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const status = statusInfo(u.activity_status)
                const lastSeen = formatLastSeen(u.activity_last_seen_at)
                const initials = (u.name || u.email || 'U').trim().charAt(0).toUpperCase()
                const isAdmin = (u.role || '').toLowerCase() === 'admin'

                return (
                  <tr key={u.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3">
                      {editingUser === u.id ? (
                        <input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-800"
                        />
                      ) : (
                        <div className="flex items-center gap-2.5">
                          <div className={`relative h-10 w-10 rounded-full ${isAdmin ? 'ring-2 ring-yellow-400' : ''}`}>
                            <div className="h-full w-full rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                              {u.avatar_url ? (
                                <img src={u.avatar_url} alt={u.name || u.email || 'Usuario'} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-xs font-semibold text-white">{initials}</span>
                              )}
                            </div>
                            {isAdmin && (
                              <span className="absolute -top-1 -right-1 bg-yellow-400 rounded-full p-1">
                                <Crown size={10} className="text-yellow-900" />
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="text-slate-700 dark:text-slate-300 font-medium">{u.name || 'Sin nombre'}</p>
                            <p className="text-xs text-slate-400">{u.id.slice(0, 8)}...</p>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">{u.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${status.text}`}>
                          <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                          {status.label}
                        </span>
                        {u.activity_status === 'offline' && lastSeen && (
                          <span className="text-[10px] text-slate-400">Últ. {lastSeen}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {editingUser === u.id ? (
                        <select
                          value={editRole}
                          onChange={e => setEditRole(e.target.value)}
                          className="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-800"
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          isAdmin ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        }`}>
                          {u.role}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{new Date(u.created_at).toLocaleDateString('es-ES')}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {editingUser === u.id ? (
                          <>
                            <button
                              onClick={() => saveUser(u.id)}
                              disabled={saving}
                              className="p-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg text-emerald-600 dark:text-emerald-400"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditingUser(null)}
                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400"
                            >
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => openPrivateChat(u.id)}
                              disabled={openingDmUserId === u.id || u.id === currentUserId}
                              className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400 disabled:opacity-50"
                              title="Chat privado"
                            >
                              {openingDmUserId === u.id ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
                            </button>
                            <button
                              onClick={() => {
                                setEditingUser(u.id)
                                setEditName(u.name || '')
                                setEditRole(u.role)
                              }}
                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400"
                              title="Editar"
                            >
                              <Edit3 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </ModernSectionWrapper>
  )
}

