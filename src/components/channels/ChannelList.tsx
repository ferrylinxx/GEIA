'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Channel } from '@/lib/types'
import { Hash, Plus, Users, Pencil, Trash2, Crown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { OFFLINE_AFTER_MS } from '@/lib/activity'
import { formatExactDateTime, formatRelativeTime } from '@/lib/date-time'
import { useTranslation } from '@/i18n/LanguageContext'

interface Props {
  activeChannelId: string | null
  onSelectChannel: (channel: Channel) => void
  onClose: () => void
  onChannelDeleted?: (channelId: string) => void
}

type ActivityStatus = 'online' | 'idle' | 'offline'

type ChannelEntry = Channel & { is_member?: boolean; can_manage?: boolean }

interface ChannelDirectoryUser {
  id: string
  name: string | null
  avatar_url: string | null
  role: string | null
  status: ActivityStatus
  last_seen_at: string | null
}

const CHANNEL_ICONS = ['\u{1F4AC}', '\u{1F4E2}', '\u{1F680}', '\u{1F4BB}', '\u{1F4A1}', '\u{1F3AF}', '\u{1F389}', '\u{1F527}', '\u{1F3A8}', '\u{1F4DA}']

export default function ChannelList({ activeChannelId, onSelectChannel, onChannelDeleted }: Props) {
  const { t, language } = useTranslation()
  const [channels, setChannels] = useState<ChannelEntry[]>([])
  const [directoryUsers, setDirectoryUsers] = useState<ChannelDirectoryUser[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newIcon, setNewIcon] = useState(CHANNEL_ICONS[0])
  const [creating, setCreating] = useState(false)
  const [openingDmUserId, setOpeningDmUserId] = useState<string | null>(null)
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editIcon, setEditIcon] = useState(CHANNEL_ICONS[0])
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingChannelId, setDeletingChannelId] = useState<string | null>(null)
  const [channelUnread, setChannelUnread] = useState<Record<string, number>>({})
  const usersRefreshTimerRef = useRef<number | null>(null)
  const unreadRefreshTimerRef = useRef<number | null>(null)

  const locale = language === 'ca' ? 'ca-ES' : 'es-ES'

  const loadChannels = useCallback(async () => {
    const res = await fetch('/api/channels')
    if (res.ok) {
      const data = await res.json()
      setChannels(Array.isArray(data) ? data as ChannelEntry[] : [])
    }
  }, [])

  const loadUsers = useCallback(async () => {
    const res = await fetch('/api/channels/users')
    if (res.ok) {
      const data = await res.json()
      setDirectoryUsers(Array.isArray(data) ? data : [])
    }
  }, [])

  const loadUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/channels/unread', { cache: 'no-store' })
      if (!res.ok) return

      const data = await res.json()
      const unreadByChannel = data?.channels && typeof data.channels === 'object'
        ? data.channels as Record<string, number>
        : {}
      setChannelUnread(unreadByChannel)
    } catch {
      // ignore transient unread refresh errors
    }
  }, [])

  useEffect(() => {
    loadChannels()
    loadUsers()
    loadUnread()
  }, [loadChannels, loadUsers, loadUnread])

  useEffect(() => {
    const interval = window.setInterval(loadUnread, 15_000)
    return () => window.clearInterval(interval)
  }, [loadUnread])

  useEffect(() => {
    if (!activeChannelId) return
    const timeout = window.setTimeout(() => loadUnread(), 600)
    return () => window.clearTimeout(timeout)
  }, [activeChannelId, loadUnread])

  useEffect(() => {
    const supabase = createClient()

    const scheduleUsersRefresh = () => {
      if (usersRefreshTimerRef.current) return
      usersRefreshTimerRef.current = window.setTimeout(() => {
        usersRefreshTimerRef.current = null
        loadUsers()
      }, 300)
    }

    const scheduleUnreadRefresh = () => {
      if (unreadRefreshTimerRef.current) return
      unreadRefreshTimerRef.current = window.setTimeout(() => {
        unreadRefreshTimerRef.current = null
        loadUnread()
      }, 250)
    }

    const activitySub = supabase
      .channel('channel-list-activity-events')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_activity_events',
      }, () => {
        scheduleUsersRefresh()
      })
      .subscribe()

    const messagesSub = supabase
      .channel('channel-list-message-events')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'channel_messages',
      }, () => {
        scheduleUnreadRefresh()
      })
      .subscribe()

    return () => {
      if (usersRefreshTimerRef.current) {
        window.clearTimeout(usersRefreshTimerRef.current)
        usersRefreshTimerRef.current = null
      }
      if (unreadRefreshTimerRef.current) {
        window.clearTimeout(unreadRefreshTimerRef.current)
        unreadRefreshTimerRef.current = null
      }
      supabase.removeChannel(activitySub)
      supabase.removeChannel(messagesSub)
    }
  }, [loadUsers, loadUnread])

  const handleCreate = async () => {
    if (!newName.trim() || creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim(), icon: newIcon }),
      })
      if (res.ok) {
        const channel = await res.json()
        setChannels((prev) => [{ ...channel, is_member: true, member_count: 1, can_manage: true }, ...prev])
        setNewName('')
        setNewDesc('')
        setNewIcon(CHANNEL_ICONS[0])
        setShowCreate(false)
        onSelectChannel(channel)
      }
    } finally {
      setCreating(false)
    }
  }

  const handleJoin = async (channel: ChannelEntry) => {
    await fetch(`/api/channels/${channel.id}/members`, { method: 'POST' })
    onSelectChannel(channel)
    loadChannels()
    loadUnread()
  }

  const handleSelectOrJoin = (channel: ChannelEntry) => {
    if (!channel.is_member) {
      handleJoin(channel)
      return
    }

    setChannelUnread((prev) => (prev[channel.id]
      ? { ...prev, [channel.id]: 0 }
      : prev))
    onSelectChannel(channel)
  }

  const handleOpenDm = async (targetUserId: string) => {
    if (openingDmUserId) return
    setOpeningDmUserId(targetUserId)

    try {
      const res = await fetch('/api/channels/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: targetUserId }),
      })
      if (!res.ok) return

      const channel = await res.json()
      if (!channel?.id) return

      setChannels((prev) => {
        const exists = prev.some((c) => c.id === channel.id)
        if (exists) return prev
        return [{ ...channel, is_member: true, member_count: channel.member_count || 2 }, ...prev]
      })

      onSelectChannel(channel)
    } finally {
      setOpeningDmUserId(null)
    }
  }

  const openEditChannel = (channel: ChannelEntry) => {
    setEditingChannelId(channel.id)
    setEditName(channel.name || '')
    setEditDesc(channel.description || '')
    setEditIcon(channel.icon || CHANNEL_ICONS[0])
  }

  const closeEditChannel = () => {
    setEditingChannelId(null)
    setEditName('')
    setEditDesc('')
    setEditIcon(CHANNEL_ICONS[0])
    setSavingEdit(false)
  }

  const handleSaveEditChannel = async () => {
    if (!editingChannelId || !editName.trim() || savingEdit) return
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/channels/${editingChannelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDesc.trim(),
          icon: editIcon,
        }),
      })

      if (!res.ok) return
      const updated = await res.json()

      setChannels((prev) => prev.map((channel) => channel.id === editingChannelId
        ? { ...channel, ...updated }
        : channel))

      if (activeChannelId === editingChannelId) {
        onSelectChannel(updated)
      }

      closeEditChannel()
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDeleteChannel = async (channel: ChannelEntry) => {
    if (deletingChannelId) return
    const confirmed = window.confirm(t.channels.deleteChannelConfirm.replace('{name}', channel.name))
    if (!confirmed) return

    setDeletingChannelId(channel.id)
    try {
      const res = await fetch(`/api/channels/${channel.id}`, { method: 'DELETE' })
      if (!res.ok) return

      setChannels((prev) => prev.filter((candidate) => candidate.id !== channel.id))
      setChannelUnread((prev) => {
        const next = { ...prev }
        delete next[channel.id]
        return next
      })
      if (editingChannelId === channel.id) closeEditChannel()
      if (activeChannelId === channel.id) onChannelDeleted?.(channel.id)
    } finally {
      setDeletingChannelId(null)
    }
  }

  const statusConfig: Record<ActivityStatus, { label: string; dotClass: string }> = {
    online: { label: t.channels.statusOnline, dotClass: 'bg-emerald-500' },
    idle: { label: t.channels.statusIdle, dotClass: 'bg-amber-500' },
    offline: { label: t.channels.statusOffline, dotClass: 'bg-zinc-400' },
  }

  const formatLastSeenText = (user: ChannelDirectoryUser): { text: string; tooltip: string | null } => {
    const cfg = statusConfig[user.status]
    if (user.status === 'online') return { text: cfg.label, tooltip: null }
    if (user.status !== 'offline') return { text: cfg.label, tooltip: null }
    if (!user.last_seen_at) return { text: cfg.label, tooltip: null }

    const lastSeenMs = Date.parse(user.last_seen_at)
    if (!Number.isFinite(lastSeenMs)) return { text: cfg.label, tooltip: null }
    if (Date.now() - lastSeenMs < OFFLINE_AFTER_MS) return { text: cfg.label, tooltip: null }

    const relative = formatRelativeTime(user.last_seen_at, locale)
    const exact = formatExactDateTime(user.last_seen_at, locale)
    if (!relative) return { text: cfg.label, tooltip: exact }

    return {
      text: t.channels.lastSeenAt.replace('{time}', relative),
      tooltip: exact ? t.channels.lastSeenExact.replace('{time}', exact) : null,
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 flex items-center justify-end border-b border-zinc-200/50">
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="p-1.5 hover:bg-zinc-200 rounded-lg transition-colors text-zinc-500"
          title={t.channels.createChannel}
        >
          <Plus size={16} />
        </button>
      </div>

      {showCreate && (
        <div className="p-3 border-b border-zinc-200/50 space-y-2" style={{ animation: 'message-in 0.2s ease-out' }}>
          <div className="flex items-center gap-2">
            <select
              value={newIcon}
              onChange={(e) => setNewIcon(e.target.value)}
              className="w-10 h-8 text-center bg-white border border-zinc-200 rounded-lg text-sm"
            >
              {CHANNEL_ICONS.map((iconValue) => <option key={iconValue} value={iconValue}>{iconValue}</option>)}
            </select>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t.channels.channelName}
              maxLength={50}
              className="flex-1 px-2 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder={t.channels.descriptionOptional}
            maxLength={200}
            className="w-full px-2 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || creating}
            className="w-full px-3 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-xs rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {creating ? t.channels.creating : t.channels.create}
          </button>
        </div>
      )}

      {editingChannelId && (
        <div className="p-3 border-b border-zinc-200/50 space-y-2 bg-white/60 backdrop-blur-sm" style={{ animation: 'message-in 0.2s ease-out' }}>
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{t.channels.editChannel}</p>
          <div className="flex items-center gap-2">
            <select
              value={editIcon}
              onChange={(e) => setEditIcon(e.target.value)}
              className="w-10 h-8 text-center bg-white border border-zinc-200 rounded-lg text-sm"
            >
              {CHANNEL_ICONS.map((iconValue) => <option key={iconValue} value={iconValue}>{iconValue}</option>)}
            </select>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={t.channels.channelName}
              maxLength={50}
              className="flex-1 px-2 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <input
            type="text"
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            placeholder={t.channels.descriptionOptional}
            maxLength={200}
            className="w-full px-2 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={closeEditChannel}
              className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            >
              {t.settings.cancel}
            </button>
            <button
              onClick={handleSaveEditChannel}
              disabled={!editName.trim() || savingEdit}
              className="px-3 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-xs rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {savingEdit ? t.channels.saving : t.channels.saveChanges}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        <div className="px-1.5 py-1">
          <p className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">{t.channels.usersSection}</p>
        </div>

        {directoryUsers.length === 0 && (
          <p className="text-[11px] text-zinc-400 text-center py-2">{t.channels.noUsers}</p>
        )}

        {directoryUsers.map((user) => {
          const cfg = statusConfig[user.status]
          const name = user.name || t.channels.user
          const isAdmin = (user.role || '').toLowerCase() === 'admin'
          const lastSeen = formatLastSeenText(user)

          return (
            <button
              key={user.id}
              onClick={() => handleOpenDm(user.id)}
              disabled={openingDmUserId === user.id}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all text-xs hover:bg-zinc-100 text-zinc-600 disabled:opacity-70"
              title={t.channels.startPrivateChat}
            >
              <div className={`relative w-6 h-6 shrink-0 ${isAdmin ? 'admin-crown-wrap' : ''}`}>
                <div className={`w-6 h-6 rounded-full bg-zinc-200 flex items-center justify-center text-[10px] font-semibold text-zinc-600 overflow-hidden ${isAdmin ? 'admin-crown-ring' : ''}`}>
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    name[0]?.toUpperCase() || 'U'
                  )}
                </div>
                {isAdmin && (
                  <span className="admin-crown-badge" aria-hidden="true">
                    <Crown size={8} strokeWidth={2.2} />
                  </span>
                )}
                <span className={`absolute right-0 bottom-0 w-2.5 h-2.5 rounded-full ring-[1.5px] ring-white ${cfg.dotClass}`} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-zinc-700">{name}</p>
                <p className="truncate text-[10px] text-zinc-400" title={lastSeen.tooltip || undefined}>{lastSeen.text}</p>
              </div>

              {openingDmUserId === user.id && (
                <span className="text-[10px] text-blue-500">{t.channels.openingPrivateChat}</span>
              )}
            </button>
          )
        })}

        <div className="px-1.5 pt-3 pb-1">
          <p className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">{t.channels.title}</p>
        </div>

        {channels.length === 0 && (
          <p className="text-xs text-zinc-400 text-center py-8">{t.channels.noChannels}</p>
        )}

        {channels.map((channel) => {
          const unread = channelUnread[channel.id] || 0
          const showActions = channel.can_manage && channel.is_member

          return (
            <div key={channel.id} className="w-full flex items-center gap-1 group">
              <button
                onClick={() => handleSelectOrJoin(channel)}
                className={`flex-1 flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all text-xs ${
                  activeChannelId === channel.id
                    ? 'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border border-blue-200/50'
                    : 'hover:bg-zinc-100 text-zinc-600'
                }`}
              >
                <span className="text-sm">{channel.icon}</span>
                <Hash size={12} className="text-zinc-400 shrink-0" />
                <span className="font-medium truncate flex-1">{channel.name}</span>
                <span className="text-[10px] text-zinc-400 flex items-center gap-0.5">
                  <Users size={10} /> {channel.member_count || 0}
                </span>

                {unread > 0 && (
                  <span className="ml-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-r from-red-500 to-pink-500 text-white text-[10px] font-bold shadow-sm shadow-red-200">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}

                {!channel.is_member && (
                  <span className="text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">{t.channels.join}</span>
                )}
              </button>

              {showActions && (
                <div
                  className={`flex items-center gap-0.5 transition-opacity ${
                    activeChannelId === channel.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openEditChannel(channel)}
                    className="p-1 rounded-md hover:bg-zinc-200 text-zinc-500"
                    title={t.channels.editChannel}
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteChannel(channel)}
                    disabled={deletingChannelId === channel.id}
                    className="p-1 rounded-md hover:bg-red-100 text-red-500 disabled:opacity-60"
                    title={t.channels.deleteChannel}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
