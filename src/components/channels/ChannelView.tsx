'use client'

import { useState, useEffect, useRef, useCallback, useMemo, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Channel, ChannelMessage } from '@/lib/types'
import { Send, Users, Hash, ArrowLeft, X, Shield, AtSign, Bot, CalendarDays, Clock3, UserCircle2, Crown } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTranslation } from '@/i18n/LanguageContext'
import { OFFLINE_AFTER_MS } from '@/lib/activity'
import { formatExactDateTime, formatRelativeTime } from '@/lib/date-time'

interface Props {
  channel: Channel
  onBack: () => void
}

type ActivityStatus = 'online' | 'idle' | 'offline'

type MentionGroup = 'users' | 'models'

interface ChannelMemberEntry {
  user_id: string
  role: 'admin' | 'member'
  joined_at: string | null
  status?: ActivityStatus
  last_seen_at?: string | null
  profile?: {
    name: string | null
    avatar_url: string | null
  }
}

interface DynamicModel {
  id: string
  name: string
  owned_by: string
}

interface MentionSuggestion {
  id: string
  label: string
  value: string
  group: MentionGroup
  subtitle?: string
  avatarUrl?: string | null
  status?: ActivityStatus
}

function getStatus(status?: string | null): ActivityStatus {
  if (status === 'online' || status === 'idle' || status === 'offline') return status
  return 'offline'
}

function buildUserHandle(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
}

function styleMentionsAsLinks(content: string): string {
  return content.replace(/(^|[\s(])@([A-Za-z0-9._-]+)/g, (_match, prefix: string, token: string) => {
    return `${prefix}[@${token}](mention:${token})`
  })
}

export default function ChannelView({ channel, onBack }: Props) {
  const { t, language } = useTranslation()
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [memberCount, setMemberCount] = useState(0)
  const [channelMembers, setChannelMembers] = useState<ChannelMemberEntry[]>([])
  const [models, setModels] = useState<DynamicModel[]>([])
  const [selectedUser, setSelectedUser] = useState<ChannelMessage | null>(null)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionStart, setMentionStart] = useState<number | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const visibleUserIdsRef = useRef<string[]>([])

  const locale = language === 'ca' ? 'ca-ES' : 'es-ES'

  const statusConfig: Record<ActivityStatus, { label: string; dotClass: string; textClass: string; softClass: string }> = {
    online: {
      label: t.channels.statusOnline,
      dotClass: 'bg-emerald-500',
      textClass: 'text-emerald-600',
      softClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    },
    idle: {
      label: t.channels.statusIdle,
      dotClass: 'bg-amber-500',
      textClass: 'text-amber-600',
      softClass: 'bg-amber-50 text-amber-700 border border-amber-200',
    },
    offline: {
      label: t.channels.statusOffline,
      dotClass: 'bg-zinc-400',
      textClass: 'text-zinc-500',
      softClass: 'bg-zinc-100 text-zinc-600 border border-zinc-200',
    },
  }

  const markdownComponents = useMemo(() => ({
    a: ({ href, children, ...props }: ComponentPropsWithoutRef<'a'>): ReactNode => {
      if (typeof href === 'string' && href.startsWith('mention:')) {
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 font-semibold text-[0.85em] ring-1 ring-blue-200/70">
            {children}
          </span>
        )
      }

      return (
        <a href={href} target="_blank" rel="noreferrer noopener" {...props}>
          {children}
        </a>
      )
    },
  }), [])

  const formatDateTime = (dateValue?: string | null): string => {
    if (!dateValue) return t.channels.noData
    const parsed = Date.parse(dateValue)
    if (!Number.isFinite(parsed)) return t.channels.noData
    return new Date(parsed).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
  }

  const formatLastSeenRelative = (dateValue?: string | null): string => {
    return formatRelativeTime(dateValue || null, locale) || ''
  }

  const formatLastSeenExact = (dateValue?: string | null): string => {
    return formatExactDateTime(dateValue || null, locale) || ''
  }

  const shouldShowLastSeen = (status: ActivityStatus, dateValue?: string | null): boolean => {
    if (status !== 'offline' || !dateValue) return false
    const parsed = Date.parse(dateValue)
    if (!Number.isFinite(parsed)) return false
    return Date.now() - parsed >= OFFLINE_AFTER_MS
  }

  const appRoleLabel = (role?: string | null): string => {
    if (role === 'admin') return t.channels.appRoleAdmin
    if (role === 'user') return t.channels.appRoleUser
    return t.channels.noData
  }

  const channelRoleLabel = (role?: string | null): string => {
    if (role === 'admin') return t.channels.channelRoleAdmin
    if (role === 'member') return t.channels.channelRoleMember
    return t.channels.noData
  }

  const normalizeGender = (gender?: string | null): string => {
    if (!gender) return t.channels.noData
    const value = gender.trim().toLowerCase()
    if (!value) return t.channels.noData
    if (value === 'masculino' || value === 'hombre' || value === 'male' || value === 'masculi') return t.settings.genderMale
    if (value === 'femenino' || value === 'mujer' || value === 'female' || value === 'femeni') return t.settings.genderFemale
    if (value === 'no_binario' || value === 'nobinario' || value === 'no binario' || value === 'non-binary' || value === 'no binari') return t.settings.genderNonBinary
    if (value === 'otro' || value === 'altre') return t.settings.genderOther
    if (value === 'prefiero no decir' || value === 'prefereixo no dir-ho') return t.settings.genderPreferNotSay
    return gender
  }

  const formatBirthDateWithAge = (birthDate?: string | null): string => {
    if (!birthDate) return t.channels.noData
    const parsedMs = Date.parse(birthDate)
    if (!Number.isFinite(parsedMs)) return t.channels.noData

    const birth = new Date(parsedMs)
    const now = new Date()
    let age = now.getFullYear() - birth.getFullYear()
    const monthDiff = now.getMonth() - birth.getMonth()
    const dayDiff = now.getDate() - birth.getDate()
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age--
    if (age < 0) return t.channels.noData

    const dateText = birth.toLocaleDateString(locale, { dateStyle: 'medium' })
    return `${dateText} (${age} anos)`
  }

  const loadMessages = useCallback(async () => {
    const res = await fetch(`/api/channels/${channel.id}/messages`)
    if (res.ok) {
      const data = await res.json()
      setMessages(Array.isArray(data) ? data : [])
    }
  }, [channel.id])

  const loadMembers = useCallback(async () => {
    const res = await fetch(`/api/channels/${channel.id}/members`)
    if (res.ok) {
      const data = await res.json()
      const list = Array.isArray(data) ? data as ChannelMemberEntry[] : []
      setChannelMembers(list)
      setMemberCount(list.length)
    }
  }, [channel.id])

  const loadModels = useCallback(async () => {
    try {
      const res = await fetch('/api/models')
      if (!res.ok) return
      const data = await res.json()
      const list = Array.isArray(data?.models) ? data.models as DynamicModel[] : []
      setModels(list)
    } catch {
      setModels([])
    }
  }, [])

  const refreshVisibleStatuses = useCallback(async (requestedUserIds?: string[]) => {
    const sourceIds = requestedUserIds && requestedUserIds.length > 0
      ? requestedUserIds
      : visibleUserIdsRef.current
    const userIds = Array.from(new Set(sourceIds.filter(Boolean))).slice(0, 200)
    if (userIds.length === 0) return

    try {
      const query = encodeURIComponent(userIds.join(','))
      const res = await fetch(`/api/activity/status?user_ids=${query}`, { cache: 'no-store' })
      if (!res.ok) return

      const data = await res.json()
      const statuses = (data?.statuses || {}) as Record<string, { status?: ActivityStatus; last_seen_at?: string | null }>

      setMessages((prev) => prev.map((msg) => {
        const statusEntry = statuses[msg.user_id]
        if (!statusEntry) return msg
        return {
          ...msg,
          user_status: getStatus(statusEntry.status),
          user_last_seen_at: statusEntry.last_seen_at || null,
        }
      }))

      setChannelMembers((prev) => prev.map((member) => {
        const statusEntry = statuses[member.user_id]
        if (!statusEntry) return member
        return {
          ...member,
          status: getStatus(statusEntry.status),
          last_seen_at: statusEntry.last_seen_at || null,
        }
      }))

      setSelectedUser((prev) => {
        if (!prev) return prev
        const statusEntry = statuses[prev.user_id]
        if (!statusEntry) return prev
        return {
          ...prev,
          user_status: getStatus(statusEntry.status),
          user_last_seen_at: statusEntry.last_seen_at || null,
        }
      })
    } catch {
      // ignore transient refresh failures
    }
  }, [])

  useEffect(() => {
    loadMessages()
    loadMembers()
    loadModels()
    setSelectedUser(null)
  }, [loadMessages, loadMembers, loadModels])

  useEffect(() => {
    const ids = [
      ...messages.map((message) => message.user_id),
      ...channelMembers.map((member) => member.user_id),
    ]
    visibleUserIdsRef.current = Array.from(new Set(ids))
  }, [messages, channelMembers])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const supabase = createClient()
    const channelSub = supabase
      .channel(`channel-${channel.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'channel_messages',
        filter: `channel_id=eq.${channel.id}`,
      }, () => {
        loadMessages()
      })
      .subscribe()

    const activitySub = supabase
      .channel(`channel-activity-${channel.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_activity_events',
      }, (payload) => {
        const newRow = payload.new && typeof payload.new === 'object'
          ? payload.new as Record<string, unknown>
          : null
        const oldRow = payload.old && typeof payload.old === 'object'
          ? payload.old as Record<string, unknown>
          : null
        const changedUserId = typeof newRow?.user_id === 'string'
          ? newRow.user_id
          : typeof oldRow?.user_id === 'string'
            ? oldRow.user_id
            : null
        if (!changedUserId) return
        if (!visibleUserIdsRef.current.includes(changedUserId)) return
        refreshVisibleStatuses([changedUserId])
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channelSub)
      supabase.removeChannel(activitySub)
    }
  }, [channel.id, loadMessages, refreshVisibleStatuses])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedUser(null)
        setMentionOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const mentionSuggestions = useMemo<MentionSuggestion[]>(() => {
    if (!mentionOpen) return []
    const q = mentionQuery.trim().toLowerCase()

    const userSuggestions: MentionSuggestion[] = channelMembers
      .map((member) => {
        const displayName = member.profile?.name || t.channels.user
        const handle = buildUserHandle(displayName)
        return {
          id: `user-${member.user_id}`,
          label: displayName,
          value: `@${handle}`,
          group: 'users' as const,
          avatarUrl: member.profile?.avatar_url || null,
          status: getStatus(member.status),
        }
      })
      .filter((candidate) => {
        if (!q) return true
        return candidate.label.toLowerCase().includes(q) || candidate.value.slice(1).includes(q)
      })
      .slice(0, 6)

    const modelSuggestions: MentionSuggestion[] = models
      .map((model) => ({
        id: `model-${model.id}`,
        label: model.name || model.id,
        value: `@${model.id}`,
        group: 'models' as const,
        subtitle: model.owned_by,
      }))
      .filter((candidate) => {
        if (!q) return true
        return candidate.label.toLowerCase().includes(q) || candidate.value.slice(1).toLowerCase().includes(q)
      })
      .slice(0, 6)

    return [...userSuggestions, ...modelSuggestions]
  }, [mentionOpen, mentionQuery, channelMembers, models, t.channels.user])

  const closeMentionMenu = () => {
    setMentionOpen(false)
    setMentionQuery('')
    setMentionStart(null)
    setMentionIndex(0)
  }

  const updateMentionContext = (nextValue: string, caretPos: number) => {
    const beforeCursor = nextValue.slice(0, caretPos)
    const atIndex = beforeCursor.lastIndexOf('@')

    if (atIndex === -1) {
      closeMentionMenu()
      return
    }

    if (atIndex > 0 && !/\s/.test(beforeCursor[atIndex - 1])) {
      closeMentionMenu()
      return
    }

    const rawQuery = beforeCursor.slice(atIndex + 1)
    if (/\s/.test(rawQuery)) {
      closeMentionMenu()
      return
    }

    setMentionOpen(true)
    setMentionStart(atIndex)
    setMentionQuery(rawQuery)
    setMentionIndex(0)
  }

  const insertMention = (suggestion: MentionSuggestion) => {
    const ta = textareaRef.current
    if (!ta || mentionStart === null) return

    const caretPos = ta.selectionStart ?? input.length
    const before = input.slice(0, mentionStart)
    const after = input.slice(caretPos)
    const next = `${before}${suggestion.value} ${after}`

    setInput(next)
    closeMentionMenu()

    const nextCursor = (before + suggestion.value + ' ').length
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(nextCursor, nextCursor)
    })
  }

  const handleSend = async () => {
    if (!input.trim() || sending) return
    const text = input.trim()
    setInput('')
    setSending(true)
    closeMentionMenu()

    try {
      const res = await fetch(`/api/channels/${channel.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      })
      if (res.ok) {
        const msg = await res.json()
        setMessages((prev) => [...prev, msg])
      }
    } catch (e) {
      console.error('Error sending message:', e)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((prev) => (prev + 1) % mentionSuggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((prev) => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(mentionSuggestions[mentionIndex] || mentionSuggestions[0])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        closeMentionMenu()
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="liquid-glass-header px-4 py-3 flex items-center gap-3 border-b border-white/20">
        <button onClick={onBack} className="p-1.5 hover:bg-zinc-200 rounded-lg transition-colors text-zinc-500">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-lg">{channel.icon}</span>
          <Hash size={16} className="text-zinc-400" />
          <span className="font-semibold text-zinc-800">{channel.name}</span>
        </div>
        {channel.description && (
          <span className="text-xs text-zinc-400 hidden md:block">- {channel.description}</span>
        )}
        <div className="ml-auto flex items-center gap-1.5 text-xs text-zinc-500">
          <Users size={14} /> {memberCount}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <span className="text-4xl block mb-3">{channel.icon}</span>
            <p className="text-zinc-500 text-sm">{t.channels.noMessages}</p>
          </div>
        )}

        {messages.map((msg) => {
          const status = getStatus(msg.user_status)
          const statusCfg = statusConfig[status]
          const isAdminUser = (msg.user_role || '').toLowerCase() === 'admin'
          const showInactiveLastSeen = shouldShowLastSeen(status, msg.user_last_seen_at)
          const inactiveLastSeen = showInactiveLastSeen ? formatLastSeenRelative(msg.user_last_seen_at) : ''
          const inactiveLastSeenExact = showInactiveLastSeen ? formatLastSeenExact(msg.user_last_seen_at) : ''
          const renderedMessage = styleMentionsAsLinks(msg.content || '')

          return (
            <div key={msg.id} className="flex gap-3 group" style={{ animation: 'message-in 0.2s ease-out' }}>
              <button
                type="button"
                onClick={() => setSelectedUser(msg)}
                className={`relative w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0 ring-offset-2 hover:ring-2 hover:ring-blue-300 transition-all ${isAdminUser ? 'admin-crown-wrap admin-crown-ring' : ''}`}
                title={t.channels.viewUserProfile}
              >
                {msg.user_avatar ? (
                  <img src={msg.user_avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  (msg.user_name || t.channels.user)[0].toUpperCase()
                )}
                {isAdminUser && (
                  <span className="admin-crown-badge" aria-hidden="true">
                    <Crown size={8} strokeWidth={2.2} />
                  </span>
                )}
                <span
                  className={`absolute right-0 bottom-0 w-2.5 h-2.5 rounded-full ring-2 ring-white ${statusCfg.dotClass}`}
                />
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-zinc-800">{msg.user_name || t.channels.user}</span>
                  <span className={`text-[10px] font-medium ${statusCfg.textClass}`}>{statusCfg.label}</span>
                  {inactiveLastSeen && (
                    <span
                      className="text-[10px] text-zinc-400"
                      title={inactiveLastSeenExact ? t.channels.lastSeenExact.replace('{time}', inactiveLastSeenExact) : undefined}
                    >
                      {t.channels.lastSeenAt.replace('{time}', inactiveLastSeen)}
                    </span>
                  )}
                  <span className="text-[10px] text-zinc-400">
                    {new Date(msg.created_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="text-sm text-zinc-700 prose prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {renderedMessage}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          )
        })}

        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-zinc-200/50">
        <div className="relative">
          {mentionOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-full max-w-md rounded-xl border border-zinc-200 bg-white shadow-lg z-20 overflow-hidden">
              {mentionSuggestions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-zinc-400">{t.channels.noMentionResults}</p>
              ) : (
                mentionSuggestions.map((suggestion, idx) => {
                  const selected = idx === mentionIndex
                  const prev = mentionSuggestions[idx - 1]
                  const showGroupLabel = idx === 0 || prev.group !== suggestion.group

                  return (
                    <div key={suggestion.id}>
                      {showGroupLabel && (
                        <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                          {suggestion.group === 'users' ? t.channels.mentionUsers : t.channels.mentionModels}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => insertMention(suggestion)}
                        className={`w-full text-left px-3 py-2 flex items-center gap-2 text-xs transition-colors ${selected ? 'bg-blue-50 text-blue-700' : 'hover:bg-zinc-50 text-zinc-700'}`}
                      >
                        {suggestion.group === 'users' ? (
                          <div className="relative w-6 h-6 shrink-0">
                            <div className="w-6 h-6 rounded-full bg-zinc-200 overflow-hidden flex items-center justify-center text-[10px] font-semibold text-zinc-600">
                              {suggestion.avatarUrl ? (
                                <img src={suggestion.avatarUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                suggestion.label[0]?.toUpperCase() || 'U'
                              )}
                            </div>
                            {suggestion.status && (
                              <span className={`absolute right-0 bottom-0 w-2.5 h-2.5 rounded-full ring-[1.5px] ring-white ${statusConfig[suggestion.status].dotClass}`} />
                            )}
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                            <Bot size={12} />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{suggestion.label}</p>
                          <p className="truncate text-[10px] text-blue-600 font-semibold">{suggestion.value}</p>
                        </div>

                        <AtSign size={12} className="text-zinc-300" />
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          )}

          <div className="liquid-glass-input flex items-end gap-2 px-4 py-2 rounded-2xl">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                const nextValue = e.target.value
                setInput(nextValue)
                updateMentionContext(nextValue, e.target.selectionStart ?? nextValue.length)
              }}
              onClick={(e) => updateMentionContext(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length)}
              onKeyUp={(e) => updateMentionContext(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length)}
              onKeyDown={handleKeyDown}
              placeholder={t.channels.messageIn.replace('{name}', channel.name)}
              className="flex-1 bg-transparent text-sm text-zinc-800 placeholder-zinc-400 resize-none max-h-[100px] focus:outline-none py-1"
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className={`p-2 rounded-xl transition-all shrink-0 ${
                input.trim() ? 'text-white bg-gradient-to-r from-blue-500 to-indigo-500 hover:scale-105' : 'text-zinc-300 bg-zinc-100'
              }`}
            >
              <Send size={16} />
            </button>
          </div>

          <p className="text-[10px] text-zinc-400 mt-1.5 px-1">{t.channels.mentionHint}</p>
        </div>
      </div>

      {selectedUser && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4"
          onClick={() => setSelectedUser(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white border border-zinc-200/70 shadow-[0_28px_70px_rgba(15,23,42,0.28)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: 'message-in 0.2s ease-out' }}
          >
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-cyan-50/60">
              <p className="text-sm font-semibold text-zinc-800">{t.channels.profileTitle}</p>
              <button
                onClick={() => setSelectedUser(null)}
                className="p-1.5 rounded-lg hover:bg-white/70 text-zinc-500"
                aria-label={t.channels.close}
              >
                <X size={15} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className={`relative w-16 h-16 shrink-0 ${(selectedUser.user_role || '').toLowerCase() === 'admin' ? 'admin-crown-wrap' : ''}`}>
                  <div className={`w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 overflow-hidden flex items-center justify-center text-white text-lg font-semibold shadow-md ${(selectedUser.user_role || '').toLowerCase() === 'admin' ? 'admin-crown-ring' : ''}`}>
                    {selectedUser.user_avatar ? (
                      <img src={selectedUser.user_avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      (selectedUser.user_name || t.channels.user)[0].toUpperCase()
                    )}
                  </div>
                  {(selectedUser.user_role || '').toLowerCase() === 'admin' && (
                    <span className="admin-crown-badge" aria-hidden="true">
                      <Crown size={8} strokeWidth={2.2} />
                    </span>
                  )}
                  <span className={`absolute right-0 bottom-0 w-3.5 h-3.5 rounded-full ring-2 ring-white ${statusConfig[getStatus(selectedUser.user_status)].dotClass}`} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold text-zinc-900 truncate">{selectedUser.user_name || t.channels.user}</p>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${statusConfig[getStatus(selectedUser.user_status)].softClass}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusConfig[getStatus(selectedUser.user_status)].dotClass}`} />
                      {statusConfig[getStatus(selectedUser.user_status)].label}
                    </span>
                    {shouldShowLastSeen(getStatus(selectedUser.user_status), selectedUser.user_last_seen_at) && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-zinc-100 text-zinc-600">
                        <Clock3 size={11} />
                        {formatLastSeenRelative(selectedUser.user_last_seen_at) || t.channels.noData}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 py-2.5">
                  <p className="text-zinc-500 flex items-center gap-1.5 mb-1"><Shield size={12} /> {t.channels.appRole}</p>
                  <p className="text-zinc-800 font-semibold">{appRoleLabel(selectedUser.user_role)}</p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 py-2.5">
                  <p className="text-zinc-500 flex items-center gap-1.5 mb-1"><UserCircle2 size={12} /> {t.channels.channelRole}</p>
                  <p className="text-zinc-800 font-semibold">{channelRoleLabel(selectedUser.channel_role)}</p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 py-2.5">
                  <p className="text-zinc-500 mb-1">{t.channels.gender}</p>
                  <p className="text-zinc-800 font-semibold">{normalizeGender(selectedUser.user_gender)}</p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 py-2.5">
                  <p className="text-zinc-500 mb-1">{t.channels.birth}</p>
                  <p className="text-zinc-800 font-semibold">{formatBirthDateWithAge(selectedUser.user_birth_date)}</p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 py-2.5">
                  <p className="text-zinc-500 flex items-center gap-1.5 mb-1"><CalendarDays size={12} /> {t.channels.lastActivity}</p>
                  <p className="text-zinc-800 font-semibold">{formatDateTime(selectedUser.user_last_seen_at)}</p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 py-2.5">
                  <p className="text-zinc-500 mb-1">{t.channels.memberSince}</p>
                  <p className="text-zinc-800 font-semibold">{formatDateTime(selectedUser.channel_joined_at)}</p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 py-2.5 sm:col-span-2">
                  <p className="text-zinc-500 mb-1">{t.channels.accountCreated}</p>
                  <p className="text-zinc-800 font-semibold">{formatDateTime(selectedUser.user_created_at)}</p>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white px-3.5 py-3">
                <p className="text-zinc-500 text-xs mb-1.5">{t.channels.bio}</p>
                <p className="text-zinc-700 text-sm leading-relaxed">
                  {selectedUser.user_bio?.trim() ? selectedUser.user_bio : t.channels.noBio}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
