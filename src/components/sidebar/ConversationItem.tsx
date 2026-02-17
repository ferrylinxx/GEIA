'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Conversation } from '@/lib/types'
import { useChatStore } from '@/store/chat-store'
import { useUIStore } from '@/store/ui-store'
import { MoreHorizontal, Pencil, Trash2, Pin, Star, Copy, Download, Share2, Check, Archive, ArchiveRestore } from 'lucide-react'
import { useTranslation } from '@/i18n/LanguageContext'

interface Props {
  conversation: Conversation
  active: boolean
}

export default function ConversationItem({ conversation, active }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(conversation.title)
  const [displayTitle, setDisplayTitle] = useState(conversation.title)
  const [shareStatus, setShareStatus] = useState<'idle' | 'loading' | 'copied'>('idle')
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const prevConversationTitleRef = useRef(conversation.title)
  const typingTimerRef = useRef<number | null>(null)
  const { setActiveConversation, deleteConversation, updateConversation, duplicateConversation, archiveConversation, unarchiveConversation } = useChatStore()
  const { showConfirm, addToast } = useUIStore()

  const handleOpenConversation = () => {
    setActiveConversation(conversation.id)
    router.push(`/chat/${conversation.id}`)
  }

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (renaming && inputRef.current) inputRef.current.focus()
  }, [renaming])

  useEffect(() => {
    // If the user cancels renaming while a title animation was in progress, ensure we show the full title.
    if (!renaming) setDisplayTitle(conversation.title)
  }, [renaming])

  useEffect(() => {
    if (renaming) return
    // Keep rename input in sync when the title updates from the server.
    setTitle(conversation.title)
  }, [conversation.title, renaming])

  useEffect(() => {
    if (renaming) return
    const prev = prevConversationTitleRef.current
    const next = conversation.title
    if (prev === next) return
    prevConversationTitleRef.current = next

    if (typingTimerRef.current) {
      window.clearInterval(typingTimerRef.current)
      typingTimerRef.current = null
    }

    // Animate only when the conversation is being auto-renamed (default title -> generated title).
    const shouldAnimate = prev === 'Nuevo chat' || !prev || prev.trim().length === 0
    if (!shouldAnimate) {
      setDisplayTitle(next)
      return
    }

    setDisplayTitle('')
    let idx = 0
    typingTimerRef.current = window.setInterval(() => {
      idx += 1
      setDisplayTitle(next.slice(0, idx))
      if (idx >= next.length && typingTimerRef.current) {
        window.clearInterval(typingTimerRef.current)
        typingTimerRef.current = null
      }
    }, 18)

    return () => {
      if (typingTimerRef.current) {
        window.clearInterval(typingTimerRef.current)
        typingTimerRef.current = null
      }
    }
  }, [conversation.title, renaming])

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        window.clearInterval(typingTimerRef.current)
        typingTimerRef.current = null
      }
    }
  }, [])

  const handleRename = () => {
    if (title.trim() && title !== conversation.title) {
      updateConversation(conversation.id, { title: title.trim() })
    }
    setRenaming(false)
  }

  const handleShare = async () => {
    setShareStatus('loading')
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversation.id }),
      })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      await navigator.clipboard.writeText(data.url)
      setShareStatus('copied')
      addToast({ type: 'success', message: t.conversation.linkCopiedToast })
      setTimeout(() => { setShareStatus('idle'); setMenuOpen(false) }, 1500)
    } catch {
      setShareStatus('idle')
      addToast({ type: 'error', message: t.conversation.shareError })
    }
  }

  const handleExport = async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data: msgs } = await supabase.from('messages').select('*').eq('conversation_id', conversation.id).order('created_at')
    if (!msgs) return
    const md = msgs.map(m => `### ${m.role === 'user' ? '👤 Usuario' : '🤖 GIA'}\n\n${m.content}\n`).join('\n---\n\n')
    const blob = new Blob([`# ${conversation.title}\n\n${md}`], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${conversation.title}.md`; a.click()
    URL.revokeObjectURL(url)
    setMenuOpen(false)
  }

  return (
    <div className={`relative group flex items-center rounded-lg transition-all duration-200 cursor-pointer ${
      active
        ? 'bg-gradient-to-r from-blue-50 to-indigo-50/50 border-l-[3px] border-blue-500 shadow-sm shadow-blue-500/5'
        : 'border-l-[3px] border-transparent hover:bg-white/80 hover:border-blue-300/50 hover:shadow-sm hover:scale-[1.01]'
    }`}>
      {renaming ? (
        <input ref={inputRef} value={title} onChange={e => setTitle(e.target.value)}
          onBlur={handleRename} onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setRenaming(false); setTitle(conversation.title) } }}
          className="flex-1 px-3 py-2 bg-transparent text-sm text-zinc-800 focus:outline-none" />
      ) : (
        <button onClick={handleOpenConversation} className={`flex-1 text-left px-3 py-2 text-sm truncate ${active ? 'text-zinc-900 font-medium' : 'text-zinc-700'}`}>
          {conversation.pinned && '📌 '}{conversation.favorite && '⭐ '}{displayTitle}
        </button>
      )}

      <div className="relative" ref={menuRef}>
        <button onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
          className="p-2 md:p-1 mr-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-zinc-300 rounded transition-all text-zinc-500" aria-label={t.conversation.menu}>
          <MoreHorizontal size={14} />
        </button>

        {menuOpen && (
          <div className="dropdown-animated absolute right-0 top-full mt-1 bg-white/95 backdrop-blur-lg border border-zinc-100 rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.08)] py-1.5 z-50 min-w-[170px]">
            <button onClick={() => { setRenaming(true); setMenuOpen(false) }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50/50 flex items-center gap-2 text-zinc-600 transition-colors rounded-lg mx-0.5" style={{width: 'calc(100% - 4px)'}}>
              <Pencil size={12} className="text-blue-500" /> {t.conversation.rename}
            </button>
            <button onClick={() => { updateConversation(conversation.id, { pinned: !conversation.pinned }); setMenuOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-amber-50/50 flex items-center gap-2 text-zinc-600 transition-colors rounded-lg mx-0.5" style={{width: 'calc(100% - 4px)'}}>
              <Pin size={12} className="text-amber-500" /> {conversation.pinned ? t.conversation.unpin : t.conversation.pin}
            </button>
            <button onClick={() => { updateConversation(conversation.id, { favorite: !conversation.favorite }); setMenuOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-yellow-50/50 flex items-center gap-2 text-zinc-600 transition-colors rounded-lg mx-0.5" style={{width: 'calc(100% - 4px)'}}>
              <Star size={12} className="text-yellow-500" /> {conversation.favorite ? t.conversation.unfavorite : t.conversation.favorite}
            </button>
            <button onClick={() => { duplicateConversation(conversation.id); setMenuOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-violet-50/50 flex items-center gap-2 text-zinc-600 transition-colors rounded-lg mx-0.5" style={{width: 'calc(100% - 4px)'}}>
              <Copy size={12} className="text-violet-500" /> {t.conversation.duplicate}
            </button>
            <button onClick={handleShare} disabled={shareStatus === 'loading'}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-green-50/50 flex items-center gap-2 text-zinc-600 transition-colors rounded-lg mx-0.5" style={{width: 'calc(100% - 4px)'}}>
              {shareStatus === 'copied' ? <><Check size={12} className="text-green-500" /> <span className="text-green-600">{t.conversation.linkCopied}</span></> : shareStatus === 'loading' ? <><div className="w-3 h-3 border border-zinc-300 border-t-blue-500 rounded-full animate-spin" /> {t.conversation.sharing}</> : <><Share2 size={12} className="text-green-500" /> {t.conversation.share}</>}
            </button>
            <button onClick={handleExport}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-indigo-50/50 flex items-center gap-2 text-zinc-600 transition-colors rounded-lg mx-0.5" style={{width: 'calc(100% - 4px)'}}>
              <Download size={12} className="text-indigo-500" /> {t.conversation.exportMd}
            </button>
            {conversation.is_archived ? (
              <button onClick={() => { unarchiveConversation(conversation.id); setMenuOpen(false); addToast({ type: 'success', message: t.conversation.chatRestored }) }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-orange-50/50 flex items-center gap-2 text-zinc-600 transition-colors rounded-lg mx-0.5" style={{width: 'calc(100% - 4px)'}}>
                <ArchiveRestore size={12} className="text-orange-500" /> {t.conversation.restore}
              </button>
            ) : (
              <button onClick={() => { archiveConversation(conversation.id); setMenuOpen(false); addToast({ type: 'success', message: t.conversation.chatArchived }) }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-orange-50/50 flex items-center gap-2 text-zinc-600 transition-colors rounded-lg mx-0.5" style={{width: 'calc(100% - 4px)'}}>
                <Archive size={12} className="text-orange-500" /> {t.conversation.archive}
              </button>
            )}
            <hr className="border-zinc-100 my-1.5" />
            <button onClick={() => {
              setMenuOpen(false)
              showConfirm({
                title: t.conversation.deleteTitle,
                message: t.conversation.deleteConfirm.replace('{title}', conversation.title),
                confirmLabel: t.conversation.delete,
                variant: 'danger',
                onConfirm: async () => {
                  await deleteConversation(conversation.id)
                  if (active) {
                    router.replace('/chat')
                  }
                  addToast({ type: 'success', message: t.conversation.conversationDeleted })
                },
              })
            }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-red-50/50 flex items-center gap-2 text-red-500 transition-colors rounded-lg mx-0.5" style={{width: 'calc(100% - 4px)'}}>
              <Trash2 size={12} /> {t.conversation.delete}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
