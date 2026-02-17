'use client'

import { useState, useEffect } from 'react'
import { AIProvider, ModelConfig } from '@/lib/types'
import { Users, Bot, Plug, Trash2, Edit3, Plus, Eye, EyeOff, ArrowUp, ArrowDown, Loader2, Save, X, Check, ChevronRight } from 'lucide-react'

type AdminTab = 'users' | 'models' | 'providers'

interface UserRow {
  id: string
  name: string | null
  email: string
  role: string
  avatar_url: string | null
  created_at: string
}

export default function AdminSettings() {
  const [adminTab, setAdminTab] = useState<AdminTab>('users')
  const [users, setUsers] = useState<UserRow[]>([])
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [models, setModels] = useState<ModelConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Provider form state
  const [showProviderForm, setShowProviderForm] = useState(false)
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null)
  const [providerForm, setProviderForm] = useState({ name: '', type: 'openai', base_url: 'https://api.openai.com/v1', api_key: '', is_enabled: true, priority: 0 })

  // Model form state
  const [showModelForm, setShowModelForm] = useState(false)
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null)
  const [modelForm, setModelForm] = useState({ provider_id: '', model_id: '', display_name: '', description: '', icon_url: '', system_prompt: '', is_visible: true, sort_order: 0, max_tokens: 4096, supports_streaming: true, supports_vision: false })

  const [saving, setSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  async function loadData() {
    setLoading(true)
    try {
      const [usersRes, providersRes, modelsRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/providers'),
        fetch('/api/admin/models'),
      ])
      if (usersRes.ok) { const d = await usersRes.json(); setUsers(d.users || []) }
      if (providersRes.ok) { const d = await providersRes.json(); setProviders(d.providers || []) }
      if (modelsRes.ok) { const d = await modelsRes.json(); setModels(d.models || []) }
    } catch (e) { console.error('Failed to load admin data', e) }
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData()
  }, [])

  // === USER MANAGEMENT ===
  const startEditUser = (u: UserRow) => {
    setEditingUser(u.id)
    setEditName(u.name || '')
    setEditRole(u.role)
  }

  const saveUser = async (userId: string) => {
    setSaving(true)
    const res = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, name: editName, role: editRole }) })
    if (res.ok) {
      setUsers(users.map(u => u.id === userId ? { ...u, name: editName, role: editRole } : u))
      setEditingUser(null)
      setStatusMsg('Usuario actualizado')
    } else { setStatusMsg('Error al actualizar') }
    setSaving(false)
    setTimeout(() => setStatusMsg(''), 2000)
  }

  const deleteUser = async (userId: string) => {
    setSaving(true)
    const res = await fetch('/api/admin/users', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) })
    if (res.ok) {
      setUsers(users.filter(u => u.id !== userId))
      setConfirmDelete(null)
      setStatusMsg('Usuario eliminado')
    } else { setStatusMsg('Error al eliminar') }
    setSaving(false)
    setTimeout(() => setStatusMsg(''), 2000)
  }

  // === PROVIDER MANAGEMENT ===
  const openProviderForm = (p?: AIProvider) => {
    if (p) {
      setEditingProvider(p)
      setProviderForm({ name: p.name, type: p.type, base_url: p.base_url, api_key: p.api_key, is_enabled: p.is_enabled, priority: p.priority })
    } else {
      setEditingProvider(null)
      setProviderForm({ name: '', type: 'openai', base_url: 'https://api.openai.com/v1', api_key: '', is_enabled: true, priority: 0 })
    }
    setShowProviderForm(true)
  }

  const saveProvider = async () => {
    setSaving(true)
    if (editingProvider) {
      const res = await fetch('/api/admin/providers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingProvider.id, ...providerForm }) })
      if (res.ok) { await loadData(); setShowProviderForm(false); setStatusMsg('Proveedor actualizado') }
    } else {
      const res = await fetch('/api/admin/providers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(providerForm) })
      if (res.ok) { await loadData(); setShowProviderForm(false); setStatusMsg('Proveedor creado') }
    }
    setSaving(false)
    setTimeout(() => setStatusMsg(''), 2000)
  }

  const deleteProvider = async (id: string) => {
    const res = await fetch('/api/admin/providers', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    if (res.ok) { setProviders(providers.filter(p => p.id !== id)); setStatusMsg('Proveedor eliminado') }
    setTimeout(() => setStatusMsg(''), 2000)
  }

  // === MODEL MANAGEMENT ===
  const openModelForm = (m?: ModelConfig) => {
    if (m) {
      setEditingModel(m)
      setModelForm({ provider_id: m.provider_id, model_id: m.model_id, display_name: m.display_name, description: m.description, icon_url: m.icon_url, system_prompt: m.system_prompt, is_visible: m.is_visible, sort_order: m.sort_order, max_tokens: m.max_tokens, supports_streaming: m.supports_streaming, supports_vision: m.supports_vision })
    } else {
      setEditingModel(null)
      setModelForm({ provider_id: providers[0]?.id || '', model_id: '', display_name: '', description: '', icon_url: '', system_prompt: '', is_visible: true, sort_order: models.length, max_tokens: 4096, supports_streaming: true, supports_vision: false })
    }
    setShowModelForm(true)
  }

  const saveModel = async () => {
    setSaving(true)
    if (editingModel) {
      const res = await fetch('/api/admin/models', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingModel.id, ...modelForm }) })
      if (res.ok) { await loadData(); setShowModelForm(false); setStatusMsg('Modelo actualizado') }
    } else {
      const res = await fetch('/api/admin/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(modelForm) })
      if (res.ok) { await loadData(); setShowModelForm(false); setStatusMsg('Modelo creado') }
    }
    setSaving(false)
    setTimeout(() => setStatusMsg(''), 2000)
  }

  const deleteModel = async (id: string) => {
    const res = await fetch('/api/admin/models', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    if (res.ok) { setModels(models.filter(m => m.id !== id)); setStatusMsg('Modelo eliminado') }
    setTimeout(() => setStatusMsg(''), 2000)
  }

  const moveModel = async (id: string, direction: 'up' | 'down') => {
    const idx = models.findIndex(m => m.id === id)
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === models.length - 1)) return
    const newModels = [...models]
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    ;[newModels[idx], newModels[swapIdx]] = [newModels[swapIdx], newModels[idx]]
    // Update sort orders
    const updates = newModels.map((m, i) => ({ id: m.id, sort_order: i }))
    setModels(newModels.map((m, i) => ({ ...m, sort_order: i })))
    for (const u of updates) {
      await fetch('/api/admin/models', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(u) })
    }
  }

  const toggleModelVisibility = async (id: string, current: boolean) => {
    const res = await fetch('/api/admin/models', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_visible: !current }) })
    if (res.ok) { setModels(models.map(m => m.id === id ? { ...m, is_visible: !current } : m)) }
  }

  const PROVIDER_TYPES = [
    { value: 'openai', label: 'OpenAI', url: 'https://api.openai.com/v1' },
    { value: 'gemini', label: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta' },
    { value: 'anthropic', label: 'Anthropic', url: 'https://api.anthropic.com/v1' },
    { value: 'ollama', label: 'Ollama (Local)', url: 'http://localhost:11434/v1' },
    { value: 'mistral', label: 'Mistral AI', url: 'https://api.mistral.ai/v1' },
    { value: 'groq', label: 'Groq', url: 'https://api.groq.com/openai/v1' },
    { value: 'openrouter', label: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
    { value: 'custom', label: 'Custom (OpenAI Compatible)', url: '' },
  ]

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-zinc-400" size={24} /></div>

  return (
    <div className="space-y-4">
      {statusMsg && (
        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
          <Check size={14} /> {statusMsg}
        </div>
      )}

      {/* Admin sub-tabs */}
      <div className="flex gap-1 border-b border-zinc-200 pb-2">
        {([
          { id: 'users' as AdminTab, label: 'Usuarios', icon: <Users size={14} /> },
          { id: 'models' as AdminTab, label: 'Modelos', icon: <Bot size={14} /> },
          { id: 'providers' as AdminTab, label: 'Proveedores IA', icon: <Plug size={14} /> },
        ]).map(t => (
          <button key={t.id} onClick={() => setAdminTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${adminTab === t.id ? 'bg-zinc-100 text-zinc-900 font-medium' : 'text-zinc-500 hover:bg-zinc-50'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* USERS TAB */}
      {adminTab === 'users' && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500">{users.length} usuarios registrados</p>
          <div className="border border-zinc-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Nombre</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Email</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Rol</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="px-3 py-2">
                      {editingUser === u.id ? (
                        <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-2 py-1 border border-zinc-300 rounded text-xs" />
                      ) : (
                        <span className="text-zinc-700">{u.name || <span className="text-zinc-400 italic">Sin nombre</span>}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-500">{u.email}</td>
                    <td className="px-3 py-2">
                      {editingUser === u.id ? (
                        <select value={editRole} onChange={e => setEditRole(e.target.value)} className="px-2 py-1 border border-zinc-300 rounded text-xs">
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      ) : (
                        <span className={`px-2 py-0.5 rounded text-[10px] ${u.role === 'admin' ? 'bg-purple-50 text-purple-600' : 'bg-zinc-100 text-zinc-500'}`}>{u.role}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        {editingUser === u.id ? (
                          <>
                            <button onClick={() => saveUser(u.id)} disabled={saving} className="p-1 hover:bg-emerald-50 rounded text-emerald-600"><Check size={14} /></button>
                            <button onClick={() => setEditingUser(null)} className="p-1 hover:bg-zinc-100 rounded text-zinc-400"><X size={14} /></button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEditUser(u)} className="p-1 hover:bg-zinc-100 rounded text-zinc-400" title="Editar"><Edit3 size={14} /></button>
                            {confirmDelete === u.id ? (
                              <div className="flex items-center gap-1">
                                <button onClick={() => deleteUser(u.id)} disabled={saving} className="px-2 py-0.5 bg-red-500 text-white rounded text-[10px]">Confirmar</button>
                                <button onClick={() => setConfirmDelete(null)} className="px-2 py-0.5 bg-zinc-200 rounded text-[10px]">Cancelar</button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmDelete(u.id)} className="p-1 hover:bg-red-50 rounded text-zinc-400 hover:text-red-500" title="Eliminar"><Trash2 size={14} /></button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODELS TAB */}
      {adminTab === 'models' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">{models.length} modelos configurados</p>
            <button onClick={() => openModelForm()} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-500"><Plus size={12} /> Añadir modelo</button>
          </div>

          {showModelForm && (
            <div className="border border-blue-200 bg-blue-50/50 rounded-xl p-3 space-y-3">
              <p className="text-xs font-medium text-zinc-800">{editingModel ? 'Editar modelo' : 'Nuevo modelo'}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-zinc-500 mb-1 block">Proveedor</label>
                  <select value={modelForm.provider_id} onChange={e => setModelForm({ ...modelForm, provider_id: e.target.value })} className="w-full px-2 py-1.5 border border-zinc-300 rounded text-xs bg-white">
                    <option value="">Seleccionar...</option>
                    {providers.map(p => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 mb-1 block">ID del modelo</label>
                  <input value={modelForm.model_id} onChange={e => setModelForm({ ...modelForm, model_id: e.target.value })} className="w-full px-2 py-1.5 border border-zinc-300 rounded text-xs" placeholder="gpt-4o, gemini-pro..." />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 mb-1 block">Nombre visible</label>
                  <input value={modelForm.display_name} onChange={e => setModelForm({ ...modelForm, display_name: e.target.value })} className="w-full px-2 py-1.5 border border-zinc-300 rounded text-xs" placeholder="GPT-4o" />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 mb-1 block">URL del icono</label>
                  <input value={modelForm.icon_url} onChange={e => setModelForm({ ...modelForm, icon_url: e.target.value })} className="w-full px-2 py-1.5 border border-zinc-300 rounded text-xs" placeholder="/logo.png" />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-zinc-500 mb-1 block">Descripción</label>
                  <input value={modelForm.description} onChange={e => setModelForm({ ...modelForm, description: e.target.value })} className="w-full px-2 py-1.5 border border-zinc-300 rounded text-xs" placeholder="Modelo rápido y eficiente..." />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-zinc-500 mb-1 block">Instrucciones del sistema (system prompt)</label>
                  <textarea value={modelForm.system_prompt} onChange={e => setModelForm({ ...modelForm, system_prompt: e.target.value })} className="w-full px-2 py-1.5 border border-zinc-300 rounded text-xs h-16 resize-none" placeholder="Eres un asistente..." />
                </div>
                <div className="flex items-center gap-4 col-span-2">
                  <label className="flex items-center gap-1.5 text-xs text-zinc-600 cursor-pointer">
                    <input type="checkbox" checked={modelForm.is_visible} onChange={e => setModelForm({ ...modelForm, is_visible: e.target.checked })} className="rounded" /> Visible
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-zinc-600 cursor-pointer">
                    <input type="checkbox" checked={modelForm.supports_streaming} onChange={e => setModelForm({ ...modelForm, supports_streaming: e.target.checked })} className="rounded" /> Streaming
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-zinc-600 cursor-pointer">
                    <input type="checkbox" checked={modelForm.supports_vision} onChange={e => setModelForm({ ...modelForm, supports_vision: e.target.checked })} className="rounded" /> Visión
                  </label>
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-zinc-600">Max tokens:</label>
                    <input type="number" value={modelForm.max_tokens} onChange={e => setModelForm({ ...modelForm, max_tokens: parseInt(e.target.value) || 4096 })} className="w-20 px-2 py-1 border border-zinc-300 rounded text-xs" />
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveModel} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-500 disabled:opacity-50">
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Guardar
                </button>
                <button onClick={() => setShowModelForm(false)} className="px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 rounded-lg">Cancelar</button>
              </div>
            </div>
          )}

          <div className="space-y-1">
            {models.map((m, idx) => (
              <div key={m.id} className={`flex items-center gap-3 px-3 py-2 border rounded-xl transition-colors ${m.is_visible ? 'border-zinc-200 bg-white' : 'border-zinc-200 bg-zinc-50 opacity-60'}`}>
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => moveModel(m.id, 'up')} disabled={idx === 0} className="p-0.5 hover:bg-zinc-100 rounded text-zinc-400 disabled:opacity-30"><ArrowUp size={10} /></button>
                  <button onClick={() => moveModel(m.id, 'down')} disabled={idx === models.length - 1} className="p-0.5 hover:bg-zinc-100 rounded text-zinc-400 disabled:opacity-30"><ArrowDown size={10} /></button>
                </div>
                {m.icon_url ? <img src={m.icon_url} alt="" className="w-6 h-6 rounded-full shrink-0" /> : <Bot size={16} className="text-zinc-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-zinc-800 truncate">{m.display_name}</p>
                  <p className="text-[10px] text-zinc-400 truncate">{m.model_id} · {m.provider_name || 'Sin proveedor'}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => toggleModelVisibility(m.id, m.is_visible)} className={`p-1 rounded ${m.is_visible ? 'text-emerald-500 hover:bg-emerald-50' : 'text-zinc-400 hover:bg-zinc-100'}`} title={m.is_visible ? 'Ocultar' : 'Mostrar'}>
                    {m.is_visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button onClick={() => openModelForm(m)} className="p-1 hover:bg-zinc-100 rounded text-zinc-400"><Edit3 size={14} /></button>
                  <button onClick={() => deleteModel(m.id)} className="p-1 hover:bg-red-50 rounded text-zinc-400 hover:text-red-500"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
            {models.length === 0 && (
              <div className="text-center py-6 text-zinc-400 text-xs">
                <Bot size={24} className="mx-auto mb-2 opacity-50" />
                No hay modelos configurados. Añade uno para empezar.
              </div>
            )}
          </div>
        </div>
      )}


      {/* PROVIDERS TAB */}
      {adminTab === 'providers' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">{providers.length} proveedores configurados</p>
            <button onClick={() => openProviderForm()} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-500"><Plus size={12} /> Añadir proveedor</button>
          </div>

          {showProviderForm && (
            <div className="border border-blue-200 bg-blue-50/50 rounded-xl p-3 space-y-3">
              <p className="text-xs font-medium text-zinc-800">{editingProvider ? 'Editar proveedor' : 'Nuevo proveedor'}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-zinc-500 mb-1 block">Nombre</label>
                  <input value={providerForm.name} onChange={e => setProviderForm({ ...providerForm, name: e.target.value })} className="w-full px-2 py-1.5 border border-zinc-300 rounded text-xs" placeholder="Mi OpenAI" />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 mb-1 block">Tipo</label>
                  <select value={providerForm.type} onChange={e => {
                    const t = PROVIDER_TYPES.find(pt => pt.value === e.target.value)
                    setProviderForm({ ...providerForm, type: e.target.value, base_url: t?.url || providerForm.base_url })
                  }} className="w-full px-2 py-1.5 border border-zinc-300 rounded text-xs bg-white">
                    {PROVIDER_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-zinc-500 mb-1 block">URL Base</label>
                  <input value={providerForm.base_url} onChange={e => setProviderForm({ ...providerForm, base_url: e.target.value })} className="w-full px-2 py-1.5 border border-zinc-300 rounded text-xs" placeholder="https://api.openai.com/v1" />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-zinc-500 mb-1 block">API Key</label>
                  <input type="password" value={providerForm.api_key} onChange={e => setProviderForm({ ...providerForm, api_key: e.target.value })} className="w-full px-2 py-1.5 border border-zinc-300 rounded text-xs" placeholder="sk-..." />
                </div>
                <div className="flex items-center gap-4 col-span-2">
                  <label className="flex items-center gap-1.5 text-xs text-zinc-600 cursor-pointer">
                    <input type="checkbox" checked={providerForm.is_enabled} onChange={e => setProviderForm({ ...providerForm, is_enabled: e.target.checked })} className="rounded" /> Habilitado
                  </label>
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-zinc-600">Prioridad:</label>
                    <input type="number" value={providerForm.priority} onChange={e => setProviderForm({ ...providerForm, priority: parseInt(e.target.value) || 0 })} className="w-16 px-2 py-1 border border-zinc-300 rounded text-xs" />
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveProvider} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-500 disabled:opacity-50">
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Guardar
                </button>
                <button onClick={() => setShowProviderForm(false)} className="px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 rounded-lg">Cancelar</button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {providers.map(p => (
              <div key={p.id} className={`flex items-center gap-3 px-3 py-3 border rounded-xl transition-colors ${p.is_enabled ? 'border-zinc-200 bg-white' : 'border-zinc-200 bg-zinc-50 opacity-60'}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                  p.type === 'openai' ? 'bg-emerald-50 text-emerald-600' :
                  p.type === 'gemini' ? 'bg-blue-50 text-blue-600' :
                  p.type === 'anthropic' ? 'bg-orange-50 text-orange-600' :
                  p.type === 'ollama' ? 'bg-purple-50 text-purple-600' :
                  'bg-zinc-100 text-zinc-600'
                }`}>
                  {p.type.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-zinc-800">{p.name}</p>
                  <p className="text-[10px] text-zinc-400 truncate">{p.type} · {p.base_url}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${p.is_enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-100 text-zinc-400'}`}>
                    {p.is_enabled ? 'Activo' : 'Inactivo'}
                  </span>
                  <button onClick={() => openProviderForm(p)} className="p-1 hover:bg-zinc-100 rounded text-zinc-400"><Edit3 size={14} /></button>
                  <button onClick={() => deleteProvider(p.id)} className="p-1 hover:bg-red-50 rounded text-zinc-400 hover:text-red-500"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
            {providers.length === 0 && (
              <div className="text-center py-6 text-zinc-400 text-xs">
                <Plug size={24} className="mx-auto mb-2 opacity-50" />
                No hay proveedores. Añade uno para conectar modelos de IA.
              </div>
            )}
          </div>

          {/* Provider type info */}
          <div className="border border-zinc-200 rounded-xl p-3 bg-zinc-50">
            <p className="text-xs font-medium text-zinc-700 mb-2">Tipos de proveedor soportados</p>
            <div className="grid grid-cols-2 gap-1.5">
              {PROVIDER_TYPES.map(pt => (
                <div key={pt.value} className="flex items-center gap-2 text-[10px] text-zinc-500">
                  <ChevronRight size={10} className="text-zinc-300" /> <span className="font-medium">{pt.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
