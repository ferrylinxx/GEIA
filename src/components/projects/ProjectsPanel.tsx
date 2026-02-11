'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Project } from '@/lib/types'
import { useChatStore } from '@/store/chat-store'
import { Plus, FolderOpen, Trash2, Pencil, ArrowLeft, MessageSquare, FileText, Brain, X, Loader2, Check } from 'lucide-react'

interface Props {
  onClose: () => void
}

export default function ProjectsPanel({ onClose }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [activeTab, setActiveTab] = useState<'chats' | 'files' | 'memory'>('chats')
  const [projectConvs, setProjectConvs] = useState<{ id: string; title: string; created_at: string }[]>([])
  const [projectFiles, setProjectFiles] = useState<{ id: string; filename: string; ingest_status: string; created_at: string }[]>([])
  const { setActiveConversation, createConversation } = useChatStore()

  useEffect(() => { loadProjects() }, [])

  const loadProjects = async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
    if (data) setProjects(data)
    setLoading(false)
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('projects').insert({
      user_id: user.id, name: newName.trim(), description: newDesc.trim(),
    }).select().single()
    if (data) { setProjects([data, ...projects]); setNewName(''); setNewDesc(''); setCreating(false) }
  }

  const handleDelete = async (id: string) => {
    const supabase = createClient()
    await supabase.from('projects').delete().eq('id', id)
    setProjects(projects.filter(p => p.id !== id))
    if (activeProject?.id === id) setActiveProject(null)
  }

  const handleRename = async (id: string) => {
    if (!editName.trim()) return
    const supabase = createClient()
    await supabase.from('projects').update({ name: editName.trim() }).eq('id', id)
    setProjects(projects.map(p => p.id === id ? { ...p, name: editName.trim() } : p))
    setEditingId(null)
  }

  const openProject = async (project: Project) => {
    setActiveProject(project)
    setActiveTab('chats')
    const supabase = createClient()
    const { data: convs } = await supabase.from('conversations').select('id, title, created_at')
      .eq('project_id', project.id).is('deleted_at', null).order('updated_at', { ascending: false })
    if (convs) setProjectConvs(convs)
    const { data: files } = await supabase.from('files').select('id, filename, ingest_status, created_at')
      .eq('project_id', project.id).order('created_at', { ascending: false })
    if (files) setProjectFiles(files)
  }

  const handleNewChat = async () => {
    if (!activeProject) return
    const id = await createConversation(activeProject.id)
    if (id) { setActiveConversation(id); onClose() }
  }

  if (activeProject) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2 px-3 py-3 border-b border-zinc-200">
          <button onClick={() => setActiveProject(null)} className="p-1 hover:bg-zinc-200 rounded text-zinc-600"><ArrowLeft size={16} /></button>
          <FolderOpen size={16} className="text-blue-500" />
          <span className="text-sm font-medium truncate text-zinc-800">{activeProject.name}</span>
          <button onClick={handleNewChat} className="ml-auto p-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-white" title="Nuevo chat en proyecto"><Plus size={14} /></button>
        </div>
        <div className="flex border-b border-zinc-200">
          {(['chats', 'files', 'memory'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`flex-1 py-2 text-xs text-center transition-colors ${activeTab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-zinc-500 hover:text-zinc-700'}`}>
              {t === 'chats' && <MessageSquare size={12} className="inline mr-1" />}
              {t === 'files' && <FileText size={12} className="inline mr-1" />}
              {t === 'memory' && <Brain size={12} className="inline mr-1" />}
              {t === 'chats' ? 'Chats' : t === 'files' ? 'Archivos' : 'Memoria'}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {activeTab === 'chats' && projectConvs.map(c => (
            <button key={c.id} onClick={() => { setActiveConversation(c.id); onClose() }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 rounded-lg truncate text-zinc-700">{c.title}</button>
          ))}
          {activeTab === 'chats' && projectConvs.length === 0 && <p className="text-xs text-zinc-400 text-center py-4">Sin chats</p>}
          {activeTab === 'files' && projectFiles.map(f => (
            <div key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-100 rounded-lg text-zinc-700">
              <FileText size={14} className="text-zinc-400" />
              <span className="truncate flex-1">{f.filename}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${f.ingest_status === 'done' ? 'bg-green-50 text-green-600' : 'bg-zinc-100 text-zinc-500'}`}>{f.ingest_status}</span>
            </div>
          ))}
          {activeTab === 'files' && projectFiles.length === 0 && <p className="text-xs text-zinc-400 text-center py-4">Sin archivos</p>}
          {activeTab === 'memory' && <p className="text-xs text-zinc-400 text-center py-4">Memoria del proyecto</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-3 border-b border-zinc-200">
        <div className="flex items-center gap-2"><FolderOpen size={16} className="text-blue-500" /><span className="text-sm font-semibold text-zinc-800">Proyectos</span></div>
        <div className="flex gap-1">
          <button onClick={() => setCreating(!creating)} className="p-1.5 hover:bg-zinc-200 rounded-lg text-zinc-600"><Plus size={16} /></button>
          <button onClick={onClose} className="p-1.5 hover:bg-zinc-200 rounded-lg text-zinc-400"><X size={16} /></button>
        </div>
      </div>
      {creating && (
        <div className="p-3 border-b border-zinc-200 space-y-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre del proyecto"
            className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Descripción (opcional)"
            className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-800 resize-none h-16 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setCreating(false)} className="px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 rounded-lg">Cancelar</button>
            <button onClick={handleCreate} className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg">Crear</button>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-zinc-400" size={20} /></div>}
        {!loading && projects.length === 0 && <p className="text-xs text-zinc-400 text-center py-8">Sin proyectos</p>}
        {projects.map(p => (
          <div key={p.id} className="group flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-100 rounded-lg cursor-pointer" onClick={() => openProject(p)}>
            <FolderOpen size={14} className="text-blue-500 shrink-0" />
            {editingId === p.id ? (
              <div className="flex items-center gap-1 flex-1" onClick={e => e.stopPropagation()}>
                <input value={editName} onChange={e => setEditName(e.target.value)} className="flex-1 bg-zinc-50 px-2 py-1 text-sm rounded border border-zinc-200 text-zinc-800 focus:outline-none" autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleRename(p.id); if (e.key === 'Escape') setEditingId(null) }} />
                <button onClick={() => handleRename(p.id)} className="p-1 text-green-500"><Check size={14} /></button>
              </div>
            ) : (
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate text-zinc-700">{p.name}</p>
                {p.description && <p className="text-[10px] text-zinc-400 truncate">{p.description}</p>}
              </div>
            )}
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100" onClick={e => e.stopPropagation()}>
              <button onClick={() => { setEditingId(p.id); setEditName(p.name) }} className="p-1 hover:bg-zinc-200 rounded text-zinc-500"><Pencil size={12} /></button>
              <button onClick={() => handleDelete(p.id)} className="p-1 hover:bg-zinc-200 rounded text-red-500"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

