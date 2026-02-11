'use client'

import { useState, useRef, useEffect } from 'react'
import { Message, MessageVersion, ChunkSource } from '@/lib/types'
import { useChatStore } from '@/store/chat-store'
import { useUIStore } from '@/store/ui-store'
import { createClient } from '@/lib/supabase/client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Copy, Check, Pencil, RefreshCw, ChevronLeft, ChevronRight, Square, FileText, Globe, ExternalLink, X, Trash2 } from 'lucide-react'
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
  const { updateMessage, setIsStreaming, setStreamingContent, addMessage, activeConversationId, selectedModel, ragMode, citeMode, webSearch, removeMessagesAfter, loadMessages } = useChatStore()
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
    if (!activeConversationId) return
    const supabase = createClient()

    // 1. Update the message content in DB
    const { error: updateError } = await supabase.from('messages').update({
      content: editContent, edited_at: new Date().toISOString(),
      edit_version: (message.edit_version || 0) + 1,
    }).eq('id', message.id)
    if (updateError) {
      console.error('Error updating message:', updateError)
      return
    }

    // 2. Save edit history (non-blocking, ignore errors)
    supabase.from('message_edits').insert({
      message_id: message.id, previous_content: message.content,
      new_content: editContent, editor_user_id: message.user_id,
    }).then(({ error }) => { if (error) console.error('Error saving edit history:', error) })

    // 3. Update store and close editing
    updateMessage(message.id, { content: editContent, edited_at: new Date().toISOString(), edit_version: (message.edit_version || 0) + 1 })
    setIsEditing(false)

    // 4. Delete all subsequent messages from DB in one batch using created_at
    const { error: deleteError } = await supabase
      .from('messages')
      .delete()
      .eq('conversation_id', activeConversationId)
      .gt('created_at', message.created_at)
    if (deleteError) console.error('Error deleting subsequent messages:', deleteError)

    // 5. Remove subsequent messages from store
    removeMessagesAfter(message.id)

    // 6. Regenerate AI response
    await regenerateFromHere(editContent, true)
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setIsEditing(false); setEditContent(message.content) }
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); handleEditSave() }
  }

  const handleDelete = async () => {
    if (!activeConversationId) return
    const supabase = createClient()
    const allMessages = useChatStore.getState().messages
    const msgIndex = allMessages.findIndex(m => m.id === message.id)
    if (msgIndex < 0) return

    // Delete this message and all subsequent from DB in batch
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('conversation_id', activeConversationId)
      .gte('created_at', message.created_at)
    if (error) console.error('Error deleting messages:', error)

    // Update store - keep only messages before this one
    if (msgIndex === 0) {
      useChatStore.getState().clearMessages()
    } else {
      const prevMessage = allMessages[msgIndex - 1]
      removeMessagesAfter(prevMessage.id)
    }
  }

  const regenerateFromHere = async (content?: string, skipUserSave?: boolean) => {
    const convId = activeConversationId
    if (!convId) return
    setIsStreaming(true); setStreamingContent('')
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: convId, input: content || message.content,
          model: selectedModel, rag_mode: ragMode, cite_mode: citeMode, web_search: webSearch,
          regenerate_message_id: isAssistant ? message.id : undefined,
          skip_user_save: skipUserSave || false,
        }),
      })
      if (!res.ok) {
        const errText = await res.text()
        console.error('Chat API error:', res.status, errText)
        return
      }
      if (!res.body) return
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let full = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true })
        // Strip title update signal from displayed content
        setStreamingContent(full.replace('\n__TITLE_UPDATED__', ''))
      }
      // Reload sidebar if title was updated
      if (full.includes('__TITLE_UPDATED__')) {
        useChatStore.getState().loadConversations()
      }
    } catch (e) {
      console.error('Regeneration error:', e)
    } finally {
      setIsStreaming(false); setStreamingContent('')
      // Always reload messages from DB to get the saved assistant response
      useChatStore.getState().loadMessages(convId)
    }
  }

  const handleVersionNav = (dir: -1 | 1) => {
    const newIdx = activeVersionIdx + dir
    if (newIdx >= 0 && newIdx < versions.length) setActiveVersionIdx(newIdx)
  }

  const displayContent = versions.length > 0 ? versions[activeVersionIdx]?.content || message.content : message.content

  return (
    <div className={`mb-6 group ${isUser ? 'flex justify-end' : ''}`} style={{ animation: 'message-in 0.35s ease-out' }}>
      <div className={`flex gap-3 ${isUser ? 'flex-row-reverse max-w-[85%]' : 'max-w-full'}`}>
        {/* Avatar — ring sutil (Mejora 7) */}
        {isAssistant && (
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className="w-9 h-9 rounded-lg overflow-hidden bg-white ring-1 ring-indigo-100 flex items-center justify-center shadow-sm">
              <Image src="/logo.png" alt="GIA" width={32} height={32} className="object-contain" />
            </div>
          </div>
        )}

        <div className={`flex-1 min-w-0 ${isUser ? 'text-right' : ''}`}>
          {/* Model name label */}
          {isAssistant && message.model ? (
            <span className="text-xs font-medium text-zinc-400 mb-1 block">{String(message.model)}</span>
          ) : null}
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
            <div className={`${isUser ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 inline-block text-left shadow-md shadow-blue-500/20' : ''}`}>
              <div className={`prose max-w-none leading-relaxed ${isUser ? 'text-sm prose-invert prose-p:my-1' : 'text-base'}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{displayContent}</ReactMarkdown>
              </div>
              {message.edited_at && <span className={`text-[10px] mt-1 inline-block ${isUser ? 'text-blue-200' : 'text-zinc-400'}`}>(editado)</span>}
            </div>
          )}

          {/* Generated image display */}
          {isAssistant && message.meta_json?.image_url && (
            <div className="mt-3 mb-2">
              <a href={message.meta_json.image_url as string} target="_blank" rel="noopener noreferrer" className="block">
                <img
                  src={message.meta_json.image_url as string}
                  alt="Imagen generada por IA"
                  className="rounded-xl shadow-lg max-w-full w-auto max-h-[512px] border border-zinc-200 hover:shadow-xl transition-shadow cursor-pointer"
                />
              </a>
            </div>
          )}

          {/* Sources — pill/badge design (Mejora 12) */}
          {isAssistant && sources.length > 0 && (() => {
            const ragSrcs = sources.filter(s => s.source_type !== 'web')
            const webSrcs = sources.filter(s => s.source_type === 'web')
            return (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {/* Web source pills */}
                {webSrcs.map((s, i) => (
                  <a key={`w${i}`} href={s.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 bg-blue-50 text-blue-600 border border-blue-100 rounded-full hover:bg-blue-100 transition-colors">
                    <Globe size={11} className="shrink-0" />
                    <span className="truncate max-w-[140px]">{s.filename}</span>
                    <ExternalLink size={9} className="shrink-0 opacity-50" />
                  </a>
                ))}
                {/* RAG/file source pills */}
                {ragSrcs.map((s, i) => (
                  <button key={`r${i}`} onClick={() => openFilePreview(s.file_id)}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full hover:bg-emerald-100 transition-colors">
                    <FileText size={11} className="shrink-0" />
                    <span className="truncate max-w-[140px]">{s.filename}</span>
                    {s.page && <span className="text-emerald-400 text-[10px]">p.{s.page}</span>}
                  </button>
                ))}
              </div>
            )
          })()}

          {/* Actions */}
          {!isEditing && (
            <div className={`flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity ${isUser ? 'justify-end' : ''}`}>
              {isUser && <button onClick={() => setIsEditing(true)} className="p-1 hover:bg-zinc-100 rounded text-zinc-400 hover:text-zinc-600" title="Editar"><Pencil size={13} /></button>}
              <button onClick={handleCopy} className="p-1 hover:bg-zinc-100 rounded text-zinc-400 hover:text-zinc-600" title="Copiar">
                {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
              </button>
              {isAssistant && <button onClick={() => regenerateFromHere()} className="p-1 hover:bg-zinc-100 rounded text-zinc-400 hover:text-zinc-600" title="Regenerar"><RefreshCw size={13} /></button>}
              <button onClick={handleDelete} className="p-1 hover:bg-red-50 rounded text-zinc-400 hover:text-red-500 transition-colors" title="Eliminar desde aquí">
                <Trash2 size={13} />
              </button>
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

