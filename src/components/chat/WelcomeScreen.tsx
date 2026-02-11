'use client'

import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '@/store/chat-store'
import { createClient } from '@/lib/supabase/client'
import { Sparkles, Send, Loader2, Globe, Database, HardDrive, Plus, Paperclip, X } from 'lucide-react'
import Image from 'next/image'

export default function WelcomeScreen() {
  const { createConversation, setIsStreaming, setStreamingContent, addMessage, loadMessages, loadConversations, selectedModel, ragMode, citeMode, webSearch, setWebSearch, dbQuery, setDbQuery, networkDriveRag, setNetworkDriveRag } = useChatStore()
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const toolsMenuRef = useRef<HTMLDivElement>(null)

  // Close tools menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) setToolsOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const activeToolsCount = [webSearch, dbQuery, networkDriveRag].filter(Boolean).length

  const suggestions = [
    'Explícame el patrón RAG en IA',
    'Ayúdame a planificar un proyecto',
    'Escribe un email profesional',
    'Resume un documento largo',
  ]

  const handleSend = async (text?: string) => {
    const message = text || input.trim()
    if (!message || sending) return
    setSending(true)

    try {
      const convId = await createConversation()
      if (!convId) return

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Add optimistic user message
      addMessage({
        id: crypto.randomUUID(), conversation_id: convId, user_id: user.id,
        role: 'user', content: message, attachments_json: [],
        sources_json: [], edit_version: 1, created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(), parent_message_id: null,
        branch_id: null, edited_at: null, active_version_id: null,
      })

      setInput('')
      setIsStreaming(true)
      setStreamingContent('')

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: convId, input: message, model: selectedModel,
          rag_mode: ragMode, cite_mode: citeMode, web_search: webSearch, db_query: dbQuery, network_drive_rag: networkDriveRag,
        }),
      })

      if (res.body) {
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
      }

      setIsStreaming(false)
      setStreamingContent('')
      loadMessages(convId)
    } catch (e) {
      console.error('Welcome send error:', e)
    } finally {
      setSending(false)
      setIsStreaming(false)
      setStreamingContent('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const autoResize = () => {
    const ta = textareaRef.current
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 150) + 'px' }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-4 chat-bg-pattern">
      <div className="max-w-2xl w-full text-center">
        {/* Logo con bounce-in (Mejora 11) */}
        <Image src="/logo.png" alt="GIA" width={72} height={72}
          className="mx-auto mb-4 rounded-2xl shadow-lg shadow-indigo-500/10"
          style={{ animation: 'bounce-in 0.7s ease-out' }} />
        <h1 className="text-4xl font-bold mb-2 tracking-tight text-zinc-900"
            style={{ animation: 'fade-up 0.5s ease-out 0.2s both' }}>GIA</h1>
        <p className="text-zinc-400 mb-8 text-lg"
           style={{ animation: 'fade-up 0.5s ease-out 0.4s both' }}>¿En qué puedo ayudarte hoy?</p>

        {/* Sugerencias con stagger (Mejora 11) */}
        <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto mb-8">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => handleSend(s)}
              disabled={sending}
              className="text-left p-3 border border-zinc-200 rounded-xl hover:bg-zinc-50 hover:border-zinc-300 hover:shadow-sm transition-all duration-200 text-sm text-zinc-600 flex items-start gap-2"
              style={{ animation: `fade-up 0.4s ease-out ${0.5 + i * 0.1}s both` }}
            >
              <Sparkles size={14} className="text-blue-400 mt-0.5 shrink-0" />
              {s}
            </button>
          ))}
        </div>

        {/* Input con stagger (Mejora 11) */}
        <div className="max-w-2xl mx-auto" style={{ animation: 'fade-up 0.5s ease-out 0.9s both' }}>
          {/* Active tools indicator pills */}
          {activeToolsCount > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5 mb-2">
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
            </div>
          )}
          <div className="flex items-end gap-3 bg-white/70 backdrop-blur-xl border border-white/40 rounded-2xl px-5 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.03]">
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
              {toolsOpen && (
                <div className="absolute bottom-full left-0 mb-2 bg-white border border-zinc-200 rounded-xl shadow-xl py-1.5 min-w-[200px] z-50"
                     style={{ animation: 'message-in 0.15s ease-out' }}>
                  <button onClick={() => { setWebSearch(!webSearch) }}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 transition-colors ${webSearch ? 'bg-blue-50 text-blue-600' : 'text-zinc-600 hover:bg-zinc-50'}`}>
                    <Globe size={16} /> Búsqueda Web
                    {webSearch && <span className="ml-auto text-blue-400 text-xs">✓</span>}
                  </button>
                  <button onClick={() => { setDbQuery(!dbQuery) }}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 transition-colors ${dbQuery ? 'bg-indigo-50 text-indigo-600' : 'text-zinc-600 hover:bg-zinc-50'}`}>
                    <Database size={16} /> Base de Datos
                    {dbQuery && <span className="ml-auto text-indigo-400 text-xs">✓</span>}
                  </button>
                  <button onClick={() => { setNetworkDriveRag(!networkDriveRag) }}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 transition-colors ${networkDriveRag ? 'bg-emerald-50 text-emerald-600' : 'text-zinc-600 hover:bg-zinc-50'}`}>
                    <HardDrive size={16} /> Unidad de Red
                    {networkDriveRag && <span className="ml-auto text-emerald-400 text-xs">✓</span>}
                  </button>
                </div>
              )}
            </div>
            <textarea ref={textareaRef} value={input} onChange={(e) => { setInput(e.target.value); autoResize() }}
              onKeyDown={handleKeyDown} placeholder="Escribe un mensaje..."
              className="flex-1 bg-transparent text-base text-zinc-800 placeholder-zinc-400 resize-none max-h-[150px] focus:outline-none py-1"
              rows={1} disabled={sending} />
            {/* Botón enviar con animación */}
            <button onClick={() => handleSend()} disabled={!input.trim() || sending}
              className={`p-2.5 text-white rounded-xl transition-all duration-300 shrink-0 hover:scale-105 active:scale-95 ${
                input.trim() ? 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 shadow-md shadow-blue-500/25' : 'bg-zinc-300'
              }`}
              style={input.trim() && !sending ? { animation: 'send-ready 2s ease-in-out infinite' } : undefined}
              aria-label="Enviar">
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
          <p className="text-[10px] text-zinc-400 mt-1.5 text-center">GIA puede cometer errores. Verifica la información importante.</p>
        </div>
      </div>
    </div>
  )
}

