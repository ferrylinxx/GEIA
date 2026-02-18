'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useChatStore } from '@/store/chat-store'
import { useUIStore, type ToolStatus } from '@/store/ui-store'
import MessageBubble from '@/components/chat/MessageBubble'
import ChatInput from '@/components/chat/ChatInput'
import FollowUpSuggestions from '@/components/chat/FollowUpSuggestions'
import DeepResearchProgress from '@/components/chat/DeepResearchProgress'
import DeepResearchFloatingWindow from '@/components/chat/DeepResearchFloatingWindow'
import { Loader2, Globe, Database, HardDrive, ArrowDown, ImagePlus, FlaskConical, FileText, BarChart3 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import Image from 'next/image'
import { useTranslation } from '@/i18n/LanguageContext'

export default function ChatArea() {
  const { t } = useTranslation()
  const {
    messages,
    isStreaming,
    streamingConversationId,
    streamingContent,
    isLoading,
    activeConversationId,
    webSearch,
    dbQuery,
    networkDriveRag,
    imageGeneration,
    deepResearch,
    documentGeneration,
    spreadsheetAnalysis,
    selectedModel,
  } = useChatStore()
  const { toolStatus } = useUIStore()

  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [thinkingIdx, setThinkingIdx] = useState(0)
  const [chatTransition, setChatTransition] = useState(false)
  const [showResearchWindow, setShowResearchWindow] = useState(false)
  const prevConvIdRef = useRef<string | null>(null)

  // Handler for follow-up suggestions
  const handleSuggestionSelect = useCallback((text: string) => {
    // Dispatch custom event to ChatInput
    window.dispatchEvent(new CustomEvent('apply-suggestion', { detail: { text } }))
  }, [])

  const genericThinkingPhrases = useMemo<readonly string[]>(() => {
    const list = t.toolStatusPhrases.thinking
    return Array.isArray(list) && list.length > 0 ? list : [t.toolStatus.thinking]
  }, [t])

  const toolStatusPhrases = useMemo<Record<ToolStatus, readonly string[]>>(
    () => ({
      idle: genericThinkingPhrases,
      thinking: t.toolStatusPhrases.thinking,
      searching_web: t.toolStatusPhrases.searching_web,
      querying_db: t.toolStatusPhrases.querying_db,
      searching_network: t.toolStatusPhrases.searching_network,
      generating_image: t.toolStatusPhrases.generating_image,
      deep_research: t.toolStatusPhrases.deep_research,
      creating_document: t.toolStatusPhrases.creating_document,
      reading_ocr: t.toolStatusPhrases.reading_ocr,
      analyzing_spreadsheet: t.toolStatusPhrases.analyzing_spreadsheet,
      summarizing_youtube: t.toolStatusPhrases.summarizing_youtube,
    }),
    [t, genericThinkingPhrases]
  )

  const activeToolStatus: ToolStatus = toolStatus === 'idle' ? 'thinking' : toolStatus
  const activePhraseList = (toolStatusPhrases[activeToolStatus] && toolStatusPhrases[activeToolStatus].length > 0)
    ? toolStatusPhrases[activeToolStatus]
    : genericThinkingPhrases
  const activeThinkingText = activePhraseList[thinkingIdx % activePhraseList.length] || t.toolStatus.thinking
  const isStreamingHere = Boolean(
    isStreaming &&
    activeConversationId &&
    streamingConversationId &&
    streamingConversationId === activeConversationId
  )

  useEffect(() => {
    if (activeConversationId && prevConvIdRef.current && activeConversationId !== prevConvIdRef.current) {
      const startTimer = window.setTimeout(() => setChatTransition(true), 0)
      const endTimer = window.setTimeout(() => setChatTransition(false), 300)
      return () => {
        window.clearTimeout(startTimer)
        window.clearTimeout(endTimer)
      }
    }
    prevConvIdRef.current = activeConversationId
  }, [activeConversationId])

  useEffect(() => {
    if (showScrollBtn) return
    // If a different chat is streaming in the background, avoid forcing scroll jumps.
    if (isStreaming && streamingConversationId && streamingConversationId !== activeConversationId) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent, showScrollBtn, isStreaming, streamingConversationId, activeConversationId])

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

  useEffect(() => {
    if (isStreamingHere && !streamingContent && activePhraseList.length > 1) {
      const interval = setInterval(() => setThinkingIdx((prev) => (prev + 1) % activePhraseList.length), 2200)
      return () => clearInterval(interval)
    }
  }, [isStreamingHere, streamingContent, activePhraseList])

  // Show research window when deep research is active and streaming
  useEffect(() => {
    if (deepResearch && isStreamingHere) {
      setShowResearchWindow(true)
    }
  }, [deepResearch, isStreamingHere])

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="flex flex-col h-full relative chat-bg-pattern">
      <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>
        <div className={`max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-6 pb-48 sm:pb-32 ${chatTransition ? 'chat-transition-enter' : ''}`}>
          {isLoading && (
            <div className="flex justify-center py-8">
              <div className="flex items-center gap-3 px-4 py-2.5 bg-zinc-50 rounded-xl border border-zinc-100">
                <Loader2 className="animate-spin text-blue-500" size={18} />
                <span className="text-sm text-zinc-500">{t.chatArea.loadingConversation}</span>
              </div>
            </div>
          )}

          {!isLoading && messages.length === 0 && (
            <div className="text-center py-20 text-zinc-400 text-sm">
              {t.chatArea.startConversation}
            </div>
          )}

          {!isLoading && messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {isStreamingHere && streamingContent && (
            <div className="mb-6 animate-in fade-in duration-300">
              <div className="flex gap-3">
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <div
                    className="w-9 h-9 rounded-lg overflow-hidden bg-white flex items-center justify-center ring-2 ring-indigo-400/40"
                    style={{ animation: 'avatar-glow 2s ease-in-out infinite' }}
                  >
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

          {/* Deep Research Progress Indicator */}
          {isStreamingHere && deepResearch && (
            <DeepResearchProgress />
          )}

          {isStreamingHere && !streamingContent && (
            <div className="mb-6 flex gap-3 animate-in fade-in duration-300">
              <div
                className="w-9 h-9 shrink-0 mt-0.5 rounded-lg overflow-hidden bg-white flex items-center justify-center ring-2 ring-indigo-400/40"
                style={{ animation: 'avatar-glow 2s ease-in-out infinite' }}
              >
                <Image src="/logo.png" alt="GIA" width={32} height={32} className="object-contain" />
              </div>
              <div className="flex flex-col gap-1.5 pt-1">
                <span className="thinking-shimmer text-sm font-medium">
                  {activeThinkingText}
                </span>
                {webSearch && (
                  <div className="flex items-center gap-1.5 text-xs text-blue-500">
                    <Globe size={12} className="animate-spin" style={{ animationDuration: '3s' }} />
                    <span>{t.toolStatus.searching_web}</span>
                  </div>
                )}
                {dbQuery && (
                  <div className="flex items-center gap-1.5 text-xs text-indigo-500">
                    <Database size={12} className="animate-pulse" />
                    <span>{t.toolStatus.querying_db}</span>
                  </div>
                )}
                {networkDriveRag && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-500">
                    <HardDrive size={12} className="animate-pulse" />
                    <span>{t.toolStatus.searching_network}</span>
                  </div>
                )}
                {imageGeneration && (
                  <div className="flex items-center gap-1.5 text-xs text-purple-500">
                    <ImagePlus size={12} className="animate-pulse" />
                    <span>{t.toolStatus.generating_image}</span>
                  </div>
                )}
                {deepResearch && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600">
                    <FlaskConical size={12} className="animate-pulse" />
                    <span>{t.toolStatus.deep_research}</span>
                  </div>
                )}
                {documentGeneration && (
                  <div className="flex items-center gap-1.5 text-xs text-sky-600">
                    <FileText size={12} className="animate-pulse" />
                    <span>{t.toolStatus.creating_document}</span>
                  </div>
                )}
                {spreadsheetAnalysis && (
                  <div className="flex items-center gap-1.5 text-xs text-cyan-600">
                    <BarChart3 size={12} className="animate-pulse" />
                    <span>{t.toolStatus.analyzing_spreadsheet}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-36 sm:bottom-24 left-1/2 -translate-x-1/2 z-20 p-2.5 bg-white/90 backdrop-blur-md border border-zinc-200 rounded-full shadow-lg hover:shadow-xl hover:bg-white transition-all"
          style={{ animation: 'scroll-btn-in 0.25s ease-out' }}
          aria-label="Ir al final"
        >
          <ArrowDown size={18} className="text-zinc-600" />
        </button>
      )}

      {/* Follow-up suggestions */}
      <FollowUpSuggestions onSelectSuggestion={handleSuggestionSelect} />

      <ChatInput />

      {/* Deep Research Floating Window */}
      <DeepResearchFloatingWindow
        isActive={showResearchWindow}
        onClose={() => setShowResearchWindow(false)}
      />
    </div>
  )
}
