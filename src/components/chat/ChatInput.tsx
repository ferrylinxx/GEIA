'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useChatStore } from '@/store/chat-store'
import { createClient } from '@/lib/supabase/client'
import { FileAttachment } from '@/lib/types'
import { Send, Paperclip, X, Square, Loader2, Globe, Database, HardDrive, Plus, ImagePlus } from 'lucide-react'

export default function ChatInput() {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<FileAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const toolsMenuRef = useRef<HTMLDivElement>(null)

  const {
    activeConversationId, createConversation, isStreaming,
    setIsStreaming, setStreamingContent, selectedModel,
    ragMode, citeMode, webSearch, setWebSearch, dbQuery, setDbQuery,
    networkDriveRag, setNetworkDriveRag, imageGeneration, setImageGeneration,
    addMessage, loadMessages, loadConversations,
  } = useChatStore()

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text && attachments.length === 0) return
    if (isStreaming) return

    let convId = activeConversationId
    if (!convId) {
      convId = await createConversation()
      if (!convId) return
    }

    setInput('')
    setIsStreaming(true)
    setStreamingContent('')

    // Add optimistic user message
    const tempId = crypto.randomUUID()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    addMessage({
      id: tempId, conversation_id: convId, user_id: user.id,
      role: 'user', content: text, attachments_json: attachments,
      sources_json: [], edit_version: 1, created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(), parent_message_id: null,
      branch_id: null, edited_at: null, active_version_id: null,
    })
    setAttachments([])

    try {
      abortRef.current = new AbortController()
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: convId, input: text, model: selectedModel,
          rag_mode: ragMode, cite_mode: citeMode, web_search: webSearch, db_query: dbQuery, network_drive_rag: networkDriveRag, image_generation: imageGeneration,
          attachments: attachments.map(a => a.file_id),
        }),
        signal: abortRef.current.signal,
      })

      if (!res.body) throw new Error('No response body')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let full = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        full += chunk
        // Strip title update signal from displayed content
        setStreamingContent(full.replace('\n__TITLE_UPDATED__', ''))
      }
      // If title was updated, reload sidebar conversations
      if (full.includes('__TITLE_UPDATED__')) {
        loadConversations()
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
        // User paused
      } else {
        console.error('Chat error:', e)
      }
    } finally {
      setIsStreaming(false)
      setStreamingContent('')
      abortRef.current = null
      // Reload messages from server
      if (convId) loadMessages(convId)
    }
  }, [input, attachments, activeConversationId, createConversation, isStreaming, setIsStreaming, setStreamingContent, selectedModel, ragMode, citeMode, webSearch, dbQuery, networkDriveRag, imageGeneration, addMessage, loadMessages, loadConversations])

  const handleStop = () => {
    abortRef.current?.abort()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    setUploading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    for (const file of Array.from(files)) {
      const path = `${user.id}/${Date.now()}_${file.name}`
      const { error } = await supabase.storage.from('user-files').upload(path, file)
      if (!error) {
        const { data: fileRec } = await supabase.from('files').insert({
          user_id: user.id, storage_path: path, filename: file.name,
          mime: file.type, size: file.size,
        }).select().single()
        if (fileRec) {
          setAttachments(prev => [...prev, {
            file_id: fileRec.id, filename: file.name, mime: file.type,
            size: file.size, storage_path: path,
          }])
        }
      }
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const autoResize = () => {
    const ta = textareaRef.current
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 200) + 'px' }
  }

  // Close tools menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) setToolsOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const activeToolsCount = [webSearch, dbQuery, networkDriveRag, imageGeneration].filter(Boolean).length

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none">
      <div className="max-w-4xl mx-auto px-4 pb-4 pointer-events-auto">
        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map((a, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-white/70 backdrop-blur-md text-xs px-2.5 py-1.5 rounded-lg text-zinc-700 border border-white/40 shadow-sm">
                <Paperclip size={12} /> {a.filename}
                <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} className="text-zinc-400 hover:text-zinc-700"><X size={12} /></button>
              </div>
            ))}
          </div>
        )}

        {/* Active tools indicator pills */}
        {activeToolsCount > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {webSearch && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full">
                <Globe size={10} /> Web
                <button onClick={() => setWebSearch(false)} className="ml-0.5 hover:text-blue-800"><X size={10} /></button>
              </span>
            )}
            {dbQuery && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full">
                <Database size={10} /> BD
                <button onClick={() => setDbQuery(false)} className="ml-0.5 hover:text-indigo-800"><X size={10} /></button>
              </span>
            )}
            {networkDriveRag && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full">
                <HardDrive size={10} /> Red
                <button onClick={() => setNetworkDriveRag(false)} className="ml-0.5 hover:text-emerald-800"><X size={10} /></button>
              </span>
            )}
            {imageGeneration && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 bg-purple-50 text-purple-600 border border-purple-100 rounded-full">
                <ImagePlus size={10} /> Imagen
                <button onClick={() => setImageGeneration(false)} className="ml-0.5 hover:text-purple-800"><X size={10} /></button>
              </span>
            )}
          </div>
        )}

        <div className="flex items-end gap-3 bg-white/70 backdrop-blur-xl border border-white/40 rounded-2xl px-5 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.03]">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" />

          {/* Botón + con menú de herramientas */}
          <div className="relative shrink-0" ref={toolsMenuRef}>
            <button onClick={() => setToolsOpen(!toolsOpen)}
              className={`p-2 rounded-xl transition-all duration-200 ${toolsOpen ? 'bg-zinc-200 text-zinc-700 rotate-45' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'} ${activeToolsCount > 0 ? 'text-blue-500' : ''}`}
              aria-label="Herramientas">
              <Plus size={20} />
            </button>
            {activeToolsCount > 0 && !toolsOpen && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{activeToolsCount}</span>
            )}

            {/* Tools popup menu */}
            {toolsOpen && (
              <div className="absolute bottom-full left-0 mb-2 bg-white border border-zinc-200 rounded-xl shadow-xl py-1.5 min-w-[200px] z-50"
                   style={{ animation: 'message-in 0.15s ease-out' }}>
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 flex items-center gap-2.5 text-zinc-600 transition-colors">
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
                  Adjuntar archivo
                </button>
                <hr className="border-zinc-100 my-1" />
                <button onClick={() => { setWebSearch(!webSearch) }}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 transition-colors ${webSearch ? 'bg-blue-50 text-blue-600' : 'text-zinc-600 hover:bg-zinc-50'}`}>
                  <Globe size={16} />
                  Búsqueda Web
                  {webSearch && <span className="ml-auto text-blue-400 text-xs">✓</span>}
                </button>
                <button onClick={() => { setDbQuery(!dbQuery) }}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 transition-colors ${dbQuery ? 'bg-indigo-50 text-indigo-600' : 'text-zinc-600 hover:bg-zinc-50'}`}>
                  <Database size={16} />
                  Base de Datos
                  {dbQuery && <span className="ml-auto text-indigo-400 text-xs">✓</span>}
                </button>
                <button onClick={() => { setNetworkDriveRag(!networkDriveRag) }}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 transition-colors ${networkDriveRag ? 'bg-emerald-50 text-emerald-600' : 'text-zinc-600 hover:bg-zinc-50'}`}>
                  <HardDrive size={16} />
                  Unidad de Red
                  {networkDriveRag && <span className="ml-auto text-emerald-400 text-xs">✓</span>}
                </button>
                <button onClick={() => { setImageGeneration(!imageGeneration) }}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 transition-colors ${imageGeneration ? 'bg-purple-50 text-purple-600' : 'text-zinc-600 hover:bg-zinc-50'}`}>
                  <ImagePlus size={16} />
                  Generar Imagen
                  {imageGeneration && <span className="ml-auto text-purple-400 text-xs">✓</span>}
                </button>
              </div>
            )}
          </div>

          <textarea ref={textareaRef} value={input} onChange={(e) => { setInput(e.target.value); autoResize() }}
            onKeyDown={handleKeyDown} placeholder="Escribe un mensaje..."
            className="flex-1 bg-transparent text-base text-zinc-800 placeholder-zinc-400 resize-none max-h-[200px] focus:outline-none py-1"
            rows={1} />

          {/* Botón enviar/detener con animación */}
          {isStreaming ? (
            <button onClick={handleStop}
              className="p-2.5 text-white bg-red-500 hover:bg-red-600 rounded-xl transition-all duration-300 shrink-0 hover:scale-105 active:scale-95"
              aria-label="Detener">
              <Square size={18} className="animate-pulse" />
            </button>
          ) : (
            <button onClick={handleSend} disabled={!input.trim() && attachments.length === 0}
              className={`p-2.5 text-white rounded-xl transition-all duration-300 shrink-0 hover:scale-105 active:scale-95 ${
                input.trim() || attachments.length > 0
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 shadow-md shadow-blue-500/25'
                  : 'bg-zinc-300'
              }`}
              style={input.trim() ? { animation: 'send-ready 2s ease-in-out infinite' } : undefined}
              aria-label="Enviar (Enter)">
              <Send size={18} />
            </button>
          )}
        </div>
        <p className="text-[10px] text-zinc-400 mt-1.5 text-center">GIA puede cometer errores. Verifica la información importante.</p>
      </div>
    </div>
  )
}

