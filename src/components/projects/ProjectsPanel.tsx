'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Project, Conversation } from '@/lib/types'
import { useChatStore } from '@/store/chat-store'
import { useUIStore } from '@/store/ui-store'
import { Plus, FolderOpen, Trash2, Pencil, ArrowLeft, MessageSquare, FileText, Brain, X, Loader2, Check, Settings, Eye, RefreshCw } from 'lucide-react'
import ProjectSettingsModal from '@/components/projects/ProjectSettingsModal'
import ConversationItem from '@/components/sidebar/ConversationItem'

interface Props {
  onClose: () => void
}

interface ProjectFolder {
  id: string
  name: string
  sort_order: number
  created_at: string
}

interface ProjectFileRow {
  id: string
  filename: string
  mime: string | null
  size: number
  ingest_status: string
  ingest_error?: string | null
  created_at: string
  file_version?: number
  last_reindexed_at?: string | null
  meta_json?: Record<string, unknown> | null
}

export default function ProjectsPanel({ onClose }: Props) {
  const router = useRouter()
  const { openFilePreview, addToast } = useUIStore()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [activeTab, setActiveTab] = useState<'chats' | 'files' | 'memory'>('chats')
  const [projectFiles, setProjectFiles] = useState<ProjectFileRow[]>([])
  const [projectConversations, setProjectConversations] = useState<Conversation[]>([])
  const [projectFolders, setProjectFolders] = useState<ProjectFolder[]>([])
  const [newFolderName, setNewFolderName] = useState('')
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false)
  const [loadingProjectData, setLoadingProjectData] = useState(false)
  const {
    conversations,
    activeConversationId,
    setActiveConversation,
    createConversation,
    loadConversations,
    setProjectContextId,
  } = useChatStore()

  const canEditProject = useMemo(() => {
    const role = activeProject?.my_role || 'viewer'
    return role === 'owner' || role === 'admin' || role === 'editor'
  }, [activeProject?.my_role])

  const loadProjects = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/projects')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'No se pudo cargar proyectos')
      setProjects(Array.isArray(data?.projects) ? data.projects : [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cargar proyectos'
      addToast({ type: 'error', message })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  async function loadProjectData(projectId: string) {
    setLoadingProjectData(true)
    try {
      const [filesRes, foldersRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/files`),
        fetch(`/api/projects/${projectId}/folders`),
      ])
      const [filesData, foldersData] = await Promise.all([
        filesRes.json().catch(() => ({})),
        foldersRes.json().catch(() => ({})),
      ])

      if (filesRes.ok) {
        setProjectFiles(Array.isArray(filesData?.files) ? filesData.files : [])
      }
      if (foldersRes.ok) {
        setProjectFolders(Array.isArray(foldersData?.folders) ? foldersData.folders : [])
      }
    } finally {
      setLoadingProjectData(false)
    }
  }

  useEffect(() => {
    if (!activeProject) {
      setProjectConversations([])
      return
    }
    setProjectConversations(
      conversations
        .filter((conversation) => conversation.project_id === activeProject.id && conversation.deleted_at === null)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    )
  }, [activeProject, conversations])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadProjects() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadProjects])

  const handleCreate = async () => {
    if (!newName.trim()) return
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.project) throw new Error(data?.error || 'No se pudo crear proyecto')
      setProjects((prev) => [data.project, ...prev])
      setNewName('')
      setNewDesc('')
      setCreating(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear proyecto'
      addToast({ type: 'error', message })
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'No se pudo eliminar proyecto')
      setProjects((prev) => prev.filter((project) => project.id !== id))
      if (activeProject?.id === id) {
        setActiveProject(null)
        setProjectContextId(null)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo eliminar proyecto'
      addToast({ type: 'error', message })
    }
  }

  const handleRename = async (id: string) => {
    if (!editName.trim()) return
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.project) throw new Error(data?.error || 'No se pudo renombrar')
      setProjects((prev) => prev.map((project) => project.id === id ? { ...project, ...data.project } : project))
      if (activeProject?.id === id) setActiveProject((prev) => prev ? { ...prev, ...data.project } : prev)
      setEditingId(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo renombrar'
      addToast({ type: 'error', message })
    }
  }

  const openProject = async (project: Project) => {
    setActiveProject(project)
    setActiveTab('chats')
    setProjectContextId(project.id)
    setActiveConversation(null)
    router.push('/chat')
    await Promise.all([loadConversations(), loadProjectData(project.id)])
  }

  const handleNewChat = async () => {
    if (!activeProject) return
    const id = await createConversation(activeProject.id)
    if (id) {
      setActiveConversation(id)
      router.push(`/chat/${id}`)
      void loadProjectData(activeProject.id)
    }
  }

  const createFolder = async () => {
    if (!activeProject || !newFolderName.trim()) return
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim(), sort_order: projectFolders.length }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.folder) throw new Error(data?.error || 'No se pudo crear carpeta')
      setProjectFolders((prev) => [...prev, data.folder])
      setNewFolderName('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear carpeta'
      addToast({ type: 'error', message })
    }
  }

  const moveConversationToFolder = async (conversationId: string, folderId: string | null) => {
    if (!activeProject) return
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/conversations/${conversationId}/folder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id: folderId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.conversation) throw new Error(data?.error || 'No se pudo mover el chat')
      setProjectConversations((prev) => prev.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, project_folder_id: folderId }
          : conversation
      ))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo mover el chat'
      addToast({ type: 'error', message })
    }
  }

  const reindexFile = async (fileId: string) => {
    try {
      const res = await fetch('/api/files/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_id: fileId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'No se pudo reindexar archivo')
      addToast({ type: 'success', message: 'Archivo reindexado correctamente' })
      if (activeProject) void loadProjectData(activeProject.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo reindexar archivo'
      addToast({ type: 'error', message })
    }
  }

  const groupedConversations = useMemo(() => {
    const map = new Map<string, Conversation[]>()
    for (const conversation of projectConversations) {
      const key = conversation.project_folder_id || '__root__'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(conversation)
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    }
    return map
  }, [projectConversations])

  if (activeProject) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2 px-3 py-3 border-b border-zinc-200">
          <button onClick={() => setActiveProject(null)} className="p-1 hover:bg-zinc-200 rounded text-zinc-600"><ArrowLeft size={16} /></button>
          <FolderOpen size={16} className="text-blue-500" />
          <span className="text-sm font-medium truncate text-zinc-800">{activeProject.name}</span>
          <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 uppercase tracking-wide">
            {activeProject.my_role || 'viewer'}
          </span>
          <button
            onClick={() => setProjectSettingsOpen(true)}
            className="ml-auto p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-500"
            title="Configuracion del proyecto"
          >
            <Settings size={14} />
          </button>
          {canEditProject && (
            <button onClick={handleNewChat} className="p-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-white" title="Nuevo chat en proyecto"><Plus size={14} /></button>
          )}
        </div>
        <div className="flex border-b border-zinc-200">
          {(['chats', 'files', 'memory'] as const).map((tabId) => (
            <button
              key={tabId}
              onClick={() => setActiveTab(tabId)}
              className={`flex-1 py-2 text-xs text-center transition-colors ${activeTab === tabId ? 'text-blue-600 border-b-2 border-blue-600' : 'text-zinc-500 hover:text-zinc-700'}`}
            >
              {tabId === 'chats' && <MessageSquare size={12} className="inline mr-1" />}
              {tabId === 'files' && <FileText size={12} className="inline mr-1" />}
              {tabId === 'memory' && <Brain size={12} className="inline mr-1" />}
              {tabId === 'chats' ? 'Chats' : tabId === 'files' ? 'Archivos' : 'Memoria'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {loadingProjectData && (
            <div className="flex items-center justify-center py-8 text-zinc-400">
              <Loader2 className="animate-spin" size={18} />
            </div>
          )}

          {!loadingProjectData && activeTab === 'chats' && (
            <div className="space-y-2">
              {canEditProject && (
                <div className="rounded-xl border border-zinc-200 bg-white/70 p-2 flex items-center gap-2">
                  <input
                    value={newFolderName}
                    onChange={(event) => setNewFolderName(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') void createFolder() }}
                    placeholder="Nueva carpeta"
                    className="flex-1 px-2 py-1.5 rounded-lg border border-zinc-200 bg-white text-xs text-zinc-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => void createFolder()}
                    className="px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500"
                  >
                    Crear
                  </button>
                </div>
              )}

              {projectConversations.length === 0 && (
                <p className="text-xs text-zinc-400 text-center py-4">Sin chats</p>
              )}

              {projectFolders.map((folder) => {
                const items = groupedConversations.get(folder.id) || []
                if (items.length === 0) return null
                return (
                  <div key={folder.id} className="rounded-xl border border-zinc-200 bg-white/65">
                    <div className="px-3 py-2 border-b border-zinc-100 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      {folder.name}
                    </div>
                    <div className="divide-y divide-zinc-100">
                      {items.map((conversation) => (
                        <div key={conversation.id} className="px-2 py-1.5 space-y-1.5">
                          <ConversationItem
                            conversation={conversation}
                            active={conversation.id === activeConversationId}
                          />
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-[10px] text-zinc-400 px-2">
                              {new Date(conversation.updated_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {canEditProject && (
                              <select
                                value={conversation.project_folder_id || ''}
                                onChange={(event) => void moveConversationToFolder(conversation.id, event.target.value || null)}
                                className="ml-auto text-[10px] border border-zinc-200 rounded-md px-1.5 py-0.5 bg-white text-zinc-600"
                              >
                                <option value="">Sin carpeta</option>
                                {projectFolders.map((option) => (
                                  <option key={option.id} value={option.id}>{option.name}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}

              {(groupedConversations.get('__root__') || []).length > 0 && (
                <div className="rounded-xl border border-zinc-200 bg-white/65">
                  <div className="px-3 py-2 border-b border-zinc-100 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Sin carpeta
                  </div>
                  <div className="divide-y divide-zinc-100">
                    {(groupedConversations.get('__root__') || []).map((conversation) => (
                      <div key={conversation.id} className="px-2 py-1.5 space-y-1.5">
                        <ConversationItem
                          conversation={conversation}
                          active={conversation.id === activeConversationId}
                        />
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[10px] text-zinc-400 px-2">
                            {new Date(conversation.updated_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {canEditProject && (
                            <select
                              value={conversation.project_folder_id || ''}
                              onChange={(event) => void moveConversationToFolder(conversation.id, event.target.value || null)}
                              className="ml-auto text-[10px] border border-zinc-200 rounded-md px-1.5 py-0.5 bg-white text-zinc-600"
                            >
                              <option value="">Sin carpeta</option>
                              {projectFolders.map((option) => (
                                <option key={option.id} value={option.id}>{option.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!loadingProjectData && activeTab === 'files' && (
            <div className="space-y-2">
              {projectFiles.length === 0 && (
                <p className="text-xs text-zinc-400 text-center py-4">Sin archivos</p>
              )}
              {projectFiles.map((file) => {
                const meta = (file.meta_json || {}) as Record<string, unknown>
                const language = String(meta.detected_language || meta.language || '').trim()
                const department = String(meta.department || '').trim()
                return (
                  <div key={file.id} className="rounded-xl border border-zinc-200 bg-white/70 p-3">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-zinc-400 shrink-0" />
                      <span className="truncate flex-1 text-sm text-zinc-800 font-medium">{file.filename}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${file.ingest_status === 'done' ? 'bg-green-50 text-green-600' : file.ingest_status === 'failed' ? 'bg-red-50 text-red-600' : 'bg-zinc-100 text-zinc-500'}`}>{file.ingest_status}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500 flex flex-wrap gap-x-3 gap-y-1">
                      <span>{file.mime || 'application/octet-stream'}</span>
                      <span>{(Math.max(0, Number(file.size || 0)) / 1024).toFixed(1)} KB</span>
                      <span>v{Math.max(1, Number(file.file_version || 1))}</span>
                      {language && <span>Idioma: {language}</span>}
                      {department && <span>Depto: {department}</span>}
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openFilePreview(file.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                      >
                        <Eye size={12} /> Vista previa
                      </button>
                      {canEditProject && (
                        <button
                          type="button"
                          onClick={() => void reindexFile(file.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                        >
                          <RefreshCw size={12} /> Reindexar
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {!loadingProjectData && activeTab === 'memory' && (
            <p className="text-xs text-zinc-400 text-center py-4">Memoria del proyecto</p>
          )}
        </div>

        {projectSettingsOpen && (
          <ProjectSettingsModal
            project={activeProject}
            onClose={() => {
              setProjectSettingsOpen(false)
              void loadProjectData(activeProject.id)
            }}
            onProjectUpdated={(updated) => {
              setActiveProject(updated)
              setProjects((prev) => prev.map((project) => project.id === updated.id ? updated : project))
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-3 border-b border-zinc-200">
        <div className="flex items-center gap-2">
          <FolderOpen size={16} className="text-blue-500" />
          <span className="text-sm font-semibold text-zinc-800">Proyectos</span>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setCreating((prev) => !prev)} className="p-1.5 hover:bg-zinc-200 rounded-lg text-zinc-600"><Plus size={16} /></button>
          <button onClick={onClose} className="p-1.5 hover:bg-zinc-200 rounded-lg text-zinc-400"><X size={16} /></button>
        </div>
      </div>
      {creating && (
        <div className="p-3 border-b border-zinc-200 space-y-2">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Nombre del proyecto"
            className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <textarea
            value={newDesc}
            onChange={(event) => setNewDesc(event.target.value)}
            placeholder="Descripcion (opcional)"
            className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-800 resize-none h-16 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setCreating(false)} className="px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 rounded-lg">Cancelar</button>
            <button onClick={() => void handleCreate()} className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg">Crear</button>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-zinc-400" size={20} /></div>}
        {!loading && projects.length === 0 && <p className="text-xs text-zinc-400 text-center py-8">Sin proyectos</p>}
        {projects.map((project) => (
          <div
            key={project.id}
            className="group flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-100 rounded-lg cursor-pointer"
            onClick={() => void openProject(project)}
          >
            <FolderOpen size={14} className="text-blue-500 shrink-0" />
            {editingId === project.id ? (
              <div className="flex items-center gap-1 flex-1" onClick={(event) => event.stopPropagation()}>
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  className="flex-1 bg-zinc-50 px-2 py-1 text-sm rounded border border-zinc-200 text-zinc-800 focus:outline-none"
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void handleRename(project.id)
                    if (event.key === 'Escape') setEditingId(null)
                  }}
                />
                <button onClick={() => void handleRename(project.id)} className="p-1 text-green-500"><Check size={14} /></button>
              </div>
            ) : (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm truncate text-zinc-700">{project.name}</p>
                  {project.my_role && (
                    <span className="text-[9px] uppercase tracking-wide bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded-full">
                      {project.my_role}
                    </span>
                  )}
                </div>
                {project.description && <p className="text-[10px] text-zinc-400 truncate">{project.description}</p>}
              </div>
            )}
            <div className="flex gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity" onClick={(event) => event.stopPropagation()}>
              {(project.my_role === 'owner' || project.my_role === 'admin') && (
                <button onClick={() => { setEditingId(project.id); setEditName(project.name) }} className="p-2 md:p-1 hover:bg-zinc-200 rounded text-zinc-500"><Pencil size={12} /></button>
              )}
              {project.my_role === 'owner' && (
                <button onClick={() => void handleDelete(project.id)} className="p-2 md:p-1 hover:bg-zinc-200 rounded text-red-500"><Trash2 size={12} /></button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
