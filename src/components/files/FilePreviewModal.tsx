'use client'

import { useState, useEffect } from 'react'
import { useUIStore } from '@/store/ui-store'
import { createClient } from '@/lib/supabase/client'
import { FileRecord } from '@/lib/types'
import { X, Download, ExternalLink, Copy, FileText, Image as ImageIcon, Music, Video, Loader2 } from 'lucide-react'

export default function FilePreviewModal() {
  const { filePreviewId, closeFilePreview } = useUIStore()
  const [file, setFile] = useState<FileRecord | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!filePreviewId) return
    const load = async () => {
      setLoading(true)
      const supabase = createClient()
      const { data: fileData } = await supabase.from('files').select('*').eq('id', filePreviewId).single()
      if (fileData) {
        setFile(fileData)
        const { data: signedUrl } = await supabase.storage.from('user-files').createSignedUrl(fileData.storage_path, 3600)
        if (signedUrl) setUrl(signedUrl.signedUrl)
      }
      setLoading(false)
    }
    load()
  }, [filePreviewId])

  if (!filePreviewId) return null

  const isPDF = file?.mime === 'application/pdf'
  const isImage = file?.mime?.startsWith('image/')
  const isAudio = file?.mime?.startsWith('audio/')
  const isVideo = file?.mime?.startsWith('video/')

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={closeFilePreview}>
      <div className="w-full max-w-4xl max-h-[90vh] bg-white border border-zinc-200 rounded-xl shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
          <div className="flex items-center gap-2 min-w-0">
            {isPDF && <FileText size={16} className="text-red-500" />}
            {isImage && <ImageIcon size={16} className="text-blue-500" />}
            {isAudio && <Music size={16} className="text-purple-500" />}
            {isVideo && <Video size={16} className="text-emerald-500" />}
            <span className="text-sm font-medium truncate text-zinc-800">{file?.filename}</span>
          </div>
          <div className="flex items-center gap-2">
            {url && (
              <>
                <button onClick={() => { navigator.clipboard.writeText(url) }} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400" title="Copiar link"><Copy size={14} /></button>
                <a href={url} target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400" title="Abrir en pestaña"><ExternalLink size={14} /></a>
                <a href={url} download={file?.filename} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400" title="Descargar"><Download size={14} /></a>
              </>
            )}
            <button onClick={closeFilePreview} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400"><X size={16} /></button>
          </div>
        </div>

        {/* Preview area */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[300px] bg-zinc-50">
          {loading && <Loader2 className="animate-spin text-zinc-400" size={32} />}
          {!loading && url && isPDF && (
            <iframe src={`${url}#toolbar=1`} className="w-full h-[70vh] rounded-lg bg-white" title="PDF Preview" />
          )}
          {!loading && url && isImage && (
            <img src={url} alt={file?.filename} className="max-w-full max-h-[70vh] rounded-lg object-contain" />
          )}
          {!loading && url && isAudio && (
            <div className="w-full max-w-md">
              <audio controls src={url} className="w-full" />
            </div>
          )}
          {!loading && url && isVideo && (
            <video controls src={url} className="max-w-full max-h-[70vh] rounded-lg" />
          )}
          {!loading && url && !isPDF && !isImage && !isAudio && !isVideo && (
            <div className="text-center text-zinc-400">
              <FileText size={48} className="mx-auto mb-4" />
              <p className="text-sm">Vista previa no disponible para este tipo de archivo</p>
              <a href={url} download={file?.filename} className="text-blue-600 text-sm hover:underline mt-2 inline-block">Descargar archivo</a>
            </div>
          )}
        </div>

        {/* Metadata */}
        {file && (
          <div className="px-4 py-3 border-t border-zinc-200 flex flex-wrap gap-4 text-xs text-zinc-500">
            <span>Tipo: {file.mime}</span>
            <span>Tamaño: {formatSize(file.size)}</span>
            <span>Subido: {new Date(file.created_at).toLocaleString('es-ES')}</span>
            {file.ingest_status !== 'none' && (
              <span className={`px-1.5 py-0.5 rounded ${file.ingest_status === 'done' ? 'bg-green-50 text-green-600' : file.ingest_status === 'failed' ? 'bg-red-50 text-red-600' : 'bg-yellow-50 text-yellow-600'}`}>
                RAG: {file.ingest_status}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

