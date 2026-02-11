'use client'

import { useState, useRef, useCallback } from 'react'
import { useChatStore } from '@/store/chat-store'
import { createClient } from '@/lib/supabase/client'
import { FileAttachment } from '@/lib/types'
import { Send, Paperclip, X, Square, Loader2 } from 'lucide-react'

export default function ChatInput() {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<FileAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const {
    activeConversationId, createConversation, isStreaming,
    setIsStreaming, setStreamingContent, selectedModel,
    ragMode, citeMode, addMessage, loadMessages,
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
          rag_mode: ragMode, cite_mode: citeMode,
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
        full += decoder.decode(value, { stream: true })
        setStreamingContent(full)
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
  }, [input, attachments, activeConversationId, createConversation, isStreaming, setIsStreaming, setStreamingContent, selectedModel, ragMode, citeMode, addMessage, loadMessages])

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

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none">
      <div className="max-w-3xl mx-auto px-4 pb-4 pointer-events-auto">
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

        <div className="flex items-end gap-2 bg-white/70 backdrop-blur-xl border border-white/40 rounded-2xl px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.03]">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 transition-colors shrink-0" aria-label="Adjuntar archivo">
            {uploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
          </button>

          <textarea ref={textareaRef} value={input} onChange={(e) => { setInput(e.target.value); autoResize() }}
            onKeyDown={handleKeyDown} placeholder="Escribe un mensaje..."
            className="flex-1 bg-transparent text-sm text-zinc-800 placeholder-zinc-400 resize-none max-h-[200px] focus:outline-none py-1.5"
            rows={1} />

          {isStreaming ? (
            <button onClick={handleStop} className="p-2 text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors shrink-0" aria-label="Detener">
              <Square size={16} />
            </button>
          ) : (
            <button onClick={handleSend} disabled={!input.trim() && attachments.length === 0}
              className="p-2 text-white bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-300 rounded-xl transition-colors shrink-0" aria-label="Enviar (Enter)">
              <Send size={16} />
            </button>
          )}
        </div>
        <p className="text-[10px] text-zinc-400 mt-1.5 text-center">GIA puede cometer errores. Verifica la información importante.</p>
      </div>
    </div>
  )
}

