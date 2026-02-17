'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Project } from '@/lib/types'
import { useUIStore } from '@/store/ui-store'
import { coerceMimeType, sanitizeFilename } from '@/lib/file-utils'
import { AUTO_RAG_INGEST_ON_UPLOAD } from '@/lib/rag-ingest-config'
import { Copy, Eye, FileText, Link2, Loader2, RefreshCw, Save, Settings, Shield, Sparkles, Trash2, Upload, UserPlus, X } from 'lucide-react'

type Tab = 'files' | 'instructions' | 'collaboration' | 'quality'

interface ProjectFileRow {
  id: string
  filename: string
  mime: string | null
  size: number
  ingest_status: string
  ingest_error?: string | null
  created_at: string
  meta_json?: Record<string, unknown> | null
  file_version?: number
  last_reindexed_at?: string | null
}

interface ProjectMemberRow {
  id: string
  user_id: string
  role: 'owner' | 'admin' | 'editor' | 'viewer'
  profile?: { name: string | null; avatar_url: string | null } | null
  is_owner: boolean
}

interface ProjectShareRow {
  id: string
  share_token: string
  role: 'viewer' | 'editor'
  expires_at: string | null
  is_active: boolean
  view_count: number
  has_password?: boolean
  url?: string
}

interface ContradictionRow {
  id: string
  severity: 'low' | 'medium' | 'high'
  topic: string
  statement_a: string
  statement_b: string
  recommendation: string
  confidence: number
}

interface Props {
  project: Project
  onClose: () => void
  onProjectUpdated?: (project: Project) => void
}

const bytesLabel = (size: number) => {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export default function ProjectSettingsModal({ project, onClose, onProjectUpdated }: Props) {
  const { openFilePreview, addToast } = useUIStore()
  const [tab, setTab] = useState<Tab>('files')
  const [files, setFiles] = useState<ProjectFileRow[]>([])
  const [members, setMembers] = useState<ProjectMemberRow[]>([])
  const [shares, setShares] = useState<ProjectShareRow[]>([])
  const [instructions, setInstructions] = useState((project.instructions || '').toString())
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [replaceFileId, setReplaceFileId] = useState<string | null>(null)
  const [replacingFileId, setReplacingFileId] = useState<string | null>(null)
  const [inviteUserId, setInviteUserId] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'editor' | 'viewer'>('viewer')
  const [shareRole, setShareRole] = useState<'viewer' | 'editor'>('viewer')
  const [shareHours, setShareHours] = useState(72)
  const [sharePassword, setSharePassword] = useState('')
  const [creatingShare, setCreatingShare] = useState(false)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisSummary, setAnalysisSummary] = useState('')
  const [contradictions, setContradictions] = useState<ContradictionRow[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)

  const role = (project.my_role || 'viewer') as 'owner' | 'admin' | 'editor' | 'viewer'
  const canEdit = role === 'owner' || role === 'admin' || role === 'editor'
  const canAdmin = role === 'owner' || role === 'admin'

  const tabs = useMemo(() => ([
    { id: 'files' as const, label: 'Archivos', icon: FileText },
    { id: 'instructions' as const, label: 'Instrucciones', icon: Settings },
    { id: 'collaboration' as const, label: 'Colaboracion', icon: Shield },
    { id: 'quality' as const, label: 'Calidad IA', icon: Sparkles },
  ]), [])

  const loadFiles = useCallback(async () => {
    const res = await fetch(`/api/projects/${project.id}/files`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error || 'No se pudieron cargar archivos')
    setFiles(Array.isArray(data?.files) ? data.files : [])
  }, [project.id])

  const loadMembers = useCallback(async () => {
    if (!canAdmin) return
    const res = await fetch(`/api/projects/${project.id}/members`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error || 'No se pudieron cargar miembros')
    setMembers(Array.isArray(data?.members) ? data.members : [])
  }, [canAdmin, project.id])

  const loadShares = useCallback(async () => {
    if (!canAdmin) return
    const res = await fetch(`/api/projects/${project.id}/shares`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error || 'No se pudieron cargar enlaces')
    setShares(Array.isArray(data?.shares) ? data.shares : [])
  }, [canAdmin, project.id])

  useEffect(() => {
    void (async () => {
      try {
        await loadFiles()
        if (canAdmin) await Promise.all([loadMembers(), loadShares()])
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo cargar configuracion'
        addToast({ type: 'error', message })
      }
    })()
  }, [addToast, canAdmin, loadFiles, loadMembers, loadShares])

  const uploadFiles = useCallback(async (incoming: File[]) => {
    if (!incoming.length) return
    setUploading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        addToast({ type: 'error', message: 'Sesion no valida' })
        return
      }

      const ingestErrors: string[] = []

      for (const file of incoming) {
        const safeName = sanitizeFilename(file.name)
        const mime = coerceMimeType(file.type, safeName)
        const storagePath = `${user.id}/${Date.now()}_${safeName}`
        const up = await supabase.storage.from('user-files').upload(storagePath, file, { contentType: mime })
        if (up.error) {
          ingestErrors.push(`${file.name}: ${up.error.message}`)
          continue
        }

        const row = await supabase.from('files').insert({
          user_id: user.id,
          project_id: project.id,
          storage_path: storagePath,
          filename: file.name,
          mime,
          size: file.size,
          ingest_status: AUTO_RAG_INGEST_ON_UPLOAD ? 'queued' : 'none',
        }).select('id').single()

        if (!row.data?.id) {
          ingestErrors.push(`${file.name}: no se pudo registrar en base de datos`)
          continue
        }

        if (AUTO_RAG_INGEST_ON_UPLOAD) {
          const ingestRes = await fetch('/api/files/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_id: row.data.id }),
          })
          const ingestData = await ingestRes.json().catch(() => ({}))
          if (!ingestRes.ok) {
            ingestErrors.push(`${file.name}: ${ingestData?.error || 'error al analizar'}`)
          }
        }
      }

      await loadFiles()

      if (ingestErrors.length > 0) {
        addToast({
          type: 'error',
          message: `Algunos archivos fallaron: ${ingestErrors.slice(0, 2).join(' | ')}${ingestErrors.length > 2 ? ' ...' : ''}`,
        })
      } else {
        addToast({
          type: 'success',
          message: AUTO_RAG_INGEST_ON_UPLOAD
            ? 'Archivos subidos y analizados'
            : 'Archivos subidos (RAG de subida desactivado)',
        })
      }
    } finally {
      setUploading(false)
    }
  }, [addToast, loadFiles, project.id])

  const onFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files ? Array.from(event.target.files) : []
    await uploadFiles(selected)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const onReplaceSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    if (!selected || !replaceFileId) return
    setReplacingFileId(replaceFileId)
    const form = new FormData()
    form.append('file', selected)
    const res = await fetch(`/api/projects/${project.id}/files/${replaceFileId}/replace`, { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) addToast({ type: 'error', message: data?.error || 'No se pudo reemplazar archivo' })
    await loadFiles()
    setReplacingFileId(null)
    setReplaceFileId(null)
    if (replaceInputRef.current) replaceInputRef.current.value = ''
  }

  const saveInstructions = async () => {
    setSaving(true)
    const res = await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instructions: instructions.trim() }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok || !data?.project) {
      addToast({ type: 'error', message: data?.error || 'No se pudo guardar instrucciones' })
      return
    }
    onProjectUpdated?.({
      ...project,
      ...(data.project as Project),
      my_role: project.my_role,
      is_owner: project.is_owner,
    })
    addToast({ type: 'success', message: 'Instrucciones guardadas' })
  }

  const reindexFile = async (fileId: string) => {
    const res = await fetch('/api/files/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      addToast({ type: 'error', message: data?.error || 'No se pudo reindexar' })
      return
    }
    addToast({ type: 'success', message: 'Archivo reindexado' })
    await loadFiles()
  }

  const inviteMember = async () => {
    if (!inviteUserId.trim()) return
    const res = await fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: inviteUserId.trim(), role: inviteRole }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      addToast({ type: 'error', message: data?.error || 'No se pudo anadir miembro' })
      return
    }
    setInviteUserId('')
    await loadMembers()
    addToast({ type: 'success', message: 'Miembro anadido/actualizado' })
  }

  const updateMemberRole = async (memberId: string, nextRole: 'admin' | 'editor' | 'viewer') => {
    const res = await fetch(`/api/projects/${project.id}/members/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: nextRole }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      addToast({ type: 'error', message: data?.error || 'No se pudo cambiar rol' })
      return
    }
    await loadMembers()
  }

  const removeMember = async (memberId: string) => {
    const res = await fetch(`/api/projects/${project.id}/members/${memberId}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      addToast({ type: 'error', message: data?.error || 'No se pudo eliminar miembro' })
      return
    }
    await loadMembers()
  }

  const createShare = async () => {
    setCreatingShare(true)
    const res = await fetch(`/api/projects/${project.id}/shares`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: shareRole, expires_hours: shareHours, password: sharePassword.trim() }),
    })
    const data = await res.json().catch(() => ({}))
    setCreatingShare(false)
    if (!res.ok || !data?.share) {
      addToast({ type: 'error', message: data?.error || 'No se pudo crear enlace' })
      return
    }
    if (data.share.url) await navigator.clipboard.writeText(data.share.url)
    setSharePassword('')
    await loadShares()
    addToast({ type: 'success', message: 'Enlace creado y copiado' })
  }

  const toggleShare = async (share: ProjectShareRow, active: boolean) => {
    const res = await fetch(`/api/projects/${project.id}/shares/${share.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: active }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      addToast({ type: 'error', message: data?.error || 'No se pudo actualizar enlace' })
      return
    }
    await loadShares()
  }

  const analyzeContradictions = async () => {
    setAnalysisLoading(true)
    const res = await fetch(`/api/projects/${project.id}/contradictions`)
    const data = await res.json().catch(() => ({}))
    setAnalysisLoading(false)
    if (!res.ok) {
      addToast({ type: 'error', message: data?.error || 'No se pudo analizar contradicciones' })
      return
    }
    setAnalysisSummary(String(data?.summary || ''))
    setContradictions(Array.isArray(data?.contradictions) ? data.contradictions : [])
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/35 backdrop-blur-[2px] flex items-center justify-center px-3" onClick={onClose}>
      <div className="w-full max-w-4xl liquid-glass-dropdown menu-solid-panel rounded-3xl border border-white/60 shadow-[0_30px_90px_rgba(15,23,42,0.25)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/40">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-white/70 border border-white/60 flex items-center justify-center">
              <Settings size={16} className="text-zinc-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900 truncate">Proyecto: {project.name}</p>
              <p className="text-[11px] text-zinc-500 truncate">Configuracion y contexto</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl text-zinc-500 hover:bg-white/60" aria-label="Cerrar"><X size={16} /></button>
        </div>

        <div className="flex gap-1 px-3 pt-3 overflow-x-auto">
          {tabs.map((item) => {
            const Icon = item.icon
            const active = tab === item.id
            return (
              <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`px-3 py-2 rounded-2xl text-xs font-semibold transition-colors border whitespace-nowrap ${active ? 'bg-white/70 text-zinc-900 border-white/60' : 'bg-white/30 text-zinc-600 border-white/40 hover:bg-white/45'}`}>
                <span className="inline-flex items-center gap-2 justify-center"><Icon size={14} className={active ? 'text-blue-600' : 'text-zinc-500'} />{item.label}</span>
              </button>
            )
          })}
        </div>

        <div className="p-5 max-h-[72vh] overflow-y-auto">
          <input type="file" ref={replaceInputRef} onChange={onReplaceSelected} className="hidden" />

          {tab === 'files' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <input type="file" ref={fileInputRef} onChange={onFilesSelected} multiple className="hidden" />
                {canEdit && (
                  <>
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-50">
                      <Upload size={16} />{uploading ? 'Subiendo...' : 'Subir archivos'}
                    </button>
                  </>
                )}
                <p className="text-xs text-zinc-500 ml-auto">{files.length} archivos</p>
              </div>

              <div className="bg-white/55 border border-white/60 rounded-2xl overflow-hidden">
                {files.length === 0 ? (
                  <div className="p-5 text-center text-sm text-zinc-500">Sin archivos en este proyecto.</div>
                ) : (
                  <div className="max-h-[52vh] overflow-y-auto divide-y divide-white/60">
                    {files.map((file) => {
                      const meta = (file.meta_json || {}) as Record<string, unknown>
                      const language = String(meta.detected_language || meta.language || '').trim()
                      const department = String(meta.department || '').trim()
                      const author = String(meta.author || '').trim()
                      return (
                        <div key={file.id} className="px-4 py-3 space-y-2">
                          <div className="flex items-start gap-3">
                            <FileText size={16} className="text-zinc-400 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-zinc-800 font-medium truncate">{file.filename}</p>
                              <div className="text-[11px] text-zinc-500 flex flex-wrap gap-x-3 gap-y-1 mt-0.5">
                                <span>{file.mime || 'application/octet-stream'}</span>
                                <span>{bytesLabel(file.size)}</span>
                                <span>v{Math.max(1, Number(file.file_version || 1))}</span>
                                {language && <span>Idioma: {language}</span>}
                                {author && <span>Autor: {author}</span>}
                                {department && <span>Depto: {department}</span>}
                              </div>
                              {file.ingest_error && <p className="mt-1 text-[11px] text-red-600">{file.ingest_error}</p>}
                            </div>
                            <span className={`text-[10px] px-2 py-1 rounded-full border shrink-0 ${file.ingest_status === 'done' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : file.ingest_status === 'failed' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-white/60 text-zinc-600 border-white/60'}`}>{file.ingest_status}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button type="button" onClick={() => openFilePreview(file.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/80 border border-white/70 text-[11px] text-zinc-600 hover:bg-white"><Eye size={12} />Vista previa</button>
                            {canEdit && (
                              <>
                                <button type="button" onClick={() => void reindexFile(file.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/80 border border-white/70 text-[11px] text-zinc-600 hover:bg-white"><RefreshCw size={12} />Reindexar</button>
                                <button type="button" onClick={() => { setReplaceFileId(file.id); replaceInputRef.current?.click() }} disabled={replacingFileId === file.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/80 border border-white/70 text-[11px] text-zinc-600 hover:bg-white disabled:opacity-50">
                                  {replacingFileId === file.id ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}Reemplazar
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'instructions' && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-zinc-800">Instrucciones del proyecto</p>
              <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} className="w-full min-h-[220px] px-4 py-3 rounded-2xl bg-white/55 border border-white/60 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-zinc-600 hover:bg-white/60">Cerrar</button>
                {canEdit && <button type="button" onClick={() => void saveInstructions()} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"><Save size={16} />{saving ? 'Guardando...' : 'Guardar'}</button>}
              </div>
            </div>
          )}

          {tab === 'collaboration' && (
            <div className="space-y-4">
              {!canAdmin ? <div className="text-sm text-zinc-500">Solo owner/admin puede gestionar colaboracion.</div> : (
                <>
                  <div className="rounded-2xl border border-white/60 bg-white/55 p-4 space-y-3">
                    <p className="text-sm font-semibold text-zinc-800">Roles por proyecto</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input value={inviteUserId} onChange={(e) => setInviteUserId(e.target.value)} placeholder="User ID de Supabase" className="flex-1 min-w-[220px] px-3 py-2 rounded-xl border border-zinc-200 bg-white/85 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25" />
                      <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'admin' | 'editor' | 'viewer')} className="px-3 py-2 rounded-xl border border-zinc-200 bg-white/85 text-sm text-zinc-700"><option value="viewer">viewer</option><option value="editor">editor</option><option value="admin">admin</option></select>
                      <button type="button" onClick={() => void inviteMember()} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500"><UserPlus size={15} />Anadir</button>
                    </div>
                    <div className="rounded-xl border border-zinc-200 bg-white/80 divide-y divide-zinc-100">
                      {members.map((member) => (
                        <div key={member.id} className="p-3 flex items-center gap-2">
                          <div className="min-w-0 flex-1"><p className="text-sm text-zinc-800 truncate">{member.profile?.name || member.user_id}</p><p className="text-[11px] text-zinc-500 truncate">{member.user_id}</p></div>
                          {member.is_owner ? <span className="text-xs px-2 py-1 rounded-full bg-amber-50 border border-amber-100 text-amber-700">owner</span> : (
                            <>
                              <select value={member.role} onChange={(e) => void updateMemberRole(member.id, e.target.value as 'admin' | 'editor' | 'viewer')} className="text-xs px-2 py-1 rounded-lg border border-zinc-200 bg-white text-zinc-700"><option value="viewer">viewer</option><option value="editor">editor</option><option value="admin">admin</option></select>
                              <button type="button" onClick={() => void removeMember(member.id)} className="p-1.5 rounded-lg text-zinc-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/60 bg-white/55 p-4 space-y-3">
                    <p className="text-sm font-semibold text-zinc-800">Compartir por enlace (expiracion + contrasena)</p>
                    <div className="flex flex-wrap gap-2">
                      <select value={shareRole} onChange={(e) => setShareRole(e.target.value as 'viewer' | 'editor')} className="px-3 py-2 rounded-xl border border-zinc-200 bg-white/85 text-sm text-zinc-700"><option value="viewer">viewer</option><option value="editor">editor</option></select>
                      <input type="number" value={shareHours} onChange={(e) => setShareHours(Math.max(1, Number(e.target.value || 1)))} min={1} max={720} className="w-28 px-3 py-2 rounded-xl border border-zinc-200 bg-white/85 text-sm text-zinc-700" />
                      <input value={sharePassword} onChange={(e) => setSharePassword(e.target.value)} type="password" placeholder="Contrasena (opcional)" className="flex-1 min-w-[180px] px-3 py-2 rounded-xl border border-zinc-200 bg-white/85 text-sm text-zinc-700" />
                      <button type="button" onClick={() => void createShare()} disabled={creatingShare} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-50">{creatingShare ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}Crear enlace</button>
                    </div>
                    <div className="rounded-xl border border-zinc-200 bg-white/80 divide-y divide-zinc-100">
                      {shares.map((share) => (
                        <div key={share.id} className="p-3 flex items-center gap-2">
                          <div className="min-w-0 flex-1"><p className="text-sm text-zinc-800 truncate">{share.url || share.share_token}</p><p className="text-[11px] text-zinc-500">rol: {share.role} · vistas: {share.view_count}{share.has_password ? ' · con contrasena' : ''}</p></div>
                          {share.url && <button type="button" onClick={() => navigator.clipboard.writeText(share.url || '')} className="p-1.5 rounded-lg text-zinc-500 hover:bg-white"><Copy size={14} /></button>}
                          <button type="button" onClick={() => void toggleShare(share, !share.is_active)} className={`px-2 py-1 rounded-lg text-xs font-semibold border ${share.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-zinc-100 text-zinc-600 border-zinc-200'}`}>{share.is_active ? 'Activo' : 'Inactivo'}</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'quality' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/60 bg-white/55 p-4">
                <p className="text-sm font-semibold text-zinc-800">Deteccion de contradicciones entre chats</p>
                <button type="button" onClick={() => void analyzeContradictions()} disabled={analysisLoading} className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-50">{analysisLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}Analizar ahora</button>
              </div>
              {(analysisSummary || contradictions.length > 0) && (
                <div className="rounded-2xl border border-white/60 bg-white/55 p-4">
                  {analysisSummary && <p className="text-sm text-zinc-700 mb-3">{analysisSummary}</p>}
                  <div className="space-y-2">{contradictions.map((item) => (
                    <div key={item.id} className="rounded-xl border border-zinc-200 bg-white/80 p-3">
                      <p className="text-xs font-semibold text-zinc-600">{item.topic} · {(item.confidence * 100).toFixed(0)}%</p>
                      <p className="text-sm text-zinc-700 mt-1"><span className="font-semibold">A:</span> {item.statement_a}</p>
                      <p className="text-sm text-zinc-700"><span className="font-semibold">B:</span> {item.statement_b}</p>
                      {item.recommendation && <p className="text-xs text-zinc-600 mt-1">{item.recommendation}</p>}
                    </div>
                  ))}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
