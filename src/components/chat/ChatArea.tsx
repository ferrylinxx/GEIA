'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useChatStore } from '@/store/chat-store'
import MessageBubble from '@/components/chat/MessageBubble'
import ChatInput from '@/components/chat/ChatInput'
import { Loader2, Globe, Database, HardDrive, ArrowDown } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import Image from 'next/image'

const THINKING_TEXTS = ['Pensando...', 'Analizando...', 'Generando respuesta...']

export default function ChatArea() {
  const { messages, isStreaming, streamingContent, isLoading, activeConversationId, webSearch, dbQuery, networkDriveRag, selectedModel } = useChatStore()
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [thinkingIdx, setThinkingIdx] = useState(0)

  // Auto-scroll
  useEffect(() => {
    if (!showScrollBtn) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent, showScrollBtn])

  // Scroll detection for scroll-to-bottom button (Mejora 13)
  const handleScroll = useCallback(() => {
    const c = scrollContainerRef.current
    if (!c) return
    setShowScrollBtn(c.scrollHeight - c.scrollTop - c.clientHeight > 120)
  }, [])

  useEffect(() => {
    const c = scrollContainerRef.current
    if (!c) return
    c.addEventListener('scroll', handleScroll, { passive: true })
    return () => c.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  // Typing indicator rotation (Mejora 1)
  useEffect(() => {
    if (isStreaming && !streamingContent) {
      const interval = setInterval(() => setThinkingIdx(p => (p + 1) % THINKING_TEXTS.length), 2200)
      return () => clearInterval(interval)
    } else {
      setThinkingIdx(0)
    }
  }, [isStreaming, streamingContent])

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="flex flex-col h-full relative chat-bg-pattern">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>
        <div className="max-w-4xl mx-auto px-4 py-6 pb-32">
          {isLoading && (
            <div className="flex justify-center py-8">
              <div className="flex items-center gap-3 px-4 py-2.5 bg-zinc-50 rounded-xl border border-zinc-100">
                <Loader2 className="animate-spin text-blue-500" size={18} />
                <span className="text-sm text-zinc-500">Cargando conversación...</span>
              </div>
            </div>
          )}

          {!isLoading && messages.length === 0 && (
            <div className="text-center py-20 text-zinc-400 text-sm">
              Envía un mensaje para comenzar la conversación
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {/* Streaming message — avatar con glow (Mejora 7) */}
          {isStreaming && streamingContent && (
            <div className="mb-6 animate-in fade-in duration-300">
              <div className="flex gap-3">
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <div className="w-9 h-9 rounded-lg overflow-hidden bg-white flex items-center justify-center ring-2 ring-indigo-400/40"
                       style={{ animation: 'avatar-glow 2s ease-in-out infinite' }}>
                    <Image src="/logo.png" alt="GIA" width={32} height={32} className="object-contain" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-zinc-400 mb-1 block">{selectedModel}</span>
                  <div className="prose max-w-none text-base leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{streamingContent}</ReactMarkdown>
                    <span className="streaming-cursor" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Thinking state — texto rotativo + shimmer (Mejora 1) */}
          {isStreaming && !streamingContent && (
            <div className="mb-6 flex gap-3 animate-in fade-in duration-300">
              <div className="w-9 h-9 shrink-0 mt-0.5 rounded-lg overflow-hidden bg-white flex items-center justify-center ring-2 ring-indigo-400/40"
                   style={{ animation: 'avatar-glow 2s ease-in-out infinite' }}>
                <Image src="/logo.png" alt="GIA" width={32} height={32} className="object-contain" />
              </div>
              <div className="flex flex-col gap-1.5 pt-1">
                <span className="thinking-shimmer text-sm font-medium">
                  {THINKING_TEXTS[thinkingIdx]}
                </span>
                {webSearch && (
                  <div className="flex items-center gap-1.5 text-xs text-blue-500">
                    <Globe size={12} className="animate-spin" style={{ animationDuration: '3s' }} />
                    <span>Buscando en la web...</span>
                  </div>
                )}
                {dbQuery && (
                  <div className="flex items-center gap-1.5 text-xs text-indigo-500">
                    <Database size={12} className="animate-pulse" />
                    <span>Consultando base de datos...</span>
                  </div>
                )}
                {networkDriveRag && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-500">
                    <HardDrive size={12} className="animate-pulse" />
                    <span>Buscando en unidades de red...</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Scroll-to-bottom button (Mejora 13) */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 p-2.5 bg-white/90 backdrop-blur-md border border-zinc-200 rounded-full shadow-lg hover:shadow-xl hover:bg-white transition-all"
          style={{ animation: 'scroll-btn-in 0.25s ease-out' }}
          aria-label="Ir al final"
        >
          <ArrowDown size={18} className="text-zinc-600" />
        </button>
      )}

      {/* Floating input */}
      <ChatInput />
    </div>
  )
}

