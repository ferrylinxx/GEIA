'use client'

import { useState, useEffect, useRef } from 'react'
import { useUIStore } from '@/store/ui-store'
import { useChatStore } from '@/store/chat-store'
import { createClient } from '@/lib/supabase/client'
import { FileRecord } from '@/lib/types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  X,
  Download,
  ExternalLink,
  Copy,
  FileText,
  Image as ImageIcon,
  Music,
  Video,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RefreshCw,
} from 'lucide-react'

async function triggerDownload(url: string, filename: string) {
  try {
    const response = await fetch(url)
    if (response.ok) {
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
      return
    }
  } catch {
    // fallback below
  }

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

async function copyImageToClipboard(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Image fetch failed')
  const blob = await response.blob()
  await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })])
}

function isMarkdownFile(file: FileRecord | null): boolean {
  if (!file) return false
  const mime = (file.mime || '').toLowerCase()
  const name = (file.filename || '').toLowerCase()
  return mime.includes('markdown') || name.endsWith('.md') || name.endsWith('.markdown')
}

function isTextPreviewableFile(file: FileRecord | null): boolean {
  if (!file) return false
  const mime = (file.mime || '').toLowerCase()
  const baseMime = mime.split(';')[0].trim()
  const name = (file.filename || '').toLowerCase()

  // Never treat office/zip binaries as text previews.
  if (
    baseMime.startsWith('application/vnd.openxmlformats-officedocument') ||
    baseMime.startsWith('application/vnd.ms-') ||
    baseMime === 'application/msword' ||
    baseMime === 'application/vnd.ms-excel' ||
    baseMime === 'application/vnd.ms-powerpoint' ||
    baseMime === 'application/zip' ||
    baseMime === 'application/x-zip-compressed' ||
    /\.(doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp)$/i.test(name)
  ) {
    return false
  }

  if (baseMime.startsWith('text/')) return true
  if (
    baseMime === 'application/json' ||
    baseMime === 'application/ld+json' ||
    baseMime === 'application/xml' ||
    baseMime === 'application/yaml' ||
    baseMime === 'application/x-yaml' ||
    baseMime === 'application/csv'
  ) {
    return true
  }

  return /\.(md|markdown|txt|csv|json|xml|yaml|yml|log|ini|conf|rtf)$/i.test(name)
}

function isProbablyBinaryText(raw: string): boolean {
  if (!raw) return false
  if (raw.includes('\u0000')) return true
  const replacementCount = (raw.match(/\uFFFD/g) || []).length
  return replacementCount / raw.length > 0.02
}

function isDocxPreviewableFile(file: FileRecord | null): boolean {
  if (!file) return false
  const mime = (file.mime || '').toLowerCase().split(';')[0].trim()
  const name = (file.filename || '').toLowerCase()
  return mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx')
}

function isSpreadsheetPreviewableFile(file: FileRecord | null): boolean {
  if (!file) return false
  const mime = (file.mime || '').toLowerCase().split(';')[0].trim()
  const name = (file.filename || '').toLowerCase()
  return (
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel' ||
    name.endsWith('.xlsx') ||
    name.endsWith('.xls')
  )
}

interface SpreadsheetPreviewData {
  sheetName: string
  headers: string[]
  rows: string[][]
  truncated: boolean
}

export default function FilePreviewModal() {
  const {
    filePreviewOpen,
    filePreviewId,
    imagePreviewUrls,
    imagePreviewIndex,
    imagePreviewPrompt,
    setImagePreviewIndex,
    closeFilePreview,
  } = useUIStore()

  const {
    activeConversationId,
    selectedModel,
    ragMode,
    citeMode,
    webSearch,
    setIsStreaming,
    setStreamingConversationId,
    setStreamingContent,
    setStreamAbortController,
    loadMessages,
    loadConversations,
  } = useChatStore()

  const [file, setFile] = useState<FileRecord | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [textPreview, setTextPreview] = useState<string | null>(null)
  const [textPreviewTruncated, setTextPreviewTruncated] = useState(false)
  const [docxPreviewHtml, setDocxPreviewHtml] = useState<string | null>(null)
  const [sheetPreview, setSheetPreview] = useState<SpreadsheetPreviewData | null>(null)
  const [officePreviewError, setOfficePreviewError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [regeneratingVariant, setRegeneratingVariant] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0 })

  const isImageGallery = imagePreviewUrls.length > 0
  const galleryCount = imagePreviewUrls.length
  const currentImageIndex = galleryCount === 0 ? 0 : Math.max(0, Math.min(imagePreviewIndex, galleryCount - 1))
  const currentImageUrl = isImageGallery ? imagePreviewUrls[currentImageIndex] : null

  useEffect(() => {
    if (!filePreviewOpen) return
    if (!isImageGallery) return
    setFile(null)
    setUrl(null)
    setTextPreview(null)
    setTextPreviewTruncated(false)
    setDocxPreviewHtml(null)
    setSheetPreview(null)
    setOfficePreviewError(null)
    setLoading(false)
  }, [filePreviewOpen, isImageGallery])

  useEffect(() => {
    if (!filePreviewOpen || !filePreviewId || isImageGallery) return

    const load = async () => {
      setLoading(true)
      setTextPreview(null)
      setTextPreviewTruncated(false)
      setDocxPreviewHtml(null)
      setSheetPreview(null)
      setOfficePreviewError(null)
      const supabase = createClient()
      const { data: fileData } = await supabase.from('files').select('*').eq('id', filePreviewId).single()
      if (fileData) {
        setFile(fileData)
        const inlineUrl = `/api/files/${fileData.id}/download?inline=1`
        setUrl(inlineUrl)

        if (isTextPreviewableFile(fileData)) {
          try {
            const previewRes = await fetch(inlineUrl)
            if (previewRes.ok) {
              const rawText = await previewRes.text()
              if (isProbablyBinaryText(rawText)) {
                setTextPreview(null)
                setTextPreviewTruncated(false)
                setLoading(false)
                return
              }
              const maxChars = 200_000
              if (rawText.length > maxChars) {
                setTextPreview(rawText.slice(0, maxChars))
                setTextPreviewTruncated(true)
              } else {
                setTextPreview(rawText)
                setTextPreviewTruncated(false)
              }
            }
          } catch {
            setTextPreview(null)
            setTextPreviewTruncated(false)
          }
        }

        if (isDocxPreviewableFile(fileData) || isSpreadsheetPreviewableFile(fileData)) {
          try {
            const previewRes = await fetch(inlineUrl)
            if (!previewRes.ok) {
              setOfficePreviewError('No se pudo cargar la vista previa.')
            } else {
              const fileBuffer = await previewRes.arrayBuffer()
              if (isDocxPreviewableFile(fileData)) {
                const mammothMod = await import('mammoth/mammoth.browser.js')
                const mammoth = (mammothMod as { convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> }).convertToHtml
                const result = await mammoth({ arrayBuffer: fileBuffer })
                const safeHtml = (result?.value || '')
                  .replace(/<script[\s\S]*?<\/script>/gi, '')
                  .replace(/on\w+="[^"]*"/gi, '')
                setDocxPreviewHtml(safeHtml || '<p>Documento sin contenido visible.</p>')
              } else if (isSpreadsheetPreviewableFile(fileData)) {
                const XLSX = await import('xlsx')
                const workbook = XLSX.read(fileBuffer, { type: 'array', raw: false, cellDates: true })
                const firstSheetName = workbook.SheetNames[0]
                const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : null
                if (!worksheet) {
                  setOfficePreviewError('No se pudo leer la hoja de cálculo.')
                } else {
                  const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' }) as unknown[][]
                  const sliced = matrix.slice(0, 201)
                  const colCount = Math.max(1, ...sliced.map((row) => Array.isArray(row) ? row.length : 0))
                  const normalizedRows = sliced.map((row) => {
                    const safeRow = Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : []
                    if (safeRow.length < colCount) {
                      return [...safeRow, ...Array.from({ length: colCount - safeRow.length }, () => '')]
                    }
                    return safeRow
                  })

                  const rawHeaders = normalizedRows[0] || []
                  const headers = rawHeaders.map((value, idx) => value || `Columna ${idx + 1}`)
                  const rows = normalizedRows.slice(1)
                  setSheetPreview({
                    sheetName: firstSheetName || 'Hoja 1',
                    headers,
                    rows,
                    truncated: matrix.length > 201,
                  })
                }
              }
            }
          } catch {
            setOfficePreviewError('No se pudo generar la vista previa del archivo.')
          }
        }
      }
      setLoading(false)
    }

    load()
  }, [filePreviewOpen, filePreviewId, isImageGallery])

  useEffect(() => {
    if (!filePreviewOpen) return
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setIsPanning(false)
  }, [filePreviewOpen, currentImageIndex])

  useEffect(() => {
    if (!filePreviewOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeFilePreview()
        return
      }

      if (!isImageGallery || galleryCount <= 1) return

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        setImagePreviewIndex((currentImageIndex + 1) % galleryCount)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setImagePreviewIndex((currentImageIndex - 1 + galleryCount) % galleryCount)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [filePreviewOpen, isImageGallery, galleryCount, currentImageIndex, setImagePreviewIndex, closeFilePreview])

  if (!filePreviewOpen) return null

  const mimeBase = (file?.mime || '').toLowerCase().split(';')[0].trim()
  const fileNameLower = (file?.filename || '').toLowerCase()
  const isPDF = mimeBase === 'application/pdf' || fileNameLower.endsWith('.pdf')
  const isImage = mimeBase.startsWith('image/')
  const isAudio = mimeBase.startsWith('audio/')
  const isVideo = mimeBase.startsWith('video/')
  const isMarkdown = isMarkdownFile(file)
  const isTextPreviewable = isTextPreviewableFile(file)
  const isDocxPreviewable = isDocxPreviewableFile(file)
  const isSpreadsheetPreviewable = isSpreadsheetPreviewableFile(file)

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const previewUrl = isImageGallery ? currentImageUrl : url
  const canCopyImage = Boolean(previewUrl) && (isImageGallery || isImage)

  const handleCopy = async () => {
    if (!previewUrl) return
    if (canCopyImage) {
      try {
        await copyImageToClipboard(previewUrl)
        return
      } catch {
        // fallback to URL
      }
    }
    await navigator.clipboard.writeText(previewUrl)
  }

  const handleOpenExternal = () => {
    if (isImageGallery) {
      if (!previewUrl) return
      window.open(previewUrl, '_blank', 'noopener,noreferrer')
      return
    }

    if (!file?.id) return
    window.open(`/api/files/${file.id}/download?inline=1`, '_blank', 'noopener,noreferrer')
  }

  const handleDownload = async () => {
    if (!previewUrl && !file?.id) return
    const filename = isImageGallery
      ? `imagen-${currentImageIndex + 1}.png`
      : (file?.filename || 'archivo')
    const downloadUrl = isImageGallery
      ? previewUrl
      : (file?.id ? `/api/files/${file.id}/download` : previewUrl)

    if (!downloadUrl) return
    await triggerDownload(downloadUrl, filename)
  }

  const handlePrev = () => {
    if (!isImageGallery || galleryCount <= 1) return
    setImagePreviewIndex((currentImageIndex - 1 + galleryCount) % galleryCount)
  }

  const handleNext = () => {
    if (!isImageGallery || galleryCount <= 1) return
    setImagePreviewIndex((currentImageIndex + 1) % galleryCount)
  }

  const resetTransform = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  const updateZoom = (nextZoom: number) => {
    const clamped = Math.min(4, Math.max(1, nextZoom))
    setZoom(clamped)
    if (clamped === 1) setPan({ x: 0, y: 0 })
  }

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!isImageGallery) return
    event.preventDefault()
    const delta = event.deltaY < 0 ? 0.16 : -0.16
    updateZoom(zoom + delta)
  }

  const handleDoubleClick = () => {
    if (!isImageGallery) return
    if (zoom > 1) {
      resetTransform()
      return
    }
    setZoom(2)
  }

  const handleMouseDown = (event: React.MouseEvent<HTMLImageElement>) => {
    if (!isImageGallery || zoom <= 1) return
    event.preventDefault()
    setIsPanning(true)
    panStartRef.current = {
      x: event.clientX - pan.x,
      y: event.clientY - pan.y,
    }
  }

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning) return
    setPan({
      x: event.clientX - panStartRef.current.x,
      y: event.clientY - panStartRef.current.y,
    })
  }

  const handleMouseUp = () => {
    setIsPanning(false)
  }

  const handleRegenerateVariant = async () => {
    if (!activeConversationId || !imagePreviewPrompt || regeneratingVariant) return
    setRegeneratingVariant(true)
    setIsStreaming(true)
    setStreamingConversationId(activeConversationId)
    setStreamingContent('')
    const controller = new AbortController()
    setStreamAbortController(controller)

    try {
      const variantPrompt = `Genera una variante visual de esta imagen manteniendo su estilo base: ${imagePreviewPrompt}`
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: activeConversationId,
          input: variantPrompt,
          model: selectedModel,
          rag_mode: ragMode,
          cite_mode: citeMode,
          web_search: webSearch,
          image_generation: true,
        }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) return

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let full = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true })
        setStreamingContent(full.replace('\n__TITLE_UPDATED__', ''))
      }

      if (full.includes('__TITLE_UPDATED__')) {
        loadConversations()
      }
    } finally {
      setIsStreaming(false)
      setStreamingConversationId(null)
      setStreamingContent('')
      setStreamAbortController(null)
      setRegeneratingVariant(false)
      if (activeConversationId) loadMessages(activeConversationId)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/25 backdrop-blur-[3px] z-50 flex items-center justify-center p-3" onClick={closeFilePreview}>
      <div className="liquid-glass-dropdown w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/45 bg-white/20">
          <div className="flex items-center gap-2 min-w-0">
            {isImageGallery ? (
              <>
                <ImageIcon size={16} className="text-blue-500" />
                <span className="text-sm font-medium truncate text-zinc-800">
                  Imagen {currentImageIndex + 1} / {galleryCount}
                </span>
              </>
            ) : (
              <>
                {isPDF && <FileText size={16} className="text-red-500" />}
                {isImage && <ImageIcon size={16} className="text-blue-500" />}
                {isAudio && <Music size={16} className="text-purple-500" />}
                {isVideo && <Video size={16} className="text-emerald-500" />}
                <span className="text-sm font-medium truncate text-zinc-800">{file?.filename}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {previewUrl && (
              <>
                <button onClick={() => void handleCopy()} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400" title={canCopyImage ? 'Copiar imagen' : 'Copiar link'}><Copy size={14} /></button>
                <button onClick={handleOpenExternal} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400" title="Abrir en pestana"><ExternalLink size={14} /></button>
                <button onClick={() => void handleDownload()} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400" title="Descargar"><Download size={14} /></button>
                {isImageGallery && imagePreviewPrompt && (
                  <button
                    onClick={handleRegenerateVariant}
                    disabled={regeneratingVariant}
                    className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 disabled:opacity-50"
                    title="Regenerar variante"
                  >
                    {regeneratingVariant ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  </button>
                )}
              </>
            )}

            {isImageGallery && (
              <>
                <button onClick={() => updateZoom(zoom - 0.2)} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400" title="Reducir zoom"><ZoomOut size={14} /></button>
                <button onClick={() => updateZoom(zoom + 0.2)} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400" title="Aumentar zoom"><ZoomIn size={14} /></button>
                <button onClick={resetTransform} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400" title="Restablecer vista"><RotateCcw size={14} /></button>
              </>
            )}

            <button onClick={closeFilePreview} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400"><X size={16} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[300px] bg-white/20">
          {isImageGallery && currentImageUrl && (
            <div
              className="relative w-full h-[70vh] overflow-hidden rounded-xl bg-white/55 border border-white/60 select-none shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]"
              onWheel={handleWheel}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {galleryCount > 1 && (
                <>
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/85 hover:bg-white text-zinc-600 shadow border border-zinc-200"
                    title="Anterior"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/85 hover:bg-white text-zinc-600 shadow border border-zinc-200"
                    title="Siguiente"
                  >
                    <ChevronRight size={16} />
                  </button>
                </>
              )}

              <img
                src={currentImageUrl}
                alt={`Imagen ${currentImageIndex + 1}`}
                className={`w-full h-full object-contain ${zoom > 1 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'}`}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                  transition: isPanning ? 'none' : 'transform 0.15s ease-out',
                }}
                onDoubleClick={handleDoubleClick}
                onMouseDown={handleMouseDown}
                draggable={false}
              />
            </div>
          )}

          {!isImageGallery && loading && <Loader2 className="animate-spin text-zinc-400" size={32} />}
          {!isImageGallery && !loading && url && isPDF && (
            <iframe src={`${url}#toolbar=1`} className="w-full h-[70vh] rounded-lg bg-white" title="PDF Preview" />
          )}
          {!isImageGallery && !loading && url && isImage && (
            <img src={url} alt={file?.filename} className="max-w-full max-h-[70vh] rounded-lg object-contain" />
          )}
          {!isImageGallery && !loading && url && isAudio && (
            <div className="w-full max-w-md">
              <audio controls src={url} className="w-full" />
            </div>
          )}
          {!isImageGallery && !loading && url && isVideo && (
            <video controls src={url} className="max-w-full max-h-[70vh] rounded-lg" />
          )}
          {!isImageGallery && !loading && isTextPreviewable && (
            <div className="w-full h-[70vh] overflow-auto rounded-xl bg-white/80 border border-white/70 p-4">
              {textPreview ? (
                isMarkdown ? (
                  <article className="prose prose-zinc max-w-none text-sm prose-headings:text-zinc-800 prose-p:text-zinc-700 prose-strong:text-zinc-800">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {textPreview}
                    </ReactMarkdown>
                  </article>
                ) : (
                  <pre className="text-xs leading-relaxed text-zinc-700 whitespace-pre-wrap break-words">{textPreview}</pre>
                )
              ) : (
                <p className="text-sm text-zinc-500">No se pudo cargar la vista previa.</p>
              )}

              {textPreviewTruncated && (
                <p className="mt-3 text-[11px] text-zinc-400">
                  Vista previa recortada para rendimiento. Descarga el archivo para ver el contenido completo.
                </p>
              )}
            </div>
          )}
          {!isImageGallery && !loading && isDocxPreviewable && (
            <div className="w-full h-[70vh] overflow-auto rounded-xl bg-white/80 border border-white/70 p-4">
              {docxPreviewHtml ? (
                <article
                  className="prose prose-zinc max-w-none text-sm prose-headings:text-zinc-800 prose-p:text-zinc-700 prose-strong:text-zinc-800 prose-a:text-blue-600"
                  dangerouslySetInnerHTML={{ __html: docxPreviewHtml }}
                />
              ) : (
                <p className="text-sm text-zinc-500">{officePreviewError || 'No se pudo cargar la vista previa del documento Word.'}</p>
              )}
            </div>
          )}
          {!isImageGallery && !loading && isSpreadsheetPreviewable && (
            <div className="w-full h-[70vh] overflow-auto rounded-xl bg-white/80 border border-white/70 p-3">
              {sheetPreview ? (
                <div className="min-w-full">
                  <p className="text-xs font-medium text-zinc-500 mb-2">Hoja: {sheetPreview.sheetName}</p>
                  <div className="overflow-auto rounded-lg border border-zinc-200 bg-white">
                    <table className="min-w-full text-xs">
                      <thead className="bg-zinc-50">
                        <tr>
                          {sheetPreview.headers.map((header, index) => (
                            <th key={`${header}-${index}`} className="px-2.5 py-1.5 text-left text-zinc-600 border-b border-zinc-200 whitespace-nowrap">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sheetPreview.rows.length === 0 ? (
                          <tr>
                            <td colSpan={sheetPreview.headers.length} className="px-3 py-3 text-zinc-500">
                              No hay filas para mostrar en la vista previa.
                            </td>
                          </tr>
                        ) : (
                          sheetPreview.rows.map((row, rowIndex) => (
                            <tr key={`row-${rowIndex}`} className="odd:bg-white even:bg-zinc-50/50">
                              {sheetPreview.headers.map((_, colIndex) => (
                                <td key={`cell-${rowIndex}-${colIndex}`} className="px-2.5 py-1.5 text-zinc-700 border-b border-zinc-100 align-top">
                                  {row[colIndex] || ''}
                                </td>
                              ))}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  {sheetPreview.truncated && (
                    <p className="mt-2 text-[11px] text-zinc-500">
                      Vista previa recortada (primeras 200 filas). Descarga el archivo para ver todo.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">{officePreviewError || 'No se pudo cargar la vista previa de la hoja de cálculo.'}</p>
              )}
            </div>
          )}
          {!isImageGallery && !loading && url && !isPDF && !isImage && !isAudio && !isVideo && !isTextPreviewable && !isDocxPreviewable && !isSpreadsheetPreviewable && (
            <div className="text-center text-zinc-400">
              <FileText size={48} className="mx-auto mb-4" />
              <p className="text-sm">Vista previa no disponible para este tipo de archivo</p>
              <button
                type="button"
                onClick={() => void handleDownload()}
                className="text-blue-600 text-sm hover:underline mt-2 inline-block"
              >
                Descargar archivo
              </button>
            </div>
          )}
        </div>

        {!isImageGallery && file && (
          <div className="px-4 py-3 border-t border-white/45 bg-white/20 flex flex-wrap gap-4 text-xs text-zinc-600">
            <span>Tipo: {file.mime}</span>
            <span>Tamano: {formatSize(file.size)}</span>
            <span>Subido: {new Date(file.created_at).toLocaleString('es-ES')}</span>
            {file.ingest_status !== 'none' && (
              <span className={`px-1.5 py-0.5 rounded ${file.ingest_status === 'done' ? 'bg-green-50 text-green-600' : file.ingest_status === 'failed' ? 'bg-red-50 text-red-600' : 'bg-yellow-50 text-yellow-600'}`}>
                RAG: {file.ingest_status}
              </span>
            )}
          </div>
        )}

        {isImageGallery && (
          <div className="px-4 py-3 border-t border-white/45 bg-white/20 flex flex-wrap gap-4 text-xs text-zinc-600">
            <span>Zoom: {(zoom * 100).toFixed(0)}%</span>
            <span>Doble clic: alternar zoom</span>
            <span>ESC: cerrar</span>
            {galleryCount > 1 && <span>Flechas: anterior / siguiente</span>}
          </div>
        )}
      </div>
    </div>
  )
}
