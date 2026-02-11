'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AIProvider, ModelConfig, DbConnection, DbSchemaTable, NetworkDrive } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft, Users, Bot, Plug, Trash2, Edit3, Plus, Eye, EyeOff,
  ArrowUp, ArrowDown, Shield, Loader2, Save, X, Check,
  ChevronRight, RefreshCw, MessageSquare, FileText, Database, GripVertical, Upload, HardDrive
} from 'lucide-react'

type AdminTab = 'dashboard' | 'users' | 'models' | 'providers' | 'connections' | 'network-drives'

interface UserRow {
  id: string
  name: string | null
  email: string
  role: string
  avatar_url: string | null
  created_at: string
}

interface Props {
  stats: { users: number; conversations: number; messages: number; files: number; chunks: number }
}

export default function AdminPageClient({ stats }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<AdminTab>('dashboard')
  const [users, setUsers] = useState<UserRow[]>([])
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [models, setModels] = useState<ModelConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [syncing, setSyncing] = useState(false)

  // Provider form
  const [showProviderForm, setShowProviderForm] = useState(false)
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null)
  const [providerForm, setProviderForm] = useState({ name: '', type: 'openai', base_url: 'https://api.openai.com/v1', api_key: '', is_enabled: true, priority: 0 })

  // Model form
  const [showModelForm, setShowModelForm] = useState(false)
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null)
  const [modelForm, setModelForm] = useState({
    provider_id: '', model_id: '', display_name: '', description: '', icon_url: '',
    system_prompt: '', is_visible: true, sort_order: 0, max_tokens: 4096, use_max_tokens: false,
    supports_streaming: true, supports_vision: false
  })
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [iconPreview, setIconPreview] = useState<string>('')
  const [uploadingIcon, setUploadingIcon] = useState(false)
  const iconInputRef = useRef<HTMLInputElement>(null)

  // DB Connections
  const [connections, setConnections] = useState<DbConnection[]>([])
  const [showConnForm, setShowConnForm] = useState(false)
  const [editingConn, setEditingConn] = useState<DbConnection | null>(null)
  const [connForm, setConnForm] = useState({ name: '', description: '', db_type: 'mssql', host: '', port: 1433, database_name: '', username: '', password: '' })
  const [syncingSchema, setSyncingSchema] = useState<string | null>(null)
  const [viewingSchema, setViewingSchema] = useState<string | null>(null)

  // Network Drives
  const [networkDrives, setNetworkDrives] = useState<NetworkDrive[]>([])
  const [showDriveForm, setShowDriveForm] = useState(false)
  const [editingDrive, setEditingDrive] = useState<NetworkDrive | null>(null)
  const [driveForm, setDriveForm] = useState({ name: '', unc_path: '', description: '', file_extensions: 'pdf,docx,xlsx,pptx,txt,csv,md,json,xml,html,doc,xls,ppt,rtf,log', max_file_size_mb: 50 })
  const [syncingDrive, setSyncingDrive] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<Record<string, unknown> | null>(null)

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

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [usersRes, providersRes, modelsRes, connsRes, drivesRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/providers'),
        fetch('/api/admin/models'),
        fetch('/api/admin/db-connections'),
        fetch('/api/admin/network-drives'),
      ])
      if (usersRes.ok) { const d = await usersRes.json(); setUsers(d.users || []) }
      if (providersRes.ok) { const d = await providersRes.json(); setProviders(d.providers || []) }
      if (modelsRes.ok) { const d = await modelsRes.json(); setModels(d.models || []) }
      if (connsRes.ok) { const d = await connsRes.json(); setConnections(d.connections || []) }
      if (drivesRes.ok) { const d = await drivesRes.json(); setNetworkDrives(d.drives || []) }
    } catch (e) { console.error('Failed to load admin data', e) }
    setLoading(false)
  }

  const showStatus = (msg: string) => { setStatusMsg(msg); setTimeout(() => setStatusMsg(''), 3000) }

  // === USER MANAGEMENT ===
  const startEditUser = (u: UserRow) => { setEditingUser(u.id); setEditName(u.name || ''); setEditRole(u.role) }
  const saveUser = async (userId: string) => {
    setSaving(true)
    const res = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, name: editName, role: editRole }) })
    if (res.ok) { setUsers(users.map(u => u.id === userId ? { ...u, name: editName, role: editRole } : u)); setEditingUser(null); showStatus('Usuario actualizado') }
    else showStatus('Error al actualizar')
    setSaving(false)
  }
  const deleteUser = async (userId: string) => {
    setSaving(true)
    const res = await fetch('/api/admin/users', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) })
    if (res.ok) { setUsers(users.filter(u => u.id !== userId)); setConfirmDelete(null); showStatus('Usuario eliminado') }
    else showStatus('Error al eliminar')
    setSaving(false)
  }

  // === SYNC MODELS FROM OPENAI ===
  const syncModels = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/admin/models/sync', { method: 'POST' })
      if (res.ok) { const d = await res.json(); showStatus(`Sincronizados ${d.synced} modelos nuevos (${d.total} total)`); await loadData() }
      else showStatus('Error al sincronizar')
    } catch { showStatus('Error al sincronizar') }
    setSyncing(false)
  }

  // === PROVIDER MANAGEMENT ===
  const openProviderForm = (p?: AIProvider) => {
    if (p) { setEditingProvider(p); setProviderForm({ name: p.name, type: p.type, base_url: p.base_url, api_key: p.api_key, is_enabled: p.is_enabled, priority: p.priority }) }
    else { setEditingProvider(null); setProviderForm({ name: '', type: 'openai', base_url: 'https://api.openai.com/v1', api_key: '', is_enabled: true, priority: 0 }) }
    setShowProviderForm(true)
  }
  const saveProvider = async () => {
    setSaving(true)
    const method = editingProvider ? 'PATCH' : 'POST'
    const body = editingProvider ? { id: editingProvider.id, ...providerForm } : providerForm
    const res = await fetch('/api/admin/providers', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) { await loadData(); setShowProviderForm(false); showStatus(editingProvider ? 'Proveedor actualizado' : 'Proveedor creado') }
    setSaving(false)
  }
  const deleteProvider = async (id: string) => {
    const res = await fetch('/api/admin/providers', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    if (res.ok) { setProviders(providers.filter(p => p.id !== id)); showStatus('Proveedor eliminado') }
  }

  // === MODEL MANAGEMENT ===
  const openModelForm = (m?: ModelConfig) => {
    if (m) {
      setEditingModel(m)
      setModelForm({ provider_id: m.provider_id, model_id: m.model_id, display_name: m.display_name, description: m.description, icon_url: m.icon_url, system_prompt: m.system_prompt, is_visible: m.is_visible, sort_order: m.sort_order, max_tokens: m.max_tokens, use_max_tokens: m.use_max_tokens ?? false, supports_streaming: m.supports_streaming, supports_vision: m.supports_vision })
      setIconPreview(m.icon_url || '')
    } else {
      setEditingModel(null)
      setModelForm({ provider_id: providers[0]?.id || '', model_id: '', display_name: '', description: '', icon_url: '', system_prompt: '', is_visible: true, sort_order: models.length, max_tokens: 4096, use_max_tokens: false, supports_streaming: true, supports_vision: false })
      setIconPreview('')
    }
    setIconFile(null)
    setShowModelForm(true)
  }
  const handleIconSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIconFile(file)
    setIconPreview(URL.createObjectURL(file))
  }
  const uploadIcon = async (): Promise<string> => {
    if (!iconFile) return modelForm.icon_url
    setUploadingIcon(true)
    try {
      const supabase = createClient()
      const ext = iconFile.name.split('.').pop() || 'png'
      const path = `model_${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('model-icons').upload(path, iconFile, { upsert: true })
      if (error) { console.error('Upload error:', error); return modelForm.icon_url }
      const { data: urlData } = supabase.storage.from('model-icons').getPublicUrl(path)
      return urlData.publicUrl
    } catch { return modelForm.icon_url }
    finally { setUploadingIcon(false) }
  }
  const saveModel = async () => {
    setSaving(true)
    // Upload icon if a new file was selected
    const finalIconUrl = await uploadIcon()
    const formData = { ...modelForm, icon_url: finalIconUrl }
    const method = editingModel ? 'PATCH' : 'POST'
    const body = editingModel ? { id: editingModel.id, ...formData } : formData
    const res = await fetch('/api/admin/models', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) { await loadData(); setShowModelForm(false); setIconFile(null); setIconPreview(''); showStatus(editingModel ? 'Modelo actualizado' : 'Modelo creado') }
    setSaving(false)
  }
  const deleteModel = async (id: string) => {
    const res = await fetch('/api/admin/models', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    if (res.ok) { setModels(models.filter(m => m.id !== id)); showStatus('Modelo eliminado') }
  }
  const moveModel = async (id: string, direction: 'up' | 'down') => {
    const idx = models.findIndex(m => m.id === id)
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === models.length - 1)) return
    const newModels = [...models]
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    ;[newModels[idx], newModels[swapIdx]] = [newModels[swapIdx], newModels[idx]]
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

  // === DB CONNECTIONS MANAGEMENT ===
  const openConnForm = (c?: DbConnection) => {
    if (c) {
      setEditingConn(c)
      setConnForm({ name: c.name, description: c.description, db_type: c.db_type, host: c.host, port: c.port, database_name: c.database_name, username: c.username, password: c.password })
    } else {
      setEditingConn(null)
      setConnForm({ name: '', description: '', db_type: 'mssql', host: '', port: 1433, database_name: '', username: '', password: '' })
    }
    setShowConnForm(true)
  }
  const saveConnection = async () => {
    setSaving(true)
    const method = editingConn ? 'PATCH' : 'POST'
    const body = editingConn ? { id: editingConn.id, ...connForm } : connForm
    const res = await fetch('/api/admin/db-connections', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) { await loadData(); setShowConnForm(false); showStatus(editingConn ? 'Conexión actualizada' : 'Conexión creada') }
    else { const d = await res.json(); showStatus(d.error || 'Error') }
    setSaving(false)
  }
  const deleteConnection = async (id: string) => {
    const res = await fetch('/api/admin/db-connections', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_active: false }) })
    if (res.ok) { setConnections(connections.filter(c => c.id !== id)); showStatus('Conexión eliminada') }
  }
  const toggleConnection = async (id: string, current: boolean) => {
    const res = await fetch('/api/admin/db-connections', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_active: !current }) })
    if (res.ok) { setConnections(connections.map(c => c.id === id ? { ...c, is_active: !current } : c)) }
  }
  const syncSchema = async (connId: string) => {
    setSyncingSchema(connId)
    try {
      const res = await fetch('/api/admin/db-connections/sync-schema', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connection_id: connId }) })
      if (res.ok) { const d = await res.json(); showStatus(`Esquema sincronizado: ${d.table_count} tablas`); await loadData() }
      else { const d = await res.json(); showStatus(d.error || 'Error al sincronizar esquema') }
    } catch { showStatus('Error al sincronizar esquema') }
    setSyncingSchema(null)
  }

  // Network drive management functions
  const openDriveForm = (drive?: NetworkDrive) => {
    if (drive) {
      setEditingDrive(drive)
      setDriveForm({ name: drive.name, unc_path: drive.unc_path, description: drive.description || '', file_extensions: drive.file_extensions?.join(',') || '', max_file_size_mb: drive.max_file_size_mb || 50 })
    } else {
      setEditingDrive(null)
      setDriveForm({ name: '', unc_path: '', description: '', file_extensions: 'pdf,docx,xlsx,pptx,txt,csv,md,json,xml,html,doc,xls,ppt,rtf,log', max_file_size_mb: 50 })
    }
    setShowDriveForm(true)
  }
  const saveDrive = async () => {
    setSaving(true)
    const method = editingDrive ? 'PATCH' : 'POST'
    const payload = {
      ...(editingDrive ? { id: editingDrive.id } : {}),
      name: driveForm.name,
      unc_path: driveForm.unc_path,
      description: driveForm.description,
      file_extensions: driveForm.file_extensions.split(',').map(e => e.trim()).filter(Boolean),
      max_file_size_mb: driveForm.max_file_size_mb,
    }
    const res = await fetch('/api/admin/network-drives', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (res.ok) { await loadData(); setShowDriveForm(false); showStatus(editingDrive ? 'Unidad actualizada' : 'Unidad creada') }
    else { const d = await res.json(); showStatus(d.error || 'Error') }
    setSaving(false)
  }
  const deleteDrive = async (id: string) => {
    const res = await fetch('/api/admin/network-drives', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_active: false }) })
    if (res.ok) { setNetworkDrives(networkDrives.filter(d => d.id !== id)); showStatus('Unidad eliminada') }
  }
  const toggleDrive = async (id: string, current: boolean) => {
    const res = await fetch('/api/admin/network-drives', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_active: !current }) })
    if (res.ok) { setNetworkDrives(networkDrives.map(d => d.id === id ? { ...d, is_active: !current } : d)) }
  }
  const syncDrive = async (driveId: string) => {
    setSyncingDrive(driveId)
    setSyncResult(null)
    try {
      const res = await fetch('/api/admin/network-drives/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ drive_id: driveId }) })
      const data = await res.json()
      if (res.ok) {
        setSyncResult(data)
        showStatus(`Sincronización completada: ${data.stats?.new_files || 0} nuevos, ${data.stats?.updated_files || 0} actualizados`)
        await loadData()
      } else {
        showStatus(data.error || 'Error al sincronizar')
      }
    } catch { showStatus('Error al sincronizar unidad de red') }
    setSyncingDrive(null)
  }

  const statCards = [
    { label: 'Usuarios', value: stats.users, icon: <Users size={20} />, color: 'text-blue-600 bg-blue-50' },
    { label: 'Conversaciones', value: stats.conversations, icon: <MessageSquare size={20} />, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Mensajes', value: stats.messages, icon: <MessageSquare size={20} />, color: 'text-purple-600 bg-purple-50' },
    { label: 'Archivos', value: stats.files, icon: <FileText size={20} />, color: 'text-yellow-600 bg-yellow-50' },
    { label: 'Chunks RAG', value: stats.chunks, icon: <Database size={20} />, color: 'text-red-600 bg-red-50' },
  ]

  const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <Shield size={16} /> },
    { id: 'users', label: 'Usuarios', icon: <Users size={16} /> },
    { id: 'models', label: 'Modelos', icon: <Bot size={16} /> },
    { id: 'providers', label: 'Proveedores IA', icon: <Plug size={16} /> },
    { id: 'connections', label: 'Conexiones BD', icon: <Database size={16} /> },
    { id: 'network-drives', label: 'Unidades de Red', icon: <HardDrive size={16} /> },
  ]

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 px-6 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.push('/chat')} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-500 transition-colors"><ArrowLeft size={18} /></button>
        <Shield size={20} className="text-purple-500" />
        <h1 className="text-base font-semibold text-zinc-800">Panel de Administración</h1>
        <div className="flex-1" />
        {statusMsg && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 animate-in">
            <Check size={14} /> {statusMsg}
          </div>
        )}
      </header>

      <div className="flex">
        {/* Sidebar tabs */}
        <nav className="w-52 bg-white border-r border-zinc-200 min-h-[calc(100vh-49px)] p-3 space-y-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`w-full text-left px-3 py-2.5 text-sm rounded-lg flex items-center gap-2.5 transition-colors ${tab === t.id ? 'bg-zinc-100 text-zinc-900 font-medium' : 'text-zinc-500 hover:bg-zinc-50'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 p-6 max-w-5xl">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-zinc-400" size={28} /></div>
          ) : (
            <>
              {/* DASHBOARD TAB */}
              {tab === 'dashboard' && (
                <div>
                  <h2 className="text-lg font-semibold text-zinc-800 mb-4">Dashboard</h2>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {statCards.map(s => (
                      <div key={s.label} className="bg-white border border-zinc-200 rounded-xl p-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${s.color}`}>{s.icon}</div>
                        <p className="text-2xl font-bold text-zinc-800">{s.value.toLocaleString()}</p>
                        <p className="text-xs text-zinc-500">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* USERS TAB */}
              {tab === 'users' && renderUsersTab()}

              {/* MODELS TAB */}
              {tab === 'models' && renderModelsTab()}

              {/* PROVIDERS TAB */}
              {tab === 'providers' && renderProvidersTab()}

              {/* CONNECTIONS TAB */}
              {tab === 'connections' && renderConnectionsTab()}

              {/* NETWORK DRIVES TAB */}
              {tab === 'network-drives' && renderNetworkDrivesTab()}
            </>
          )}
        </main>
      </div>
    </div>
  )

  // ======= RENDER FUNCTIONS =======

  function renderUsersTab() {
    return (
      <div>
        <h2 className="text-lg font-semibold text-zinc-800 mb-4">Usuarios ({users.length})</h2>
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200">
                <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Nombre</th>
                <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Email</th>
                <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Rol</th>
                <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Creado</th>
                <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-zinc-100 hover:bg-zinc-50/50">
                  <td className="px-4 py-3">
                    {editingUser === u.id ? (
                      <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-2 py-1 border border-zinc-300 rounded text-sm" />
                    ) : (
                      <span className="text-zinc-700">{u.name || <span className="text-zinc-400 italic">Sin nombre</span>}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{u.email}</td>
                  <td className="px-4 py-3">
                    {editingUser === u.id ? (
                      <select value={editRole} onChange={e => setEditRole(e.target.value)} className="px-2 py-1 border border-zinc-300 rounded text-sm">
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    ) : (
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${u.role === 'admin' ? 'bg-purple-50 text-purple-600' : 'bg-zinc-100 text-zinc-500'}`}>{u.role}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{new Date(u.created_at).toLocaleDateString('es-ES')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {editingUser === u.id ? (
                        <>
                          <button onClick={() => saveUser(u.id)} disabled={saving} className="p-1.5 hover:bg-emerald-50 rounded-lg text-emerald-600"><Check size={14} /></button>
                          <button onClick={() => setEditingUser(null)} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400"><X size={14} /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEditUser(u)} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400" title="Editar"><Edit3 size={14} /></button>
                          {confirmDelete === u.id ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => deleteUser(u.id)} disabled={saving} className="px-2 py-1 bg-red-500 text-white rounded text-xs">Confirmar</button>
                              <button onClick={() => setConfirmDelete(null)} className="px-2 py-1 bg-zinc-200 rounded text-xs">Cancelar</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDelete(u.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-500" title="Eliminar"><Trash2 size={14} /></button>
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
    )
  }

  function renderModelsTab() {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-800">Modelos ({models.length})</h2>
          <div className="flex gap-2">
            <button onClick={syncModels} disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-500 disabled:opacity-50 transition-colors">
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Sincronizar con OpenAI
            </button>
            <button onClick={() => openModelForm()}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors">
              <Plus size={14} /> Añadir modelo
            </button>
          </div>
        </div>

        {/* Model edit form */}
        {showModelForm && (
          <div className="bg-white border border-blue-200 rounded-xl p-4 mb-4 space-y-3">
            <p className="text-sm font-medium text-zinc-800">{editingModel ? 'Editar modelo' : 'Nuevo modelo'}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Proveedor</label>
                <select value={modelForm.provider_id} onChange={e => setModelForm({ ...modelForm, provider_id: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white">
                  <option value="">Seleccionar...</option>
                  {providers.map(p => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">ID del modelo</label>
                <input value={modelForm.model_id} onChange={e => setModelForm({ ...modelForm, model_id: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="gpt-4o" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Nombre visible</label>
                <input value={modelForm.display_name} onChange={e => setModelForm({ ...modelForm, display_name: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="GPT-4o" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Imagen del modelo</label>
                <div className="flex items-center gap-3">
                  {iconPreview ? (
                    <img src={iconPreview} alt="" className="w-10 h-10 rounded-lg object-cover border border-zinc-200" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center justify-center">
                      <Bot size={18} className="text-zinc-400" />
                    </div>
                  )}
                  <input ref={iconInputRef} type="file" accept="image/*" onChange={handleIconSelect} className="hidden" />
                  <button type="button" onClick={() => iconInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-2 border border-zinc-300 rounded-lg text-sm text-zinc-600 hover:bg-zinc-50 transition-colors">
                    {uploadingIcon ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {iconPreview ? 'Cambiar imagen' : 'Subir imagen'}
                  </button>
                  {iconPreview && (
                    <button type="button" onClick={() => { setIconFile(null); setIconPreview(''); setModelForm({ ...modelForm, icon_url: '' }) }}
                      className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-zinc-500 mb-1 block">Descripción</label>
                <input value={modelForm.description} onChange={e => setModelForm({ ...modelForm, description: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="Modelo rápido y eficiente..." />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-zinc-500 mb-1 block">Instrucciones del sistema</label>
                <textarea value={modelForm.system_prompt} onChange={e => setModelForm({ ...modelForm, system_prompt: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm h-20 resize-none" placeholder="Eres un asistente..." />
              </div>
              <div className="flex items-center gap-6 col-span-2 flex-wrap">
                <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
                  <input type="checkbox" checked={modelForm.is_visible} onChange={e => setModelForm({ ...modelForm, is_visible: e.target.checked })} className="rounded" /> Visible
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
                  <input type="checkbox" checked={modelForm.supports_streaming} onChange={e => setModelForm({ ...modelForm, supports_streaming: e.target.checked })} className="rounded" /> Streaming
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
                  <input type="checkbox" checked={modelForm.supports_vision} onChange={e => setModelForm({ ...modelForm, supports_vision: e.target.checked })} className="rounded" /> Visión
                </label>
              </div>
              <div className="col-span-2 flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
                  <input type="checkbox" checked={modelForm.use_max_tokens} onChange={e => setModelForm({ ...modelForm, use_max_tokens: e.target.checked })} className="rounded" /> Limitar tokens
                </label>
                {modelForm.use_max_tokens && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-zinc-600">Max tokens:</label>
                    <input type="number" value={modelForm.max_tokens} onChange={e => setModelForm({ ...modelForm, max_tokens: parseInt(e.target.value) || 4096 })} className="w-28 px-2 py-1.5 border border-zinc-300 rounded-lg text-sm" />
                  </div>
                )}
                {!modelForm.use_max_tokens && (
                  <span className="text-xs text-zinc-400">Sin límite de tokens (recomendado)</span>
                )}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={saveModel} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
              </button>
              <button onClick={() => setShowModelForm(false)} className="px-4 py-2 text-sm text-zinc-500 hover:bg-zinc-100 rounded-lg">Cancelar</button>
            </div>
          </div>
        )}

        {/* Models list */}
        <div className="space-y-1.5">
          {models.map((m, idx) => (
            <div key={m.id} className={`flex items-center gap-3 px-4 py-3 bg-white border rounded-xl transition-colors ${m.is_visible ? 'border-zinc-200' : 'border-zinc-200 opacity-50'}`}>
              <div className="flex flex-col gap-0.5">
                <button onClick={() => moveModel(m.id, 'up')} disabled={idx === 0} className="p-0.5 hover:bg-zinc-100 rounded text-zinc-400 disabled:opacity-20"><ArrowUp size={12} /></button>
                <button onClick={() => moveModel(m.id, 'down')} disabled={idx === models.length - 1} className="p-0.5 hover:bg-zinc-100 rounded text-zinc-400 disabled:opacity-20"><ArrowDown size={12} /></button>
              </div>
              <GripVertical size={14} className="text-zinc-300" />
              {m.icon_url ? <img src={m.icon_url} alt="" className="w-7 h-7 rounded-lg shrink-0 object-cover" /> : <Bot size={18} className="text-zinc-400 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-800 truncate">{m.display_name}</p>
                <p className="text-xs text-zinc-400 truncate">{m.model_id} · {m.provider_name || 'Sin proveedor'}{m.description ? ` · ${m.description}` : ''}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => toggleModelVisibility(m.id, m.is_visible)} className={`p-1.5 rounded-lg ${m.is_visible ? 'text-emerald-500 hover:bg-emerald-50' : 'text-zinc-400 hover:bg-zinc-100'}`} title={m.is_visible ? 'Ocultar' : 'Mostrar'}>
                  {m.is_visible ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
                <button onClick={() => openModelForm(m)} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400"><Edit3 size={15} /></button>
                <button onClick={() => deleteModel(m.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-500"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
          {models.length === 0 && (
            <div className="text-center py-12 bg-white border border-zinc-200 rounded-xl">
              <Bot size={32} className="mx-auto mb-3 text-zinc-300" />
              <p className="text-sm text-zinc-500 mb-1">No hay modelos configurados</p>
              <p className="text-xs text-zinc-400">Haz clic en &quot;Sincronizar con OpenAI&quot; para importar los modelos de tu cuenta</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderProvidersTab() {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-800">Proveedores IA ({providers.length})</h2>
          <button onClick={() => openProviderForm()}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors">
            <Plus size={14} /> Añadir proveedor
          </button>
        </div>

        {showProviderForm && (
          <div className="bg-white border border-blue-200 rounded-xl p-4 mb-4 space-y-3">
            <p className="text-sm font-medium text-zinc-800">{editingProvider ? 'Editar proveedor' : 'Nuevo proveedor'}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Nombre</label>
                <input value={providerForm.name} onChange={e => setProviderForm({ ...providerForm, name: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="Mi OpenAI" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Tipo</label>
                <select value={providerForm.type} onChange={e => {
                  const t = PROVIDER_TYPES.find(pt => pt.value === e.target.value)
                  setProviderForm({ ...providerForm, type: e.target.value, base_url: t?.url || providerForm.base_url })
                }} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white">
                  {PROVIDER_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-zinc-500 mb-1 block">URL Base</label>
                <input value={providerForm.base_url} onChange={e => setProviderForm({ ...providerForm, base_url: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-zinc-500 mb-1 block">API Key</label>
                <input type="password" value={providerForm.api_key} onChange={e => setProviderForm({ ...providerForm, api_key: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="sk-..." />
              </div>
              <div className="flex items-center gap-6 col-span-2">
                <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
                  <input type="checkbox" checked={providerForm.is_enabled} onChange={e => setProviderForm({ ...providerForm, is_enabled: e.target.checked })} className="rounded" /> Habilitado
                </label>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-zinc-600">Prioridad:</label>
                  <input type="number" value={providerForm.priority} onChange={e => setProviderForm({ ...providerForm, priority: parseInt(e.target.value) || 0 })} className="w-20 px-2 py-1.5 border border-zinc-300 rounded-lg text-sm" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={saveProvider} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
              </button>
              <button onClick={() => setShowProviderForm(false)} className="px-4 py-2 text-sm text-zinc-500 hover:bg-zinc-100 rounded-lg">Cancelar</button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {providers.map(p => (
            <div key={p.id} className={`flex items-center gap-3 px-4 py-3 bg-white border rounded-xl transition-colors ${p.is_enabled ? 'border-zinc-200' : 'border-zinc-200 opacity-50'}`}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${
                p.type === 'openai' ? 'bg-emerald-50 text-emerald-600' :
                p.type === 'gemini' ? 'bg-blue-50 text-blue-600' :
                p.type === 'anthropic' ? 'bg-orange-50 text-orange-600' :
                p.type === 'ollama' ? 'bg-purple-50 text-purple-600' :
                'bg-zinc-100 text-zinc-600'
              }`}>
                {p.type.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-800">{p.name}</p>
                <p className="text-xs text-zinc-400 truncate">{p.type} · {p.base_url}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`px-2 py-0.5 rounded text-xs ${p.is_enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-100 text-zinc-400'}`}>
                  {p.is_enabled ? 'Activo' : 'Inactivo'}
                </span>
                <button onClick={() => openProviderForm(p)} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400"><Edit3 size={15} /></button>
                <button onClick={() => deleteProvider(p.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-500"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
          {providers.length === 0 && (
            <div className="text-center py-12 bg-white border border-zinc-200 rounded-xl">
              <Plug size={32} className="mx-auto mb-3 text-zinc-300" />
              <p className="text-sm text-zinc-500">No hay proveedores configurados</p>
              <p className="text-xs text-zinc-400 mt-1">Añade un proveedor para conectar modelos de IA</p>
            </div>
          )}
        </div>

        {/* Provider types info */}
        <div className="bg-white border border-zinc-200 rounded-xl p-4 mt-4">
          <p className="text-sm font-medium text-zinc-700 mb-3">Tipos de proveedor soportados</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {PROVIDER_TYPES.map(pt => (
              <div key={pt.value} className="flex items-center gap-2 text-xs text-zinc-500">
                <ChevronRight size={12} className="text-zinc-300" /> <span className="font-medium">{pt.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  function renderConnectionsTab() {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-800">Conexiones BD ({connections.length})</h2>
          <button onClick={() => openConnForm()}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors">
            <Plus size={14} /> Añadir conexión
          </button>
        </div>

        {showConnForm && (
          <div className="bg-white border border-blue-200 rounded-xl p-4 mb-4 space-y-3">
            <p className="text-sm font-medium text-zinc-800">{editingConn ? 'Editar conexión' : 'Nueva conexión'}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Nombre</label>
                <input value={connForm.name} onChange={e => setConnForm({ ...connForm, name: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="BD Visual Form" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Tipo de BD</label>
                <select value={connForm.db_type} onChange={e => setConnForm({ ...connForm, db_type: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white">
                  <option value="mssql">SQL Server</option>
                  <option value="mysql">MySQL</option>
                  <option value="postgresql">PostgreSQL</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Host / IP</label>
                <input value={connForm.host} onChange={e => setConnForm({ ...connForm, host: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="192.168.3.203" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Puerto</label>
                <input type="number" value={connForm.port} onChange={e => setConnForm({ ...connForm, port: parseInt(e.target.value) || 1433 })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Nombre de la BD</label>
                <input value={connForm.database_name} onChange={e => setConnForm({ ...connForm, database_name: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="Dejar vacío para descubrir" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Usuario</label>
                <input value={connForm.username} onChange={e => setConnForm({ ...connForm, username: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="vform" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-zinc-500 mb-1 block">Contraseña</label>
                <input type="password" value={connForm.password} onChange={e => setConnForm({ ...connForm, password: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-zinc-500 mb-1 block">Descripción</label>
                <input value={connForm.description} onChange={e => setConnForm({ ...connForm, description: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="Servidor de producción..." />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={saveConnection} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
              </button>
              <button onClick={() => setShowConnForm(false)} className="px-4 py-2 text-sm text-zinc-500 hover:bg-zinc-100 rounded-lg">Cancelar</button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {connections.map(c => (
            <div key={c.id} className={`bg-white border rounded-xl transition-colors ${c.is_active ? 'border-zinc-200' : 'border-zinc-200 opacity-50'}`}>
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Database size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-800">{c.name}</p>
                  <p className="text-xs text-zinc-400 truncate">
                    {c.db_type.toUpperCase()} · {c.host}:{c.port}{c.database_name ? ` · ${c.database_name}` : ''} · {c.username}
                    {c.schema_cache?.length > 0 && ` · ${c.schema_cache.length} tablas`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => syncSchema(c.id)} disabled={syncingSchema === c.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors">
                    {syncingSchema === c.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    Sync esquema
                  </button>
                  {c.schema_cache?.length > 0 && (
                    <button onClick={() => setViewingSchema(viewingSchema === c.id ? null : c.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-zinc-100 text-zinc-600 rounded-lg hover:bg-zinc-200 transition-colors">
                      <Eye size={12} /> Esquema
                    </button>
                  )}
                  <button onClick={() => toggleConnection(c.id, c.is_active)}
                    className={`p-1.5 rounded-lg ${c.is_active ? 'text-emerald-500 hover:bg-emerald-50' : 'text-zinc-400 hover:bg-zinc-100'}`}>
                    {c.is_active ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                  <button onClick={() => openConnForm(c)} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400"><Edit3 size={15} /></button>
                  <button onClick={() => deleteConnection(c.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-500"><Trash2 size={15} /></button>
                </div>
              </div>
              {viewingSchema === c.id && c.schema_cache?.length > 0 && (
                <div className="border-t border-zinc-100 px-4 py-3 max-h-80 overflow-y-auto">
                  <p className="text-xs font-medium text-zinc-500 mb-2">Esquema ({c.schema_cache.length} tablas)</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {c.schema_cache.map((t: DbSchemaTable, i: number) => (
                      <div key={i} className="bg-zinc-50 rounded-lg p-2.5">
                        <p className="text-xs font-medium text-zinc-700 mb-1">[{t.schema_name}].[{t.table_name}]</p>
                        <div className="space-y-0.5">
                          {t.columns.slice(0, 8).map((col, j) => (
                            <p key={j} className="text-[11px] text-zinc-500">{col.name} <span className="text-zinc-400">({col.type})</span></p>
                          ))}
                          {t.columns.length > 8 && <p className="text-[11px] text-zinc-400">+{t.columns.length - 8} más...</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          {connections.length === 0 && (
            <div className="text-center py-12 bg-white border border-zinc-200 rounded-xl">
              <Database size={32} className="mx-auto mb-3 text-zinc-300" />
              <p className="text-sm text-zinc-500 mb-1">No hay conexiones configuradas</p>
              <p className="text-xs text-zinc-400">Añade una conexión para que GIA consulte tu BD</p>
            </div>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mt-4">
          <p className="text-sm font-medium text-blue-700 mb-1">💡 ¿Cómo funciona?</p>
          <ol className="text-xs text-blue-600 space-y-1 list-decimal list-inside">
            <li>Configura la conexión a tu base de datos</li>
            <li>Sincroniza el esquema para que GIA conozca las tablas</li>
            <li>Activa el toggle <strong>&quot;BD Empresa&quot;</strong> en el chat</li>
            <li>Pregunta sobre tus datos — GIA generará la consulta SQL</li>
          </ol>
          <p className="text-xs text-blue-500 mt-2">⚠️ Solo consultas SELECT. Todas quedan registradas.</p>
        </div>
      </div>
    )
  }

  function renderNetworkDrivesTab() {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-800">Unidades de Red ({networkDrives.length})</h2>
          <button onClick={() => openDriveForm()}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-500 transition-colors">
            <Plus size={14} /> Añadir unidad
          </button>
        </div>

        {showDriveForm && (
          <div className="bg-white border border-emerald-200 rounded-xl p-4 mb-4 space-y-3">
            <p className="text-sm font-medium text-zinc-800">{editingDrive ? 'Editar unidad' : 'Nueva unidad de red'}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Nombre</label>
                <input value={driveForm.name} onChange={e => setDriveForm({ ...driveForm, name: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="Web + Marketing" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Ruta UNC</label>
                <input value={driveForm.unc_path} onChange={e => setDriveForm({ ...driveForm, unc_path: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="\\gesem-dc\Datos\60-Web + Marketing" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Extensiones (separadas por coma)</label>
                <input value={driveForm.file_extensions} onChange={e => setDriveForm({ ...driveForm, file_extensions: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="pdf,docx,xlsx,txt" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Tamaño máximo (MB)</label>
                <input type="number" value={driveForm.max_file_size_mb} onChange={e => setDriveForm({ ...driveForm, max_file_size_mb: parseInt(e.target.value) || 50 })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-zinc-500 mb-1 block">Descripción</label>
                <input value={driveForm.description} onChange={e => setDriveForm({ ...driveForm, description: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="Carpeta de marketing y documentación web..." />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={saveDrive} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-500 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
              </button>
              <button onClick={() => setShowDriveForm(false)} className="px-4 py-2 text-sm text-zinc-500 hover:bg-zinc-100 rounded-lg">Cancelar</button>
            </div>
          </div>
        )}

        {syncResult && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
            <p className="text-sm font-medium text-emerald-700 mb-2">📊 Resultado de sincronización</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-lg p-2.5 text-center">
                <p className="text-lg font-bold text-zinc-800">{(syncResult.stats as Record<string, number>)?.total_scanned ?? 0}</p>
                <p className="text-xs text-zinc-500">Archivos encontrados</p>
              </div>
              <div className="bg-white rounded-lg p-2.5 text-center">
                <p className="text-lg font-bold text-emerald-600">{(syncResult.stats as Record<string, number>)?.new_files ?? 0}</p>
                <p className="text-xs text-zinc-500">Nuevos</p>
              </div>
              <div className="bg-white rounded-lg p-2.5 text-center">
                <p className="text-lg font-bold text-blue-600">{(syncResult.stats as Record<string, number>)?.total_chunks ?? 0}</p>
                <p className="text-xs text-zinc-500">Chunks creados</p>
              </div>
              <div className="bg-white rounded-lg p-2.5 text-center">
                <p className="text-lg font-bold text-zinc-400">{(syncResult.stats as Record<string, number>)?.skipped_files ?? 0}</p>
                <p className="text-xs text-zinc-500">Omitidos</p>
              </div>
            </div>
            <button onClick={() => setSyncResult(null)} className="mt-2 text-xs text-emerald-600 hover:underline">Cerrar</button>
          </div>
        )}

        <div className="space-y-2">
          {networkDrives.map(d => (
            <div key={d.id} className={`bg-white border rounded-xl transition-colors ${d.is_active ? 'border-zinc-200' : 'border-zinc-200 opacity-50'}`}>
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <HardDrive size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-800">{d.name}</p>
                  <p className="text-xs text-zinc-400 truncate">
                    {d.unc_path} · {d.file_count || 0} archivos · {d.total_chunks || 0} chunks
                    {d.last_synced_at && ` · Último sync: ${new Date(d.last_synced_at).toLocaleString('es-ES')}`}
                  </p>
                  {d.sync_status === 'error' && d.sync_error && (
                    <p className="text-xs text-red-500 mt-0.5">Error: {d.sync_error}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => syncDrive(d.id)} disabled={syncingDrive === d.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors">
                    {syncingDrive === d.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    {syncingDrive === d.id ? 'Sincronizando...' : 'Sincronizar'}
                  </button>
                  <button onClick={() => toggleDrive(d.id, d.is_active)}
                    className={`p-1.5 rounded-lg ${d.is_active ? 'text-emerald-500 hover:bg-emerald-50' : 'text-zinc-400 hover:bg-zinc-100'}`}>
                    {d.is_active ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                  <button onClick={() => openDriveForm(d)} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400"><Edit3 size={15} /></button>
                  <button onClick={() => deleteDrive(d.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-500"><Trash2 size={15} /></button>
                </div>
              </div>
            </div>
          ))}
          {networkDrives.length === 0 && (
            <div className="text-center py-12 bg-white border border-zinc-200 rounded-xl">
              <HardDrive size={32} className="mx-auto mb-3 text-zinc-300" />
              <p className="text-sm text-zinc-500 mb-1">No hay unidades de red configuradas</p>
              <p className="text-xs text-zinc-400">Añade una unidad para indexar documentos de la empresa</p>
            </div>
          )}
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mt-4">
          <p className="text-sm font-medium text-emerald-700 mb-1">💡 ¿Cómo funciona?</p>
          <ol className="text-xs text-emerald-600 space-y-1 list-decimal list-inside">
            <li>Configura la ruta UNC de la unidad de red (ej: \\gesem-dc\Datos\...)</li>
            <li>Pulsa <strong>&quot;Sincronizar&quot;</strong> para indexar los archivos</li>
            <li>Activa el toggle <strong>&quot;Unidad de Red&quot;</strong> (icono disco duro) en el chat</li>
            <li>Pregunta sobre el contenido de tus documentos — GIA buscará por similitud semántica</li>
          </ol>
          <p className="text-xs text-emerald-500 mt-2">📁 Formatos soportados: PDF, Word, Excel, PowerPoint, TXT, CSV, MD, JSON, XML, HTML, RTF</p>
        </div>
      </div>
    )
  }
}

