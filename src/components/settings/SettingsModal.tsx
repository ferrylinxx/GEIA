'use client'

import { useState, useEffect, useCallback } from 'react'
import { useUIStore } from '@/store/ui-store'
import { createClient } from '@/lib/supabase/client'
import { Profile, Memory, FileRecord } from '@/lib/types'
import { useDropzone } from 'react-dropzone'
import { X, User, MessageSquare, Palette, Save, Loader2, Brain, Plus, Trash2, ToggleLeft, ToggleRight, Upload, FileText, Image, Music, Video, BookOpen, RefreshCw, Eye, Search, FolderOpen, Mail, Lock, CheckCircle } from 'lucide-react'

type Tab = 'profile' | 'instructions' | 'memory' | 'files' | 'appearance'

export default function SettingsModal({ userId }: { userId?: string }) {
  const { setSettingsOpen, openFilePreview } = useUIStore()
  const [tab, setTab] = useState<Tab>('profile')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [instructionsEnabled, setInstructionsEnabled] = useState(false)
  const [instructionsWhat, setInstructionsWhat] = useState('')
  const [instructionsHow, setInstructionsHow] = useState('')
  const { theme, setTheme } = useUIStore()

  // User email (from auth)
  const [userEmail, setUserEmail] = useState('')

  // Email/password state
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [emailMsg, setEmailMsg] = useState('')
  const [passwordMsg, setPasswordMsg] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)

  // Memory state
  const [memories, setMemories] = useState<Memory[]>([])
  const [newMemory, setNewMemory] = useState('')
  const [memoriesLoading, setMemoriesLoading] = useState(false)

  // Files state
  const [files, setFiles] = useState<FileRecord[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [ingesting, setIngesting] = useState<string | null>(null)
  const [fileFilter, setFileFilter] = useState('')

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserEmail(user.email || '')
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (data) {
      setProfile(data)
      setName(data.name || user.email?.split('@')[0] || '')
      setInstructionsEnabled(data.custom_instructions_enabled)
      setInstructionsWhat(data.custom_instructions_what || '')
      setInstructionsHow(data.custom_instructions_how || '')
    }
    setLoading(false)
  }

  const handleSave = async () => {
    if (!profile) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('profiles').update({
      name, custom_instructions_enabled: instructionsEnabled,
      custom_instructions_what: instructionsWhat,
      custom_instructions_how: instructionsHow,
    }).eq('id', profile.id)
    setSaving(false)
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !profile) return
    const supabase = createClient()
    const path = `${profile.id}/avatar_${Date.now()}.${file.name.split('.').pop()}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (!error) {
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      await supabase.from('profiles').update({ avatar_url: urlData.publicUrl }).eq('id', profile.id)
      setProfile({ ...profile, avatar_url: urlData.publicUrl })
    }
  }

  // ---- Email/Password functions ----
  const handleChangeEmail = async () => {
    if (!newEmail.trim()) return
    setEmailSaving(true); setEmailMsg('')
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ email: newEmail })
      if (error) setEmailMsg(`Error: ${error.message}`)
      else setEmailMsg('Se ha enviado un enlace de confirmación a tu nuevo email.')
      setNewEmail('')
    } catch { setEmailMsg('Error al cambiar email') }
    setEmailSaving(false)
  }

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) return
    if (newPassword !== confirmPassword) { setPasswordMsg('Las contraseñas no coinciden'); return }
    if (newPassword.length < 6) { setPasswordMsg('Mínimo 6 caracteres'); return }
    setPasswordSaving(true); setPasswordMsg('')
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) setPasswordMsg(`Error: ${error.message}`)
      else setPasswordMsg('Contraseña actualizada correctamente.')
      setNewPassword(''); setConfirmPassword('')
    } catch { setPasswordMsg('Error al cambiar contraseña') }
    setPasswordSaving(false)
  }

  // ---- Memory functions ----
  const loadMemories = async () => {
    if (!userId) return
    setMemoriesLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from('memories').select('*')
      .eq('user_id', userId).eq('scope', 'user').order('created_at', { ascending: false })
    if (data) setMemories(data)
    setMemoriesLoading(false)
  }

  const addMemory = async () => {
    if (!newMemory.trim() || !userId) return
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

  // ---- File functions ----
  const loadFiles = async () => {
    setFilesLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from('files').select('*').order('created_at', { ascending: false })
    if (data) setFiles(data)
    setFilesLoading(false)
  }

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setUploading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }
    for (const file of acceptedFiles) {
      const path = `${user.id}/${Date.now()}_${file.name}`
      const { error } = await supabase.storage.from('user-files').upload(path, file)
      if (!error) {
        const { data: fileRec } = await supabase.from('files').insert({
          user_id: user.id, storage_path: path, filename: file.name, mime: file.type, size: file.size,
        }).select().single()
        if (fileRec) setFiles(prev => [fileRec, ...prev])
      }
    }
    setUploading(false)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop })

  const handleIngest = async (fileId: string) => {
    setIngesting(fileId)
    try {
      const res = await fetch('/api/files/ingest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_id: fileId }) })
      const data = await res.json()
      if (data.success) setFiles(prev => prev.map(f => f.id === fileId ? { ...f, ingest_status: 'done' as const } : f))
      else setFiles(prev => prev.map(f => f.id === fileId ? { ...f, ingest_status: 'failed' as const } : f))
    } catch { setFiles(prev => prev.map(f => f.id === fileId ? { ...f, ingest_status: 'failed' as const } : f)) }
    setIngesting(null)
  }

  const handleDeleteFile = async (fileId: string) => {
    const supabase = createClient()
    const file = files.find(f => f.id === fileId)
    if (file) {
      await supabase.storage.from('user-files').remove([file.storage_path])
      await supabase.from('file_chunks').delete().eq('file_id', fileId)
      await supabase.from('files').delete().eq('id', fileId)
      setFiles(prev => prev.filter(f => f.id !== fileId))
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFileIcon = (mime: string | null) => {
    if (mime?.startsWith('image/')) return <Image size={14} className="text-blue-500" />
    if (mime?.startsWith('audio/')) return <Music size={14} className="text-purple-500" />
    if (mime?.startsWith('video/')) return <Video size={14} className="text-emerald-500" />
    return <FileText size={14} className="text-zinc-400" />
  }

  const filteredFiles = files.filter(f => f.filename.toLowerCase().includes(fileFilter.toLowerCase()))

  // Load memory/files when switching to those tabs
  useEffect(() => {
    if (tab === 'memory' && memories.length === 0) loadMemories()
    if (tab === 'files' && files.length === 0) loadFiles()
  }, [tab])

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: 'Perfil', icon: <User size={14} /> },
    { id: 'instructions', label: 'Instrucciones', icon: <MessageSquare size={14} /> },
    { id: 'memory', label: 'Memoria', icon: <Brain size={14} /> },
    { id: 'files', label: 'Archivos', icon: <FolderOpen size={14} /> },
    { id: 'appearance', label: 'Apariencia', icon: <Palette size={14} /> },
  ]

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setSettingsOpen(false)}>
      <div className="w-full max-w-2xl bg-white border border-zinc-200 rounded-xl shadow-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
          <h2 className="text-sm font-semibold text-zinc-800">Ajustes</h2>
          <button onClick={() => setSettingsOpen(false)} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400"><X size={16} /></button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Tabs sidebar */}
          <div className="w-40 border-r border-zinc-200 p-2 space-y-0.5">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`w-full text-left px-3 py-2 text-xs rounded-lg flex items-center gap-2 transition-colors ${tab === t.id ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:bg-zinc-50'}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-zinc-400" size={24} /></div> : (
              <>
                {tab === 'profile' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center overflow-hidden border border-zinc-200">
                          {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : <User size={24} className="text-zinc-400" />}
                        </div>
                        <label className="absolute -bottom-1 -right-1 bg-blue-600 rounded-full p-1 cursor-pointer hover:bg-blue-500 text-white">
                          <Palette size={10} />
                          <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                        </label>
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-zinc-500 block mb-1">Nombre</label>
                        <input value={name} onChange={e => setName(e.target.value)} placeholder={userEmail.split('@')[0] || 'Tu nombre'} className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-800 w-64 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        {userEmail && <p className="text-[11px] text-zinc-400 mt-1">{userEmail}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div>
                        <label className="text-xs text-zinc-500 block mb-1">Rol</label>
                        <span className={`px-2 py-0.5 rounded text-xs ${profile?.role === 'admin' ? 'bg-purple-50 text-purple-600' : 'bg-zinc-100 text-zinc-500'}`}>{profile?.role === 'admin' ? 'Administrador' : 'Usuario'}</span>
                      </div>
                    </div>

                    {/* Change email */}
                    <div className="pt-3 border-t border-zinc-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Mail size={14} className="text-zinc-500" />
                        <label className="text-xs font-medium text-zinc-700">Cambiar email</label>
                      </div>
                      <div className="flex gap-2">
                        <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="nuevo@email.com" type="email"
                          className="flex-1 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <button onClick={handleChangeEmail} disabled={emailSaving || !newEmail.trim()}
                          className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm text-white">
                          {emailSaving ? <Loader2 size={14} className="animate-spin" /> : 'Cambiar'}
                        </button>
                      </div>
                      {emailMsg && <p className={`text-xs mt-1.5 ${emailMsg.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>{emailMsg}</p>}
                    </div>

                    {/* Change password */}
                    <div className="pt-3 border-t border-zinc-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Lock size={14} className="text-zinc-500" />
                        <label className="text-xs font-medium text-zinc-700">Cambiar contraseña</label>
                      </div>
                      <div className="space-y-2">
                        <input value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Nueva contraseña" type="password"
                          className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <input value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirmar contraseña" type="password"
                          className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <button onClick={handleChangePassword} disabled={passwordSaving || !newPassword || !confirmPassword}
                          className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm text-white">
                          {passwordSaving ? <Loader2 size={14} className="animate-spin" /> : 'Actualizar contraseña'}
                        </button>
                      </div>
                      {passwordMsg && <p className={`text-xs mt-1.5 ${passwordMsg.startsWith('Error') || passwordMsg.includes('no coinciden') || passwordMsg.includes('Mínimo') ? 'text-red-500' : 'text-green-600'}`}>{passwordMsg}</p>}
                    </div>
                  </div>
                )}

                {tab === 'instructions' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-zinc-800">Instrucciones personalizadas</p>
                      <button onClick={() => setInstructionsEnabled(!instructionsEnabled)}
                        className={`px-3 py-1 text-xs rounded-full ${instructionsEnabled ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-500'}`}>
                        {instructionsEnabled ? 'Activado' : 'Desactivado'}
                      </button>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">¿Qué quieres que GIA sepa sobre ti?</label>
                      <textarea value={instructionsWhat} onChange={e => setInstructionsWhat(e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-800 min-h-[100px] resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Ej: Soy desarrollador fullstack, trabajo con React y Python..." />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">¿Cómo quieres que responda GIA?</label>
                      <textarea value={instructionsHow} onChange={e => setInstructionsHow(e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-800 min-h-[100px] resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Ej: Sé conciso, usa ejemplos de código, responde en español..." />
                    </div>
                  </div>
                )}

                {tab === 'memory' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Brain size={16} className="text-purple-500" />
                      <p className="text-sm font-medium text-zinc-800">Lo que sé de ti</p>
                    </div>
                    <p className="text-xs text-zinc-500">GIA recuerda estos datos para personalizar tus respuestas.</p>
                    <div className="flex gap-2">
                      <input value={newMemory} onChange={e => setNewMemory(e.target.value)} placeholder="Añadir un recuerdo..."
                        onKeyDown={e => { if (e.key === 'Enter') addMemory() }}
                        className="flex-1 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <button onClick={addMemory} className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm text-white"><Plus size={14} /></button>
                    </div>
                    <div className="max-h-[40vh] overflow-y-auto space-y-2">
                      {memoriesLoading && <p className="text-sm text-zinc-400 text-center py-4">Cargando...</p>}
                      {!memoriesLoading && memories.length === 0 && <p className="text-sm text-zinc-400 text-center py-4">Sin recuerdos guardados</p>}
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
                )}

                {tab === 'files' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <FolderOpen size={16} className="text-blue-500" />
                      <p className="text-sm font-medium text-zinc-800">Archivos</p>
                      <button onClick={loadFiles} className="ml-auto p-1 hover:bg-zinc-100 rounded text-zinc-400" title="Recargar"><RefreshCw size={13} /></button>
                    </div>
                    {/* Drop zone */}
                    <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-zinc-300 hover:border-zinc-400'}`}>
                      <input {...getInputProps()} />
                      {uploading ? (
                        <div className="flex items-center justify-center gap-2 text-sm text-zinc-500"><Loader2 size={16} className="animate-spin" /> Subiendo...</div>
                      ) : (
                        <div className="flex items-center justify-center gap-2 text-sm text-zinc-500"><Upload size={16} /> {isDragActive ? 'Suelta aquí' : 'Arrastra archivos o haz clic'}</div>
                      )}
                    </div>
                    {/* Filter */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg">
                      <Search size={14} className="text-zinc-400" />
                      <input value={fileFilter} onChange={e => setFileFilter(e.target.value)} placeholder="Filtrar archivos..."
                        className="flex-1 bg-transparent text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none" />
                    </div>
                    {/* File list */}
                    <div className="max-h-[35vh] overflow-y-auto space-y-1">
                      {filesLoading && <div className="flex justify-center py-6"><Loader2 className="animate-spin text-zinc-400" size={20} /></div>}
                      {!filesLoading && filteredFiles.length === 0 && <p className="text-xs text-zinc-400 text-center py-6">Sin archivos</p>}
                      {filteredFiles.map(f => (
                        <div key={f.id} className="group flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-50 rounded-lg transition-colors">
                          {getFileIcon(f.mime)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate text-zinc-700">{f.filename}</p>
                            <p className="text-[10px] text-zinc-400">{formatSize(f.size)} · {new Date(f.created_at).toLocaleDateString('es-ES')}</p>
                          </div>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${f.ingest_status === 'done' ? 'bg-green-50 text-green-600' : f.ingest_status === 'failed' ? 'bg-red-50 text-red-600' : f.ingest_status === 'processing' ? 'bg-yellow-50 text-yellow-600' : 'bg-zinc-100 text-zinc-500'}`}>
                            {f.ingest_status === 'none' ? '—' : f.ingest_status}
                          </span>
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openFilePreview(f.id)} className="p-1 hover:bg-zinc-200 rounded text-zinc-400" title="Vista previa"><Eye size={13} /></button>
                            {f.ingest_status !== 'done' && (
                              <button onClick={() => handleIngest(f.id)} disabled={ingesting === f.id}
                                className="p-1 hover:bg-zinc-200 rounded text-emerald-500" title="Ingestar para RAG">
                                {ingesting === f.id ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />}
                              </button>
                            )}
                            {f.ingest_status === 'done' && (
                              <button onClick={() => handleIngest(f.id)} className="p-1 hover:bg-zinc-200 rounded text-yellow-500" title="Re-ingestar"><RefreshCw size={13} /></button>
                            )}
                            <button onClick={() => handleDeleteFile(f.id)} className="p-1 hover:bg-zinc-200 rounded text-red-500" title="Eliminar"><Trash2 size={13} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {tab === 'appearance' && (
                  <div className="space-y-4">
                    <p className="text-sm font-medium text-zinc-800">Tema</p>
                    <div className="flex gap-3">
                      <button onClick={() => setTheme('dark')} className={`px-4 py-3 rounded-xl border text-sm ${theme === 'dark' ? 'border-blue-500 bg-blue-50' : 'border-zinc-200 hover:bg-zinc-50'}`}>🌙 Oscuro</button>
                      <button onClick={() => setTheme('light')} className={`px-4 py-3 rounded-xl border text-sm ${theme === 'light' ? 'border-blue-500 bg-blue-50' : 'border-zinc-200 hover:bg-zinc-50'}`}>☀️ Claro</button>
                    </div>
                  </div>
                )}


              </>
            )}
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end px-4 py-3 border-t border-zinc-200">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm text-white transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

