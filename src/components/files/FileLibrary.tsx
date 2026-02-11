'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUIStore } from '@/store/ui-store'
import { FileRecord } from '@/lib/types'
import { useDropzone } from 'react-dropzone'
import { Upload, FileText, Image, Music, Video, Trash2, BookOpen, Loader2, RefreshCw, Eye, X, Search } from 'lucide-react'

interface Props {
  onClose: () => void
  projectId?: string | null
}

export default function FileLibrary({ onClose, projectId = null }: Props) {
  const [files, setFiles] = useState<FileRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [ingesting, setIngesting] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const { openFilePreview } = useUIStore()

  useEffect(() => { loadFiles() }, [projectId])

  const loadFiles = async () => {
    setLoading(true)
    const supabase = createClient()
    let query = supabase.from('files').select('*').order('created_at', { ascending: false })
    if (projectId) query = query.eq('project_id', projectId)
    const { data } = await query
    if (data) setFiles(data)
    setLoading(false)
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
          user_id: user.id, project_id: projectId, storage_path: path,
          filename: file.name, mime: file.type, size: file.size,
        }).select().single()
        if (fileRec) setFiles(prev => [fileRec, ...prev])
      }
    }
    setUploading(false)
  }, [projectId])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop })

  const handleIngest = async (fileId: string) => {
    setIngesting(fileId)
    try {
      const res = await fetch('/api/files/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_id: fileId }),
      })
      const data = await res.json()
      if (data.success) {
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, ingest_status: 'done' as const } : f))
      } else {
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, ingest_status: 'failed' as const } : f))
      }
    } catch {
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, ingest_status: 'failed' as const } : f))
    }
    setIngesting(null)
  }

  const handleDelete = async (fileId: string) => {
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

  const getIcon = (mime: string | null) => {
    if (mime?.startsWith('image/')) return <Image size={14} className="text-blue-500" />
    if (mime?.startsWith('audio/')) return <Music size={14} className="text-purple-500" />
    if (mime?.startsWith('video/')) return <Video size={14} className="text-emerald-500" />
    return <FileText size={14} className="text-zinc-400" />
  }

  const filteredFiles = files.filter(f => f.filename.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[85vh] bg-white border border-zinc-200 rounded-xl shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-zinc-800"><FileText size={16} className="text-blue-500" /> Archivos</h2>
          <div className="flex items-center gap-2">
            <button onClick={loadFiles} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400" title="Recargar"><RefreshCw size={14} /></button>
            <button onClick={onClose} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400"><X size={16} /></button>
          </div>
        </div>

        {/* Drop zone */}
        <div {...getRootProps()} className={`mx-4 mt-3 border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-zinc-300 hover:border-zinc-400'}`}>
          <input {...getInputProps()} />
          {uploading ? (
            <div className="flex items-center justify-center gap-2 text-sm text-zinc-500"><Loader2 size={16} className="animate-spin" /> Subiendo...</div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-sm text-zinc-500">
              <Upload size={16} /> {isDragActive ? 'Suelta aquí' : 'Arrastra archivos o haz clic para subir'}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="px-4 pt-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg">
            <Search size={14} className="text-zinc-400" />
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filtrar archivos..."
              className="flex-1 bg-transparent text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none" />
          </div>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-zinc-400" size={20} /></div>}
          {!loading && filteredFiles.length === 0 && <p className="text-xs text-zinc-400 text-center py-8">Sin archivos</p>}
          {filteredFiles.map(f => (
            <div key={f.id} className="group flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-50 rounded-lg transition-colors">
              {getIcon(f.mime)}
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
                <button onClick={() => handleDelete(f.id)} className="p-1 hover:bg-zinc-200 rounded text-red-500" title="Eliminar"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

