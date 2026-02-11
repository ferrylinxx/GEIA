'use client'

import { useEffect, useRef } from 'react'
import { useChatStore } from '@/store/chat-store'
import MessageBubble from '@/components/chat/MessageBubble'
import ChatInput from '@/components/chat/ChatInput'
import { Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import Image from 'next/image'

export default function ChatArea() {
  const { messages, isStreaming, streamingContent, isLoading, activeConversationId } = useChatStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  return (
    <div className="flex flex-col h-full relative">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 pb-32">
          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-zinc-500" size={24} />
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

          {/* Streaming message */}
          {isStreaming && streamingContent && (
            <div className="mb-6">
              <div className="flex gap-3">
                <Image src="/logo.png" alt="GIA" width={28} height={28} className="rounded-full shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="prose max-w-none text-sm leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{streamingContent}</ReactMarkdown>
                    <span className="streaming-cursor" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {isStreaming && !streamingContent && (
            <div className="mb-6 flex gap-3">
              <Image src="/logo.png" alt="GIA" width={28} height={28} className="rounded-full shrink-0 mt-1" />
              <div className="flex items-center gap-2 text-zinc-500 text-sm">
                <Loader2 className="animate-spin" size={14} />
                Pensando...
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Floating input */}
      <ChatInput />
    </div>
  )
}

