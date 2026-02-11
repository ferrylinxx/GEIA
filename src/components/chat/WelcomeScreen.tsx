'use client'

import { useState, useRef } from 'react'
import { useChatStore } from '@/store/chat-store'
import { createClient } from '@/lib/supabase/client'
import { Sparkles, Send, Paperclip, Loader2 } from 'lucide-react'
import Image from 'next/image'

export default function WelcomeScreen() {
  const { createConversation, setIsStreaming, setStreamingContent, addMessage, loadMessages, selectedModel, ragMode, citeMode, setActiveConversation } = useChatStore()
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
          rag_mode: ragMode, cite_mode: citeMode,
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
          setStreamingContent(full)
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
    <div className="flex flex-col items-center justify-center h-full px-4">
      <div className="max-w-2xl w-full text-center">
        <Image src="/logo.png" alt="GIA" width={72} height={72} className="mx-auto mb-4 rounded-2xl" />
        <h1 className="text-4xl font-bold mb-2 tracking-tight text-zinc-900">GIA</h1>
        <p className="text-zinc-400 mb-8 text-lg">¿En qué puedo ayudarte hoy?</p>

        <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto mb-8">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => handleSend(s)}
              disabled={sending}
              className="text-left p-3 border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors text-sm text-zinc-600 flex items-start gap-2"
            >
              <Sparkles size={14} className="text-blue-400 mt-0.5 shrink-0" />
              {s}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="max-w-xl mx-auto">
          <div className="flex items-end gap-2 bg-white/70 backdrop-blur-xl border border-white/40 rounded-2xl px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.03]">
            <textarea ref={textareaRef} value={input} onChange={(e) => { setInput(e.target.value); autoResize() }}
              onKeyDown={handleKeyDown} placeholder="Escribe un mensaje..."
              className="flex-1 bg-transparent text-sm text-zinc-800 placeholder-zinc-400 resize-none max-h-[150px] focus:outline-none py-1.5"
              rows={1} disabled={sending} />
            <button onClick={() => handleSend()} disabled={!input.trim() || sending}
              className="p-2 text-white bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-300 rounded-xl transition-colors shrink-0" aria-label="Enviar">
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
          <p className="text-[10px] text-zinc-400 mt-1.5 text-center">GIA puede cometer errores. Verifica la información importante.</p>
        </div>
      </div>
    </div>
  )
}

