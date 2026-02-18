'use client'

import { useState, useEffect } from 'react'
import { Crown, Plus, Edit3, Trash2, Loader2, Save } from 'lucide-react'

interface Role {
  id: string
  name: string
  description: string | null
  is_system: boolean
  created_at: string
  user_count?: number
}
export default function RolesManagement() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [showRoleForm, setShowRoleForm] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [roleForm, setRoleForm] = useState({ name: '', description: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void loadRoles()
  }, [])

  const loadRoles = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/roles')
      if (res.ok) {
        const data = await res.json()
        setRoles(data.roles || [])
      }
    } catch (error) {
      console.error('Error loading roles:', error)
    }
    setLoading(false)
  }

  const openRoleForm = (role?: Role) => {
    if (role) {
      setEditingRole(role)
      setRoleForm({ name: role.name, description: role.description || '' })
    } else {
      setEditingRole(null)
      setRoleForm({ name: '', description: '' })
    }
    setShowRoleForm(true)
  }

  const saveRole = async () => {
    setSaving(true)
    try {
      const method = editingRole ? 'PATCH' : 'POST'
      const body = editingRole ? { id: editingRole.id, ...roleForm } : roleForm
      const res = await fetch('/api/admin/roles', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        await loadRoles()
        setShowRoleForm(false)
      }
    } catch (error) {
      console.error('Error saving role:', error)
    }
    setSaving(false)
  }

  const deleteRole = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este rol?')) return
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        await loadRoles()
      }
    } catch (error) {
      console.error('Error deleting role:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-800">Roles y Permisos ({roles.length})</h2>
        <button
          onClick={() => openRoleForm()}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors"
        >
          <Plus size={14} />
          Crear Rol
        </button>
      </div>

      {/* Role Form Modal */}
      {showRoleForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-zinc-800 mb-4">
              {editingRole ? 'Editar Rol' : 'Crear Rol'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Nombre</label>
                <input
                  type="text"
                  value={roleForm.name}
                  onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm"
                  placeholder="Ej: Editor de Contenido"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Descripción</label>
                <textarea
                  value={roleForm.description}
                  onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm"
                  rows={3}
                  placeholder="Descripción del rol..."
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={saveRole}
                disabled={saving || !roleForm.name}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Guardar
              </button>
              <button
                onClick={() => setShowRoleForm(false)}
                className="px-4 py-2 bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Roles List */}
      <div className="space-y-2">
        {roles.map((role) => (
          <div
            key={role.id}
            className="flex items-center gap-3 px-4 py-3 bg-white border border-zinc-200 rounded-xl transition-colors hover:border-zinc-300"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Crown size={20} className="text-blue-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-zinc-800">{role.name}</h3>
                {role.is_system && (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
                    Sistema
                  </span>
                )}
              </div>
              <p className="text-sm text-zinc-500">{role.description || 'Sin descripción'}</p>
              <div className="flex gap-3 mt-1 text-xs text-zinc-400">
                <span>{role.user_count || 0} usuarios</span>
              </div>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => openRoleForm(role)}
                className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-600 transition-colors"
              >
                <Edit3 size={16} />
              </button>
              <button
                onClick={() => deleteRole(role.id)}
                className="p-2 hover:bg-red-50 rounded-lg text-red-600 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {roles.length === 0 && (
          <div className="text-center py-12 bg-white border border-zinc-200 rounded-xl">
            <Crown size={32} className="mx-auto mb-3 text-zinc-300" />
            <p className="text-zinc-500 text-sm">No hay roles creados</p>
          </div>
        )}
      </div>
    </div>
  )
}

