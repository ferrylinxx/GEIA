'use client'

import { useState, useRef, useEffect } from 'react'
import { Conversation } from '@/lib/types'
import { useChatStore } from '@/store/chat-store'
import { MoreHorizontal, Pencil, Trash2, Pin, Star, Copy, Download } from 'lucide-react'

interface Props {
  conversation: Conversation
  active: boolean
}

export default function ConversationItem({ conversation, active }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(conversation.title)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { setActiveConversation, deleteConversation, updateConversation, duplicateConversation } = useChatStore()

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

  const handleRename = () => {
    if (title.trim() && title !== conversation.title) {
      updateConversation(conversation.id, { title: title.trim() })
    }
    setRenaming(false)
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
    <div className={`relative group flex items-center rounded-lg transition-colors cursor-pointer ${active ? 'bg-zinc-200' : 'hover:bg-zinc-100'}`}>
      {renaming ? (
        <input ref={inputRef} value={title} onChange={e => setTitle(e.target.value)}
          onBlur={handleRename} onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setRenaming(false); setTitle(conversation.title) } }}
          className="flex-1 px-3 py-2 bg-transparent text-sm text-zinc-800 focus:outline-none" />
      ) : (
        <button onClick={() => setActiveConversation(conversation.id)} className="flex-1 text-left px-3 py-2 text-sm truncate text-zinc-700">
          {conversation.pinned && '📌 '}{conversation.favorite && '⭐ '}{conversation.title}
        </button>
      )}

      <div className="relative" ref={menuRef}>
        <button onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
          className="p-1 mr-1 opacity-0 group-hover:opacity-100 hover:bg-zinc-300 rounded transition-all text-zinc-500" aria-label="Menú">
          <MoreHorizontal size={14} />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 bg-white border border-zinc-200 rounded-lg shadow-lg py-1 z-50 min-w-[160px]">
            <button onClick={() => { setRenaming(true); setMenuOpen(false) }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-50 flex items-center gap-2 text-zinc-600">
              <Pencil size={12} /> Renombrar
            </button>
            <button onClick={() => { updateConversation(conversation.id, { pinned: !conversation.pinned }); setMenuOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-50 flex items-center gap-2 text-zinc-600">
              <Pin size={12} /> {conversation.pinned ? 'Desanclar' : 'Anclar'}
            </button>
            <button onClick={() => { updateConversation(conversation.id, { favorite: !conversation.favorite }); setMenuOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-50 flex items-center gap-2 text-zinc-600">
              <Star size={12} /> {conversation.favorite ? 'Quitar favorito' : 'Favorito'}
            </button>
            <button onClick={() => { duplicateConversation(conversation.id); setMenuOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-50 flex items-center gap-2 text-zinc-600">
              <Copy size={12} /> Duplicar
            </button>
            <button onClick={handleExport}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-50 flex items-center gap-2 text-zinc-600">
              <Download size={12} /> Exportar .md
            </button>
            <hr className="border-zinc-200 my-1" />
            <button onClick={() => { deleteConversation(conversation.id); setMenuOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-50 flex items-center gap-2 text-red-500">
              <Trash2 size={12} /> Eliminar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

