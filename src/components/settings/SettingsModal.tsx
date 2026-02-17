'use client'

import { useState, useEffect, useCallback } from 'react'
import { useUIStore } from '@/store/ui-store'
import { createClient } from '@/lib/supabase/client'
import { type ActivityVisibility, parseActivityPrivacy } from '@/lib/activity'
import { Profile, Memory, FileRecord, WebhookConfig } from '@/lib/types'
import { useDropzone } from 'react-dropzone'
import { sanitizeFilename, coerceMimeType } from '@/lib/file-utils'
import { X, User, MessageSquare, Palette, Save, Loader2, Brain, Plus, Trash2, ToggleLeft, ToggleRight, Upload, FileText, Image, Music, Video, BookOpen, RefreshCw, Eye, Search, FolderOpen, Mail, Lock, Bell, Zap, Globe, Radio, Moon, Sun } from 'lucide-react'
import { useTranslation } from '@/i18n/LanguageContext'

type Tab = 'profile' | 'activity' | 'instructions' | 'memory' | 'files' | 'appearance' | 'webhooks'

export default function SettingsModal({ userId }: { userId?: string }) {
  const { setSettingsOpen, openFilePreview, addToast } = useUIStore()
  const [tab, setTab] = useState<Tab>('profile')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [gender, setGender] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [activityShowStatus, setActivityShowStatus] = useState(true)
  const [activityShowLastSeen, setActivityShowLastSeen] = useState(true)
  const [activityVisibility, setActivityVisibility] = useState<ActivityVisibility>('everyone')
  const [instructionsEnabled, setInstructionsEnabled] = useState(false)
  const [instructionsWhat, setInstructionsWhat] = useState('')
  const [instructionsHow, setInstructionsHow] = useState('')
  const { theme, setTheme } = useUIStore()
  const { language, setLanguage, t } = useTranslation()

  // User email (from auth)
  const [userEmail, setUserEmail] = useState('')

  // Email/password state
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [emailMsg, setEmailMsg] = useState('')
  const [passwordMsg, setPasswordMsg] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)

  // Memory state
  const [memories, setMemories] = useState<Memory[]>([])
  const [newMemory, setNewMemory] = useState('')
  const [memoriesLoading, setMemoriesLoading] = useState(false)

  // Files state
  const [files, setFiles] = useState<FileRecord[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [ingesting, setIngesting] = useState<string | null>(null)
  const [fileFilter, setFileFilter] = useState('')

  // Webhooks state
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([])
  const [webhooksLoading, setWebhooksLoading] = useState(false)
  const [showWebhookForm, setShowWebhookForm] = useState(false)
  const [whName, setWhName] = useState(t.settings.newWebhook)
  const [whType, setWhType] = useState<'discord' | 'slack'>('discord')
  const [whUrl, setWhUrl] = useState('')
  const [whMinMsgs, setWhMinMsgs] = useState(10)
  const [whSaving, setWhSaving] = useState(false)
  const [whTesting, setWhTesting] = useState<string | null>(null)

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserEmail(user.email || '')
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (data) {
      setProfile(data)
      setName(data.name || user.email?.split('@')[0] || '')
      setBio(data.bio || '')
      setGender(data.gender || '')
      setBirthDate(data.birth_date || '')
      const privacy = parseActivityPrivacy(data.settings_json)
      setActivityShowStatus(privacy.showStatus)
      setActivityShowLastSeen(privacy.showLastSeen)
      setActivityVisibility(privacy.visibility)
      setInstructionsEnabled(data.custom_instructions_enabled)
      setInstructionsWhat(data.custom_instructions_what || '')
      setInstructionsHow(data.custom_instructions_how || '')
    }
    setLoading(false)
  }

  const handleSave = async () => {
    if (!profile) return
    setSaving(true)
    const supabase = createClient()
    const currentSettings = profile.settings_json && typeof profile.settings_json === 'object'
      ? profile.settings_json as Record<string, unknown>
      : {}
    const nextSettings = {
      ...currentSettings,
      activity_privacy: {
        show_status: activityShowStatus,
        show_last_seen: activityShowLastSeen,
        visibility: activityVisibility,
      },
    }

    await supabase.from('profiles').update({
      name, custom_instructions_enabled: instructionsEnabled,
      bio: bio.trim() || null,
      gender: gender || null,
      birth_date: birthDate || null,
      settings_json: nextSettings,
      custom_instructions_what: instructionsWhat,
      custom_instructions_how: instructionsHow,
    }).eq('id', profile.id)
    setProfile({ ...profile, settings_json: nextSettings })
    setSaving(false)
  }

  const computeAge = (dateValue: string): number | null => {
    if (!dateValue) return null
    const parsed = Date.parse(dateValue)
    if (!Number.isFinite(parsed)) return null
    const birth = new Date(parsed)
    const now = new Date()
    let age = now.getFullYear() - birth.getFullYear()
    const monthDiff = now.getMonth() - birth.getMonth()
    const dayDiff = now.getDate() - birth.getDate()
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age--
    return age >= 0 ? age : null
  }
  const birthAge = computeAge(birthDate)

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !profile) return
    const supabase = createClient()
    const path = `${profile.id}/avatar_${Date.now()}.${file.name.split('.').pop()}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (!error) {
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      await supabase.from('profiles').update({ avatar_url: urlData.publicUrl }).eq('id', profile.id)
      setProfile({ ...profile, avatar_url: urlData.publicUrl })
    }
  }

  // ---- Email/Password functions ----
  const handleChangeEmail = async () => {
    if (!newEmail.trim()) return
    setEmailSaving(true); setEmailMsg('')
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ email: newEmail })
      if (error) setEmailMsg(`${t.settings.errorChangeEmail}: ${error.message}`)
      else setEmailMsg(t.settings.emailConfirmSent)
      setNewEmail('')
    } catch { setEmailMsg(t.settings.errorChangeEmail) }
    setEmailSaving(false)
  }

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) return
    if (newPassword !== confirmPassword) { setPasswordMsg(t.settings.passwordsNoMatch); return }
    if (newPassword.length < 6) { setPasswordMsg(t.settings.passwordMinChars); return }
    setPasswordSaving(true); setPasswordMsg('')
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) setPasswordMsg(`${t.settings.errorChangePassword}: ${error.message}`)
      else setPasswordMsg(t.settings.passwordUpdated)
      setNewPassword(''); setConfirmPassword('')
    } catch { setPasswordMsg(t.settings.errorChangePassword) }
    setPasswordSaving(false)
  }

  // ---- Memory functions ----
  const loadMemories = async () => {
    if (!userId) return
    setMemoriesLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from('memories').select('*')
      .eq('user_id', userId).eq('scope', 'user').order('created_at', { ascending: false })
    if (data) setMemories(data)
    setMemoriesLoading(false)
  }

  const addMemory = async () => {
    if (!newMemory.trim() || !userId) return
    const supabase = createClient()
    const { data } = await supabase.from('memories').insert({
      user_id: userId, content: newMemory.trim(), scope: 'user',
    }).select().single()
    if (data) { setMemories([data, ...memories]); setNewMemory('') }
  }

  const toggleMemory = async (id: string, enabled: boolean) => {
    const supabase = createClient()
    await supabase.from('memories').update({ enabled: !enabled }).eq('id', id)
    setMemories(memories.map(m => m.id === id ? { ...m, enabled: !enabled } : m))
  }

  const deleteMemory = async (id: string) => {
    const supabase = createClient()
    await supabase.from('memories').delete().eq('id', id)
    setMemories(memories.filter(m => m.id !== id))
  }

  // ---- File functions ----
  const loadFiles = async () => {
    setFilesLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from('files').select('*').is('project_id', null).order('created_at', { ascending: false })
    if (data) setFiles(data)
    setFilesLoading(false)
  }

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setUploading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }
    for (const file of acceptedFiles) {
      const safeName = sanitizeFilename(file.name)
      const mime = coerceMimeType(file.type, safeName)
      const path = `${user.id}/${Date.now()}_${safeName}`
      const { error } = await supabase.storage.from('user-files').upload(path, file, { contentType: mime })
      if (!error) {
        const { data: fileRec } = await supabase.from('files').insert({
          user_id: user.id, storage_path: path, filename: safeName, mime, size: file.size,
        }).select().single()
        if (fileRec) setFiles(prev => [fileRec, ...prev])
      } else {
        addToast({ type: 'error', message: `Error al subir "${file.name}": ${error.message}` })
      }
    }
    setUploading(false)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop })

  const handleIngest = async (fileId: string) => {
    setIngesting(fileId)
    try {
      const res = await fetch('/api/files/ingest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_id: fileId }) })
      const data = await res.json()
      if (data.success) setFiles(prev => prev.map(f => f.id === fileId ? { ...f, ingest_status: 'done' as const } : f))
      else setFiles(prev => prev.map(f => f.id === fileId ? { ...f, ingest_status: 'failed' as const } : f))
    } catch { setFiles(prev => prev.map(f => f.id === fileId ? { ...f, ingest_status: 'failed' as const } : f)) }
    setIngesting(null)
  }

  const handleDeleteFile = async (fileId: string) => {
    const supabase = createClient()
    const file = files.find(f => f.id === fileId)
    if (file) {
      await supabase.storage.from('user-files').remove([file.storage_path])
      await supabase.from('file_chunks').delete().eq('file_id', fileId)
      await supabase.from('files').delete().eq('id', fileId)
      setFiles(prev => prev.filter(f => f.id !== fileId))
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFileIcon = (mime: string | null) => {
    if (mime?.startsWith('image/')) return <Image size={14} className="text-blue-500" />
    if (mime?.startsWith('audio/')) return <Music size={14} className="text-purple-500" />
    if (mime?.startsWith('video/')) return <Video size={14} className="text-emerald-500" />
    return <FileText size={14} className="text-zinc-400" />
  }

  const filteredFiles = files.filter(f => f.filename.toLowerCase().includes(fileFilter.toLowerCase()))

  // Webhook functions
  const loadWebhooks = async () => {
    setWebhooksLoading(true)
    try {
      const res = await fetch('/api/webhooks')
      if (res.ok) setWebhooks(await res.json())
    } finally { setWebhooksLoading(false) }
  }

  const createWebhook = async () => {
    if (!whUrl.trim()) return
    setWhSaving(true)
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: whName, webhook_type: whType, webhook_url: whUrl, min_messages: whMinMsgs }),
      })
      if (res.ok) {
        const wh = await res.json()
        setWebhooks(prev => [wh, ...prev])
        setShowWebhookForm(false); setWhName(t.settings.newWebhook); setWhUrl(''); setWhMinMsgs(10)
      }
    } finally { setWhSaving(false) }
  }

  const toggleWebhook = async (wh: WebhookConfig) => {
    await fetch('/api/webhooks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: wh.id, enabled: !wh.enabled }) })
    setWebhooks(prev => prev.map(w => w.id === wh.id ? { ...w, enabled: !w.enabled } : w))
  }

  const deleteWebhook = async (id: string) => {
    await fetch('/api/webhooks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }) })
    setWebhooks(prev => prev.filter(w => w.id !== id))
  }

  const testWebhook = async (id: string) => {
    setWhTesting(id)
    try {
      const res = await fetch('/api/webhooks/test', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }) })
      if (!res.ok) { const d = await res.json(); alert(`${t.settings.networkError}: ${d.error}`) }
      else alert(t.settings.webhookSentOk)
    } catch { alert(t.settings.networkError) }
    finally { setWhTesting(null) }
  }

  // Load memory/files/webhooks when switching to those tabs
  useEffect(() => {
    if (tab === 'memory' && memories.length === 0) loadMemories()
    if (tab === 'files' && files.length === 0) loadFiles()
    if (tab === 'webhooks' && webhooks.length === 0) loadWebhooks()
  }, [tab])

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: t.settings.tabs.profile, icon: <User size={14} /> },
    { id: 'activity', label: t.settings.tabs.activity, icon: <Radio size={14} /> },
    { id: 'instructions', label: t.settings.tabs.instructions, icon: <MessageSquare size={14} /> },
    { id: 'memory', label: t.settings.tabs.memory, icon: <Brain size={14} /> },
    { id: 'files', label: t.settings.tabs.files, icon: <FolderOpen size={14} /> },
    { id: 'webhooks', label: t.settings.tabs.webhooks, icon: <Bell size={14} /> },
    { id: 'appearance', label: t.settings.tabs.appearance, icon: <Palette size={14} /> },
  ]

  const spainFlagStyle = {
    background: 'linear-gradient(to bottom, #c8102e 0%, #c8102e 25%, #f6d65a 25%, #f6d65a 75%, #c8102e 75%, #c8102e 100%)',
  } as const
  const cataloniaFlagStyle = {
    background: 'repeating-linear-gradient(to bottom, #f6d65a 0%, #f6d65a 14%, #c62828 14%, #c62828 28%)',
  } as const

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-3" onClick={() => setSettingsOpen(false)}>
      <div className="w-full max-w-2xl bg-white border border-zinc-200 rounded-xl shadow-xl max-h-[calc(100dvh-24px)] md:max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
          <h2 className="text-sm font-semibold text-zinc-800">{t.settings.title}</h2>
          <button onClick={() => setSettingsOpen(false)} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400"><X size={16} /></button>
        </div>

        <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
          {/* Tabs sidebar */}
          <div className="w-full md:w-40 border-r-0 md:border-r border-b md:border-b-0 border-zinc-200 p-2 flex md:block gap-1 md:gap-0 overflow-x-auto md:overflow-visible">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`w-auto md:w-full flex-shrink-0 text-left px-3 py-2 text-xs rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap ${tab === t.id ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:bg-zinc-50'}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-zinc-400" size={24} /></div> : (
              <>
                {tab === 'profile' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center overflow-hidden border border-zinc-200">
                          {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : <User size={24} className="text-zinc-400" />}
                        </div>
                        <label className="absolute -bottom-1 -right-1 bg-blue-600 rounded-full p-1 cursor-pointer hover:bg-blue-500 text-white">
                          <Palette size={10} />
                          <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                        </label>
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-zinc-500 block mb-1">{t.settings.name}</label>
                        <input value={name} onChange={e => setName(e.target.value)} placeholder={userEmail.split('@')[0] || t.settings.namePlaceholder} className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-800 w-64 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        {userEmail && <p className="text-[11px] text-zinc-400 mt-1">{userEmail}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div>
                        <label className="text-xs text-zinc-500 block mb-1">{t.settings.role}</label>
                        <span className={`px-2 py-0.5 rounded text-xs ${profile?.role === 'admin' ? 'bg-purple-50 text-purple-600' : 'bg-zinc-100 text-zinc-500'}`}>{profile?.role === 'admin' ? t.settings.admin : t.settings.userRole}</span>
                      </div>
                    </div>

                    <div className="space-y-3 pt-3 border-t border-zinc-200">
                      <div>
                        <label className="text-xs text-zinc-500 block mb-1">{t.settings.bio}</label>
                        <textarea
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          maxLength={300}
                          rows={3}
                          placeholder={t.settings.bioPlaceholder}
                          className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-800 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-zinc-500 block mb-1">{t.settings.gender}</label>
                          <select
                            value={gender}
                            onChange={(e) => setGender(e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">{t.settings.genderNone}</option>
                            <option value={t.settings.genderMale}>{t.settings.genderMale}</option>
                            <option value={t.settings.genderFemale}>{t.settings.genderFemale}</option>
                            <option value={t.settings.genderNonBinary}>{t.settings.genderNonBinary}</option>
                            <option value={t.settings.genderOther}>{t.settings.genderOther}</option>
                            <option value={t.settings.genderPreferNotSay}>{t.settings.genderPreferNotSay}</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-zinc-500 block mb-1">{t.settings.birthDate}</label>
                          <input
                            type="date"
                            value={birthDate}
                            onChange={(e) => setBirthDate(e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <p className="mt-1 text-[11px] text-zinc-500">
                            {t.settings.age}: {birthAge !== null ? `${birthAge} anos` : t.settings.noData}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Change email */}
                    <div className="pt-3 border-t border-zinc-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Mail size={14} className="text-zinc-500" />
                        <label className="text-xs font-medium text-zinc-700">{t.settings.changeEmail}</label>
                      </div>
                      <div className="flex gap-2">
                        <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder={t.settings.emailPlaceholder} type="email"
                          className="flex-1 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <button onClick={handleChangeEmail} disabled={emailSaving || !newEmail.trim()}
                          className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm text-white">
                          {emailSaving ? <Loader2 size={14} className="animate-spin" /> : t.settings.change}
                        </button>
                      </div>
                      {emailMsg && <p className={`text-xs mt-1.5 ${emailMsg.startsWith(t.settings.errorChangeEmail) ? 'text-red-500' : 'text-green-600'}`}>{emailMsg}</p>}
                    </div>

                    {/* Change password */}
                    <div className="pt-3 border-t border-zinc-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Lock size={14} className="text-zinc-500" />
                        <label className="text-xs font-medium text-zinc-700">{t.settings.changePassword}</label>
                      </div>
                      <div className="space-y-2">
                        <input value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={t.settings.newPassword} type="password"
                          className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <input value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder={t.settings.confirmPassword} type="password"
                          className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <button onClick={handleChangePassword} disabled={passwordSaving || !newPassword || !confirmPassword}
                          className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm text-white">
                          {passwordSaving ? <Loader2 size={14} className="animate-spin" /> : t.settings.updatePassword}
                        </button>
                      </div>
                      {passwordMsg && <p className={`text-xs mt-1.5 ${passwordMsg.startsWith(t.settings.errorChangePassword) || passwordMsg === t.settings.passwordsNoMatch || passwordMsg === t.settings.passwordMinChars ? 'text-red-500' : 'text-green-600'}`}>{passwordMsg}</p>}
                    </div>
                  </div>
                )}

                {tab === 'activity' && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-zinc-800">{t.settings.activityPrivacyTitle}</p>
                      <p className="text-xs text-zinc-500 mt-1">{t.settings.activityPrivacyDesc}</p>
                    </div>

                    <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5">
                      <div>
                        <p className="text-xs font-medium text-zinc-700">{t.settings.showActivityStatus}</p>
                        <p className="text-[11px] text-zinc-500">{t.settings.showActivityStatusDesc}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActivityShowStatus((prev) => !prev)}
                        className={`text-sm font-semibold px-2.5 py-1 rounded-md transition-colors ${
                          activityShowStatus ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-200 text-zinc-600'
                        }`}
                      >
                        {activityShowStatus ? t.settings.enabled : t.settings.disabled}
                      </button>
                    </label>

                    <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5">
                      <div>
                        <p className="text-xs font-medium text-zinc-700">{t.settings.showLastSeen}</p>
                        <p className="text-[11px] text-zinc-500">{t.settings.showLastSeenDesc}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActivityShowLastSeen((prev) => !prev)}
                        className={`text-sm font-semibold px-2.5 py-1 rounded-md transition-colors ${
                          activityShowLastSeen ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-200 text-zinc-600'
                        }`}
                      >
                        {activityShowLastSeen ? t.settings.enabled : t.settings.disabled}
                      </button>
                    </label>

                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">{t.settings.activityVisibility}</label>
                      <select
                        value={activityVisibility}
                        onChange={(e) => setActivityVisibility(e.target.value as ActivityVisibility)}
                        className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="everyone">{t.settings.activityVisibilityEveryone}</option>
                        <option value="shared">{t.settings.activityVisibilityShared}</option>
                        <option value="nobody">{t.settings.activityVisibilityNobody}</option>
                      </select>
                    </div>
                  </div>
                )}

                {tab === 'instructions' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-zinc-800">{t.settings.customInstructions}</p>
                      <button onClick={() => setInstructionsEnabled(!instructionsEnabled)}
                        className={`px-3 py-1 text-xs rounded-full ${instructionsEnabled ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-500'}`}>
                        {instructionsEnabled ? t.settings.enabled : t.settings.disabled}
                      </button>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">{t.settings.whatToKnow}</label>
                      <textarea value={instructionsWhat} onChange={e => setInstructionsWhat(e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-800 min-h-[100px] resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder={t.settings.whatToKnowPlaceholder} />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">{t.settings.howToRespond}</label>
                      <textarea value={instructionsHow} onChange={e => setInstructionsHow(e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-800 min-h-[100px] resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder={t.settings.howToRespondPlaceholder} />
                    </div>
                  </div>
                )}

                {tab === 'memory' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Brain size={16} className="text-purple-500" />
                      <p className="text-sm font-medium text-zinc-800">{t.settings.whatIKnow}</p>
                    </div>
                    <p className="text-xs text-zinc-500">{t.settings.memoryDesc}</p>
                    <div className="flex gap-2">
                      <input value={newMemory} onChange={e => setNewMemory(e.target.value)} placeholder={t.settings.addMemory}
                        onKeyDown={e => { if (e.key === 'Enter') addMemory() }}
                        className="flex-1 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <button onClick={addMemory} className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm text-white"><Plus size={14} /></button>
                    </div>
                    <div className="max-h-[40vh] overflow-y-auto space-y-2">
                      {memoriesLoading && <p className="text-sm text-zinc-400 text-center py-4">{t.settings.loading}</p>}
                      {!memoriesLoading && memories.length === 0 && <p className="text-sm text-zinc-400 text-center py-4">{t.settings.noMemories}</p>}
                      {memories.map(m => (
                        <div key={m.id} className={`flex items-start gap-2 p-3 rounded-lg border ${m.enabled ? 'border-zinc-200 bg-zinc-50' : 'border-zinc-100 bg-white opacity-60'}`}>
                          <p className="flex-1 text-sm text-zinc-700">{m.content}</p>
                          <button onClick={() => toggleMemory(m.id, m.enabled)} className="shrink-0 text-zinc-400 hover:text-zinc-700" title={m.enabled ? t.settings.disable : t.settings.enable}>
                            {m.enabled ? <ToggleRight size={18} className="text-blue-500" /> : <ToggleLeft size={18} />}
                          </button>
                          <button onClick={() => deleteMemory(m.id)} className="shrink-0 text-zinc-400 hover:text-red-500" title={t.settings.deleteLabel}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {tab === 'files' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <FolderOpen size={16} className="text-blue-500" />
                      <p className="text-sm font-medium text-zinc-800">{t.settings.filesTitle}</p>
                      <button onClick={loadFiles} className="ml-auto p-1 hover:bg-zinc-100 rounded text-zinc-400" title={t.settings.reload}><RefreshCw size={13} /></button>
                    </div>
                    {/* Drop zone */}
                    <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-zinc-300 hover:border-zinc-400'}`}>
                      <input {...getInputProps()} />
                      {uploading ? (
                        <div className="flex items-center justify-center gap-2 text-sm text-zinc-500"><Loader2 size={16} className="animate-spin" /> {t.settings.uploading}</div>
                      ) : (
                        <div className="flex items-center justify-center gap-2 text-sm text-zinc-500"><Upload size={16} /> {isDragActive ? t.settings.dropHere : t.settings.dragOrClick}</div>
                      )}
                    </div>
                    {/* Filter */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg">
                      <Search size={14} className="text-zinc-400" />
                      <input value={fileFilter} onChange={e => setFileFilter(e.target.value)} placeholder={t.settings.filterFiles}
                        className="flex-1 bg-transparent text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none" />
                    </div>
                    {/* File list */}
                    <div className="max-h-[35vh] overflow-y-auto space-y-1">
                      {filesLoading && <div className="flex justify-center py-6"><Loader2 className="animate-spin text-zinc-400" size={20} /></div>}
                      {!filesLoading && filteredFiles.length === 0 && <p className="text-xs text-zinc-400 text-center py-6">{t.settings.noFiles}</p>}
                      {filteredFiles.map(f => (
                        <div key={f.id} className="group flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-50 rounded-lg transition-colors">
                          {getFileIcon(f.mime)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate text-zinc-700">{f.filename}</p>
                            <p className="text-[10px] text-zinc-400">{formatSize(f.size)} - {new Date(f.created_at).toLocaleDateString('es-ES')}</p>
                          </div>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${f.ingest_status === 'done' ? 'bg-green-50 text-green-600' : f.ingest_status === 'failed' ? 'bg-red-50 text-red-600' : f.ingest_status === 'processing' ? 'bg-yellow-50 text-yellow-600' : 'bg-zinc-100 text-zinc-500'}`}>
                            {f.ingest_status === 'none' ? '--' : f.ingest_status}
                          </span>
                          <div className="flex gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openFilePreview(f.id)} className="p-2 md:p-1 hover:bg-zinc-200 rounded text-zinc-400" title={t.settings.preview}><Eye size={13} /></button>
                            {f.ingest_status !== 'done' && (
                              <button onClick={() => handleIngest(f.id)} disabled={ingesting === f.id}
                                className="p-2 md:p-1 hover:bg-zinc-200 rounded text-emerald-500" title={t.settings.ingestRag}>
                                {ingesting === f.id ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />}
                              </button>
                            )}
                            {f.ingest_status === 'done' && (
                              <button onClick={() => handleIngest(f.id)} className="p-2 md:p-1 hover:bg-zinc-200 rounded text-yellow-500" title={t.settings.reingest}><RefreshCw size={13} /></button>
                            )}
                            <button onClick={() => handleDeleteFile(f.id)} className="p-2 md:p-1 hover:bg-zinc-200 rounded text-red-500" title={t.settings.deleteLabel}><Trash2 size={13} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {tab === 'webhooks' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-zinc-800">{t.settings.webhooksTitle}</p>
                        <p className="text-xs text-zinc-400">{t.settings.webhooksDesc}</p>
                      </div>
                      <button onClick={() => setShowWebhookForm(!showWebhookForm)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-500">
                        <Plus size={12} /> {t.settings.newWebhook}
                      </button>
                    </div>

                    {showWebhookForm && (
                      <div className="border border-zinc-200 rounded-xl p-3 space-y-2" style={{ animation: 'message-in 0.2s ease-out' }}>
                        <input value={whName} onChange={e => setWhName(e.target.value)} placeholder={t.settings.webhookName}
                          className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <div className="flex gap-2">
                          <select value={whType} onChange={e => setWhType(e.target.value as 'discord' | 'slack')}
                            className="px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white">
                            <option value="discord">Discord</option>
                            <option value="slack">Slack</option>
                          </select>
                          <input type="number" value={whMinMsgs} onChange={e => setWhMinMsgs(Number(e.target.value))} min={2} max={100}
                            className="w-24 px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" title={t.settings.minMessages} />
                        </div>
                        <input value={whUrl} onChange={e => setWhUrl(e.target.value)}
                          placeholder={whType === 'discord' ? 'https://discord.com/api/webhooks/...' : 'https://hooks.slack.com/services/...'}
                          className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <p className="text-[10px] text-zinc-400">{t.settings.webhookNotifDesc.replace('{count}', String(whMinMsgs))}</p>
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setShowWebhookForm(false)} className="px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 rounded-lg">{t.settings.cancel}</button>
                          <button onClick={createWebhook} disabled={!whUrl.trim() || whSaving}
                            className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-500 disabled:opacity-50">
                            {whSaving ? t.settings.savingWebhook : t.settings.createWebhook}
                          </button>
                        </div>
                      </div>
                    )}

                    {webhooksLoading ? (
                      <div className="flex justify-center py-6"><Loader2 className="animate-spin text-zinc-400" size={20} /></div>
                    ) : webhooks.length === 0 ? (
                      <div className="text-center py-8">
                        <Bell size={32} className="mx-auto text-zinc-300 mb-2" />
                        <p className="text-xs text-zinc-400">{t.settings.noWebhooks}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {webhooks.map(wh => (
                          <div key={wh.id} className="flex items-center gap-3 p-3 border border-zinc-200 rounded-xl group hover:bg-zinc-50 transition-colors">
                            <span className={`w-2.5 h-2.5 rounded-full ${wh.webhook_type === 'discord' ? 'bg-indigo-500' : 'bg-emerald-500'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-zinc-800 truncate">{wh.name}</p>
                              <p className="text-[10px] text-zinc-400 truncate">{wh.webhook_url}</p>
                              <p className="text-[10px] text-zinc-400">{t.settings.minMessages} {wh.min_messages} · {wh.webhook_type}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => toggleWebhook(wh)} className="p-1 hover:bg-zinc-200 rounded" title={wh.enabled ? t.settings.disable : t.settings.enable}>
                                {wh.enabled ? <ToggleRight size={18} className="text-emerald-500" /> : <ToggleLeft size={18} className="text-zinc-300" />}
                              </button>
                              <button onClick={() => testWebhook(wh.id)} disabled={whTesting === wh.id}
                                className="p-1 hover:bg-zinc-200 rounded text-blue-500" title={t.settings.testWebhook}>
                                {whTesting === wh.id ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                              </button>
                              <button onClick={() => deleteWebhook(wh.id)} className="p-1 hover:bg-red-50 rounded text-zinc-400 hover:text-red-500" title={t.settings.deleteLabel}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {tab === 'appearance' && (
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-zinc-800">{t.settings.theme}</p>
                      <div className="flex gap-3">
                        <button onClick={() => setTheme('dark')} className={`px-4 py-3 rounded-xl border text-sm inline-flex items-center gap-2 ${theme === 'dark' ? 'border-blue-500 bg-blue-50' : 'border-zinc-200 hover:bg-zinc-50'}`}>
                          <Moon size={14} /> {t.settings.dark}
                        </button>
                        <button onClick={() => setTheme('light')} className={`px-4 py-3 rounded-xl border text-sm inline-flex items-center gap-2 ${theme === 'light' ? 'border-blue-500 bg-blue-50' : 'border-zinc-200 hover:bg-zinc-50'}`}>
                          <Sun size={14} /> {t.settings.light}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Globe size={14} className="text-zinc-500" />
                        <p className="text-sm font-medium text-zinc-800">{t.settings.language}</p>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={() => setLanguage('es')} className={`px-4 py-3 rounded-xl border text-sm inline-flex items-center gap-2 ${language === 'es' ? 'border-blue-500 bg-blue-50' : 'border-zinc-200 hover:bg-zinc-50'}`}>
                          <span className="w-5 h-3 rounded-[3px] border border-zinc-200/90" style={spainFlagStyle} />
                          {t.settings.langEs}
                        </button>
                        <button onClick={() => setLanguage('ca')} className={`px-4 py-3 rounded-xl border text-sm inline-flex items-center gap-2 ${language === 'ca' ? 'border-blue-500 bg-blue-50' : 'border-zinc-200 hover:bg-zinc-50'}`}>
                          <span className="w-5 h-3 rounded-[3px] border border-zinc-200/90" style={cataloniaFlagStyle} />
                          {t.settings.langCa}
                        </button>
                      </div>
                    </div>
                  </div>
                )}


              </>
            )}
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end px-4 py-3 border-t border-zinc-200">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm text-white transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {t.settings.save}
          </button>
        </div>
      </div>
    </div>
  )
}

