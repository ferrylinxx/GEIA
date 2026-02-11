'use client'

import { useState, useRef, useEffect } from 'react'
import { Message, MessageVersion, ChunkSource } from '@/lib/types'
import { useChatStore } from '@/store/chat-store'
import { useUIStore } from '@/store/ui-store'
import { createClient } from '@/lib/supabase/client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Copy, Check, Pencil, RefreshCw, ChevronLeft, ChevronRight, Square, FileText, X } from 'lucide-react'
import Image from 'next/image'

interface Props { message: Message }

export default function MessageBubble({ message }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const [copied, setCopied] = useState(false)
  const [versions, setVersions] = useState<MessageVersion[]>([])
  const [activeVersionIdx, setActiveVersionIdx] = useState(0)
  const [showSources, setShowSources] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { updateMessage, setIsStreaming, setStreamingContent, addMessage, activeConversationId, selectedModel, ragMode, citeMode } = useChatStore()
  const { openFilePreview } = useUIStore()

  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const sources: ChunkSource[] = message.sources_json || []

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length)
    }
  }, [isEditing])

  // Load versions for assistant messages
  useEffect(() => {
    if (isAssistant) {
      const supabase = createClient()
      supabase.from('message_versions').select('*').eq('message_id', message.id)
        .order('version_index').then(({ data }) => {
          if (data && data.length > 0) { setVersions(data); setActiveVersionIdx(data.length - 1) }
        })
    }
  }, [isAssistant, message.id])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleEditSave = async () => {
    if (editContent.trim() === message.content) { setIsEditing(false); return }
    const supabase = createClient()
    // Save edit history (ignore errors - table might not have RLS for inserts)
    try {
      await supabase.from('message_edits').insert({
        message_id: message.id, previous_content: message.content,
        new_content: editContent, editor_user_id: message.user_id,
      })
    } catch { /* ignore */ }
    // Update the message content
    const { error } = await supabase.from('messages').update({
      content: editContent, edited_at: new Date().toISOString(),
      edit_version: (message.edit_version || 0) + 1,
    }).eq('id', message.id)
    if (error) {
      console.error('Error updating message:', error)
    }
    updateMessage(message.id, { content: editContent, edited_at: new Date().toISOString(), edit_version: (message.edit_version || 0) + 1 })
    setIsEditing(false)

    // Delete subsequent messages after this one and regenerate
    const allMessages = useChatStore.getState().messages
    const msgIndex = allMessages.findIndex(m => m.id === message.id)
    if (msgIndex >= 0) {
      const subsequent = allMessages.slice(msgIndex + 1)
      for (const m of subsequent) {
        await supabase.from('messages').delete().eq('id', m.id)
      }
    }

    // Regenerate AI response after edit (skip_user_save to avoid duplicate)
    await regenerateFromHere(editContent, true)
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setIsEditing(false); setEditContent(message.content) }
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); handleEditSave() }
  }

  const regenerateFromHere = async (content?: string, skipUserSave?: boolean) => {
    if (!activeConversationId) return
    setIsStreaming(true); setStreamingContent('')
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: activeConversationId, input: content || message.content,
          model: selectedModel, rag_mode: ragMode, cite_mode: citeMode,
          regenerate_message_id: isAssistant ? message.id : undefined,
          skip_user_save: skipUserSave || false,
        }),
      })
      if (!res.body) return
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let full = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true }); setStreamingContent(full)
      }
    } finally { setIsStreaming(false); setStreamingContent('') }
    // Reload messages
    useChatStore.getState().loadMessages(activeConversationId)
  }

  const handleVersionNav = (dir: -1 | 1) => {
    const newIdx = activeVersionIdx + dir
    if (newIdx >= 0 && newIdx < versions.length) setActiveVersionIdx(newIdx)
  }

  const displayContent = versions.length > 0 ? versions[activeVersionIdx]?.content || message.content : message.content

  return (
    <div className={`mb-6 group ${isUser ? 'flex justify-end' : ''}`}>
      <div className={`flex gap-3 ${isUser ? 'flex-row-reverse max-w-[85%]' : 'max-w-full'}`}>
        {/* Avatar */}
        {isAssistant && (
          <Image src="/logo.png" alt="GIA" width={28} height={28} className="rounded-full shrink-0 mt-1" />
        )}

        <div className={`flex-1 min-w-0 ${isUser ? 'text-right' : ''}`}>
          {/* Message content */}
          {isEditing ? (
            <div className="space-y-2">
              <textarea ref={textareaRef} value={editContent} onChange={(e) => setEditContent(e.target.value)} onKeyDown={handleEditKeyDown}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-sm text-zinc-800 resize-none min-h-[80px] focus:outline-none focus:ring-2 focus:ring-blue-500" rows={3} />
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setIsEditing(false); setEditContent(message.content) }} className="px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 rounded-lg transition-colors">Cancelar</button>
                <button onClick={handleEditSave} className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors">Guardar y enviar</button>
              </div>
            </div>
          ) : (
            <div className={`${isUser ? 'bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 inline-block text-left' : ''}`}>
              <div className={`prose max-w-none text-sm leading-relaxed ${isUser ? 'prose-invert prose-p:my-1' : ''}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{displayContent}</ReactMarkdown>
              </div>
              {message.edited_at && <span className={`text-[10px] mt-1 inline-block ${isUser ? 'text-blue-200' : 'text-zinc-400'}`}>(editado)</span>}
            </div>
          )}

          {/* Sources */}
          {isAssistant && sources.length > 0 && (
            <div className="mt-2">
              <button onClick={() => setShowSources(!showSources)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-500">
                <FileText size={12} /> Fuentes usadas ({sources.length})
              </button>
              {showSources && (
                <div className="mt-2 space-y-1.5 bg-zinc-50 rounded-lg p-2 border border-zinc-200">
                  {sources.map((s, i) => (
                    <button key={i} onClick={() => openFilePreview(s.file_id)}
                      className="block w-full text-left text-xs p-2 hover:bg-zinc-100 rounded transition-colors">
                      <span className="text-blue-600 font-medium">{s.filename}</span>
                      {s.page && <span className="text-zinc-400 ml-1">p.{s.page}</span>}
                      <p className="text-zinc-500 mt-0.5 line-clamp-2">{s.snippet}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          {!isEditing && (
            <div className={`flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity ${isUser ? 'justify-end' : ''}`}>
              {isUser && <button onClick={() => setIsEditing(true)} className="p-1 hover:bg-zinc-100 rounded text-zinc-400 hover:text-zinc-600" title="Editar"><Pencil size={13} /></button>}
              <button onClick={handleCopy} className="p-1 hover:bg-zinc-100 rounded text-zinc-400 hover:text-zinc-600" title="Copiar">
                {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
              </button>
              {isAssistant && <button onClick={() => regenerateFromHere()} className="p-1 hover:bg-zinc-100 rounded text-zinc-400 hover:text-zinc-600" title="Regenerar"><RefreshCw size={13} /></button>}
              {isAssistant && versions.length > 1 && (
                <div className="flex items-center gap-0.5 text-xs text-zinc-400 ml-1">
                  <button onClick={() => handleVersionNav(-1)} disabled={activeVersionIdx === 0} className="p-0.5 hover:bg-zinc-100 rounded disabled:opacity-30"><ChevronLeft size={13} /></button>
                  <span>{activeVersionIdx + 1}/{versions.length}</span>
                  <button onClick={() => handleVersionNav(1)} disabled={activeVersionIdx === versions.length - 1} className="p-0.5 hover:bg-zinc-100 rounded disabled:opacity-30"><ChevronRight size={13} /></button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

