'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useChatStore } from '@/store/chat-store'
import { useProjectContext } from '@/hooks/useProjectContext'
import { useTranslation } from '@/i18n/LanguageContext'
import ChatInput from '@/components/chat/ChatInput'
import { ArrowRight, Clock3, FolderOpen, MessageSquare, X } from 'lucide-react'

function formatProjectChatDate(value: string, locale: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default function ProjectWelcomeScreen() {
  const router = useRouter()
  const { t, language } = useTranslation()
  const conversations = useChatStore((s) => s.conversations)
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)
  const setProjectContextId = useChatStore((s) => s.setProjectContextId)
  const { projectId, projectName } = useProjectContext()

  const locale = language === 'ca' ? 'ca-ES' : 'es-ES'

  const projectConversations = useMemo(() => {
    if (!projectId) return []
    return conversations
      .filter((conversation) => conversation.project_id === projectId)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  }, [conversations, projectId])

  const chatsCountLabel = t.projectWelcome.chatsCount.replace('{count}', String(projectConversations.length))

  const openConversation = (conversationId: string) => {
    setActiveConversation(conversationId)
    router.push(`/chat/${conversationId}`)
  }

  const handleExitProject = () => {
    setProjectContextId(null)
    setActiveConversation(null)
    router.push('/chat')
  }

  return (
    <div className="flex flex-col h-full relative chat-bg-pattern">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 pt-8 sm:pt-10 pb-52 sm:pb-36">
          <div className="liquid-glass-card rounded-3xl border border-white/60 shadow-[0_18px_60px_rgba(15,23,42,0.12)] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-cyan-50 border border-cyan-100 flex items-center justify-center shrink-0">
                <FolderOpen size={18} className="text-cyan-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-600">{t.projectWelcome.label}</p>
                <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 truncate">{projectName || t.projectWelcome.projectFallback}</h1>
                <p className="mt-2 text-sm text-zinc-600">{t.projectWelcome.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={handleExitProject}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white/80 text-xs font-semibold text-zinc-600 hover:bg-white shrink-0"
                title={t.projectWelcome.exitProject}
              >
                <X size={13} />
                <span className="hidden sm:inline">{t.projectWelcome.exitProject}</span>
              </button>
            </div>
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/70 bg-white/70 text-xs font-semibold text-zinc-600">
              <MessageSquare size={13} className="text-cyan-600" />
              {chatsCountLabel}
            </div>
            <p className="mt-3 text-xs text-zinc-500">{t.projectWelcome.writeBelow}</p>
          </div>

          <div className="mt-4 liquid-glass-card rounded-3xl border border-white/60 shadow-[0_14px_42px_rgba(15,23,42,0.1)] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/60">
              <h2 className="text-sm font-semibold text-zinc-800">{t.projectWelcome.chatsTitle}</h2>
            </div>

            {projectConversations.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-zinc-500">
                {t.projectWelcome.noChats}
              </div>
            ) : (
              <div className="divide-y divide-white/60">
                {projectConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => openConversation(conversation.id)}
                    className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-white/65 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-zinc-800 truncate">{conversation.title || t.sidebar.newChat}</p>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500">
                        <Clock3 size={11} />
                        <span>{formatProjectChatDate(conversation.updated_at, locale)}</span>
                      </div>
                    </div>
                    <ArrowRight size={14} className="text-zinc-400 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <ChatInput />
    </div>
  )
}
