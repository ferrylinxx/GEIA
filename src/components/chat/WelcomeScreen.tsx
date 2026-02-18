'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useChatStore } from '@/store/chat-store'
import { useUIStore } from '@/store/ui-store'
import { createClient } from '@/lib/supabase/client'
import { FileAttachment } from '@/lib/types'
import { trackEvent } from '@/lib/analytics'
import { Code2, PenLine, BarChart3, Lightbulb, FileText, Globe, Send, Loader2, Database, HardDrive, Plus, X, Cpu, Crown, Paperclip, ImagePlus, FlaskConical, FileImage, Check, FolderOpen } from 'lucide-react'
import Image from 'next/image'
import { useTranslation } from '@/i18n/LanguageContext'
import ChatInput from '@/components/chat/ChatInput'
import { coerceMimeType, sanitizeFilename } from '@/lib/file-utils'
import { AUTO_RAG_INGEST_ON_UPLOAD } from '@/lib/rag-ingest-config'
import { useProjectContext } from '@/hooks/useProjectContext'
import { useActivity } from '@/contexts/ActivityContext'
import { type ActivityStatus } from '@/lib/activity'

interface PendingAttachment extends FileAttachment {
  local_preview_url?: string
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const SUGGESTION_META = [
  { icon: Code2, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  { icon: PenLine, color: 'text-blue-500', bg: 'bg-blue-50' },
  { icon: BarChart3, color: 'text-amber-500', bg: 'bg-amber-50' },
  { icon: Lightbulb, color: 'text-violet-500', bg: 'bg-violet-50' },
  { icon: FileText, color: 'text-rose-500', bg: 'bg-rose-50' },
  { icon: Globe, color: 'text-cyan-500', bg: 'bg-cyan-50' },
] as const

export default function WelcomeScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { addToast } = useUIStore()
  const { projectId: contextProjectId, projectName: contextProjectName } = useProjectContext()
  const {
    projectContextId,
    createConversation,
    setIsStreaming,
    setStreamingConversationId,
    setStreamingContent,
    setStreamAbortController,
    addMessage,
    loadMessages,
    loadConversations,
    selectedModel,
    ragMode,
    citeMode,
    webSearch,
    setWebSearch,
    dbQuery,
    setDbQuery,
    networkDriveRag,
    setNetworkDriveRag,
    imageGeneration,
    setImageGeneration,
    deepResearch,
    setDeepResearch,
    researchMode,
    setResearchMode,
    documentGeneration,
    setDocumentGeneration,
    spreadsheetAnalysis,
    setSpreadsheetAnalysis,
  } = useChatStore()

  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [leavingToChat, setLeavingToChat] = useState(false)
  const [typedText, setTypedText] = useState('')
  const [userName, setUserName] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<'admin' | 'user'>('user')
  const [activityStatus, setActivityStatus] = useState<ActivityStatus>('offline')
  const [toolPermissions, setToolPermissions] = useState({
    webSearch: true,
    dbQuery: true,
    networkDriveRag: true,
    imageGeneration: true,
    deepResearch: true,
    documentGeneration: true,
    spreadsheetAnalysis: true,
    codeInterpreter: true,
  })
  const mountedRef = useRef(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const toolsMenuRef = useRef<HTMLDivElement>(null)
  const attachmentsRef = useRef<PendingAttachment[]>([])
  const phraseIndexRef = useRef(0)

  const suggestionTexts = t.welcome.suggestions
  const typewriterPhrases = t.welcome.phrases

  const greeting = (() => {
    const h = new Date().getHours()
    if (h >= 6 && h < 13) return t.welcome.goodMorning
    if (h >= 13 && h < 20) return t.welcome.goodAfternoon
    return t.welcome.goodEvening
  })()

  const statusConfig: Record<ActivityStatus, { label: string; dotClass: string; waveRgb: string }> = {
    online: { label: t.welcome.activityOnline, dotClass: 'bg-emerald-500', waveRgb: '16 185 129' },
    typing: { label: 'Escribiendo', dotClass: 'bg-blue-500', waveRgb: '59 130 246' },
    read: { label: 'Leyendo', dotClass: 'bg-purple-500', waveRgb: '168 85 247' },
    offline: { label: t.welcome.activityOffline, dotClass: 'bg-zinc-400', waveRgb: '161 161 170' },
  }
  const activityCfg = statusConfig[activityStatus]
  const isAdminUser = userRole === 'admin'

  const revokeAttachmentPreviews = useCallback((items: PendingAttachment[]) => {
    for (const item of items) {
      if (item.local_preview_url) URL.revokeObjectURL(item.local_preview_url)
    }
  }, [])

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      revokeAttachmentPreviews(attachmentsRef.current)
    }
  }, [revokeAttachmentPreviews])

  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data } = await supabase.from('profiles').select('name, avatar_url, role').eq('id', user.id).single()
      if (data?.name) {
        setUserName(data.name)
      } else {
        setUserName(user.email?.split('@')[0] || null)
      }
      if (data?.avatar_url) setAvatarUrl(data.avatar_url)
      if (typeof data?.role === 'string') {
        const normalizedRole = data.role.toLowerCase()
        if (normalizedRole === 'admin' || normalizedRole === 'user') setUserRole(normalizedRole)
      }
    }
    fetchUser()
  }, [])

  // Use shared activity context instead of individual fetching
  const { getStatus } = useActivity()

  useEffect(() => {
    if (!userId) return
    const statusData = getStatus(userId)
    setActivityStatus(statusData.status)
  }, [userId, getStatus])

  const runTypewriter = useCallback(() => {
    let charIdx = 0
    let deleting = false
    let pauseTimer: ReturnType<typeof setTimeout> | null = null
    const safePhrases = typewriterPhrases.length > 0 ? typewriterPhrases : [t.welcome.messagePlaceholder]

    const phrase = () => safePhrases[phraseIndexRef.current % safePhrases.length]

    const tick = () => {
      if (!deleting) {
        charIdx++
        setTypedText(phrase().slice(0, charIdx))
        if (charIdx >= phrase().length) {
          pauseTimer = setTimeout(() => { deleting = true; tick() }, 2200)
          return
        }
        pauseTimer = setTimeout(tick, 55 + Math.random() * 30)
      } else {
        charIdx--
        setTypedText(phrase().slice(0, charIdx))
        if (charIdx <= 0) {
          deleting = false
          phraseIndexRef.current = (phraseIndexRef.current + 1) % safePhrases.length
          pauseTimer = setTimeout(tick, 400)
          return
        }
        pauseTimer = setTimeout(tick, 25)
      }
    }

    tick()
    return () => { if (pauseTimer) clearTimeout(pauseTimer) }
  }, [typewriterPhrases, t.welcome.messagePlaceholder])

  useEffect(() => {
    phraseIndexRef.current = 0
    return runTypewriter()
  }, [runTypewriter])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) setToolsOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Load tool permissions on mount
  useEffect(() => {
    const loadToolPermissions = async () => {
      try {
        const res = await fetch('/api/tools/permissions')
        if (res.ok) {
          const data = await res.json()
          setToolPermissions(data.tools)
        }
      } catch (error) {
        console.error('Error loading tool permissions:', error)
      }
    }
    void loadToolPermissions()
  }, [])

  const activeToolsCount = [webSearch, dbQuery, networkDriveRag, imageGeneration, deepResearch, documentGeneration, spreadsheetAnalysis].filter(Boolean).length
  const welcomeInputPlaceholder = contextProjectName
    ? `${t.chatInput.projectPlaceholderPrefix} ${contextProjectName}...`
    : t.welcome.messagePlaceholder

  const handleSend = async (text?: string) => {
    const message = (typeof text === 'string' ? text : input).trim()
    if ((!message && attachments.length === 0) || sending || uploading) return
    setSending(true)

    let autoWebSearch = webSearch
    let autoImageGen = imageGeneration
    let autoDbQuery = dbQuery
    let autoNetworkRag = networkDriveRag
    let autoDeepResearch = deepResearch
    let autoDocumentGeneration = documentGeneration
    let autoSpreadsheetAnalysis = spreadsheetAnalysis

    const lowerMsg = message.toLowerCase()

    if (!autoWebSearch && (
      lowerMsg.includes('busca en la web') || lowerMsg.includes('buscar en internet') ||
      lowerMsg.includes('busca en internet') || lowerMsg.includes('busqueda web') ||
      lowerMsg.includes('search the web') || lowerMsg.includes('search online') ||
      lowerMsg.includes('busca online') || lowerMsg.includes('investiga en la web') ||
      lowerMsg.includes('investiga en internet')
    )) autoWebSearch = true

    if (!autoImageGen && (
      lowerMsg.includes('genera una imagen') || lowerMsg.includes('generar imagen') ||
      lowerMsg.includes('crea una imagen') || lowerMsg.includes('crear una imagen') ||
      lowerMsg.includes('dibuja') || lowerMsg.includes('dibujame') ||
      lowerMsg.includes('create an image') || lowerMsg.includes('generate an image')
    )) autoImageGen = true

    if (!autoDbQuery && (
      lowerMsg.includes('consulta la base de datos') || lowerMsg.includes('consulta la bd') ||
      lowerMsg.includes('busca en la base de datos') || lowerMsg.includes('busca en la bd') ||
      lowerMsg.includes('query the database') || lowerMsg.includes('consulta bd') ||
      lowerMsg.includes('datos de la empresa')
    )) autoDbQuery = true

    if (!autoNetworkRag && (
      lowerMsg.includes('busca en los documentos') || lowerMsg.includes('busca en los archivos') ||
      lowerMsg.includes('busca en documentos') || lowerMsg.includes('buscar en documentos') ||
      lowerMsg.includes('search in documents') || lowerMsg.includes('busca en la unidad') ||
      lowerMsg.includes('busca en el drive')
    )) autoNetworkRag = true

    if (!autoDeepResearch && (
      lowerMsg.includes('investiga a fondo') || lowerMsg.includes('investigacion profunda') ||
      lowerMsg.includes('deep research') || lowerMsg.includes('investiga en profundidad') ||
      lowerMsg.includes('analiza a fondo') || lowerMsg.includes('informe completo sobre') ||
      lowerMsg.includes('informe detallado sobre')
    )) {
      autoDeepResearch = true
      autoWebSearch = true
    }

    if (!autoDocumentGeneration && (
      lowerMsg.includes('hazme un documento') || lowerMsg.includes('genera un documento') ||
      lowerMsg.includes('crea un documento') || lowerMsg.includes('redacta un documento') ||
      lowerMsg.includes('hazme un pdf') || lowerMsg.includes('genera un pdf') ||
      lowerMsg.includes('crear pdf') || lowerMsg.includes('hazme un word') ||
      lowerMsg.includes('genera un word') || lowerMsg.includes('hazme un docx') ||
      lowerMsg.includes('hazme un excel') || lowerMsg.includes('genera un excel') ||
      lowerMsg.includes('hazme un xlsx') || lowerMsg.includes('genera un markdown') ||
      lowerMsg.includes('generate a document') || lowerMsg.includes('create a document') ||
      lowerMsg.includes('generate a pdf') || lowerMsg.includes('create a pdf') ||
      lowerMsg.includes('generate a word') || lowerMsg.includes('generate an excel')
    )) autoDocumentGeneration = true

    if (!autoSpreadsheetAnalysis && (
      lowerMsg.includes('analiza excel') || lowerMsg.includes('analiza csv') ||
      lowerMsg.includes('analiza xlsx') || lowerMsg.includes('graficos automaticos') ||
      lowerMsg.includes('conclusiones del excel') || lowerMsg.includes('analyze spreadsheet')
    )) autoSpreadsheetAnalysis = true

    try {
      const convId = await createConversation(projectContextId)
      if (!convId) return
      setLeavingToChat(true)
      setToolsOpen(false)

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const attachmentsPayload: FileAttachment[] = attachments.map((attachment) => ({
        file_id: attachment.file_id,
        filename: attachment.filename,
        mime: attachment.mime,
        size: attachment.size,
        storage_path: attachment.storage_path,
      }))

      trackEvent('chat_message_sent', {
        conversation_id: convId,
        message_length: message.length,
        attachment_count: attachmentsPayload.length,
        tool_web_search: autoWebSearch,
        tool_db_query: autoDbQuery,
        tool_network_drive: autoNetworkRag,
        tool_image_generation: autoImageGen,
        tool_deep_research: autoDeepResearch,
        tool_document_generation: autoDocumentGeneration,
        tool_spreadsheet: autoSpreadsheetAnalysis,
      })

      addMessage({
        id: crypto.randomUUID(), conversation_id: convId, user_id: user.id,
        role: 'user', content: message, attachments_json: attachmentsPayload,
        sources_json: [], edit_version: 1, created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(), parent_message_id: null,
        branch_id: null, edited_at: null, active_version_id: null,
      })

      revokeAttachmentPreviews(attachments)
      setAttachments([])
      setInput('')
      const controller = new AbortController()
      setStreamAbortController(controller)
      setIsStreaming(true)
      setStreamingConversationId(convId)
      setStreamingContent('')
      if (typeof window !== 'undefined') window.requestAnimationFrame(() => autoResize())

      const transitionPromise = new Promise<void>((resolve) => {
        window.setTimeout(() => {
          router.replace(`/chat/${convId}`)
          resolve()
        }, 220)
      })

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: convId,
          input: message,
          model: selectedModel,
          rag_mode: ragMode,
          cite_mode: citeMode,
          web_search: autoWebSearch,
          db_query: autoDbQuery,
          network_drive_rag: autoNetworkRag,
          image_generation: autoImageGen,
          deep_research: autoDeepResearch,
          document_generation: autoDocumentGeneration,
          spreadsheet_analysis: autoSpreadsheetAnalysis,
          attachments: attachmentsPayload.map((attachment) => attachment.file_id),
        }),
        signal: controller.signal,
      })

      await transitionPromise

      if (res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let full = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          full += decoder.decode(value, { stream: true })
          setStreamingContent(full.replace('\n__TITLE_UPDATED__', ''))
        }
        if (full.includes('__TITLE_UPDATED__')) loadConversations()
      }

      await loadMessages(convId, { silent: true })
      setIsStreaming(false)
      setStreamingConversationId(null)
      setStreamingContent('')
      setStreamAbortController(null)
    } catch (e) {
      console.error('Welcome send error:', e)
    } finally {
      if (mountedRef.current) {
        setSending(false)
        setLeavingToChat(false)
      }
      setIsStreaming(false)
      setStreamingConversationId(null)
      setStreamingContent('')
      setStreamAbortController(null)
    }
  }

  const uploadFiles = useCallback(async (incomingFiles: File[]) => {
    if (!incomingFiles || incomingFiles.length === 0) return
    setUploading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setUploading(false)
      return
    }

    for (const file of incomingFiles) {
      const safeName = sanitizeFilename(file.name)
      const mime = coerceMimeType(file.type, safeName)
      const path = `${user.id}/${Date.now()}_${safeName}`
      const localPreview = mime.startsWith('image/') ? URL.createObjectURL(file) : ''
      const { error } = await supabase.storage.from('user-files').upload(path, file, { contentType: mime })
      if (!error) {
        const { data: fileRec } = await supabase.from('files').insert({
          user_id: user.id,
          storage_path: path,
          filename: file.name,
          mime,
          size: file.size,
          ...(projectContextId ? { project_id: projectContextId } : {}),
        }).select().single()

        if (fileRec) {
          if (AUTO_RAG_INGEST_ON_UPLOAD) {
            const mimeLower = (mime || '').toLowerCase()
            const ingestable = !mimeLower.startsWith('image/')
              && (
                mimeLower === 'application/pdf'
                || mimeLower === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                || mimeLower.startsWith('text/')
                || ['application/json', 'application/xml', 'application/javascript'].includes(mimeLower)
                || /\.(pdf|docx|txt|md|csv|log|json|xml|html|htm|sql|yaml|yml|js|ts|py)$/i.test(file.name || '')
              )

            if (ingestable) {
              try {
                const ingestRes = await fetch('/api/files/ingest', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ file_id: fileRec.id }),
                })
                if (!ingestRes.ok) {
                  addToast({ type: 'warning', message: 'No se pudo indexar el archivo. Puedes reintentar desde Ajustes > Archivos.' })
                }
              } catch {
                addToast({ type: 'warning', message: 'No se pudo indexar el archivo. Puedes reintentar desde Ajustes > Archivos.' })
              }
            }
          }

          setAttachments((prev) => [...prev, {
            file_id: fileRec.id,
            filename: file.name,
            mime,
            size: file.size,
            storage_path: path,
            ...(localPreview ? { local_preview_url: localPreview } : {}),
          }])
        } else if (localPreview) {
          URL.revokeObjectURL(localPreview)
        }
      } else if (localPreview) {
        URL.revokeObjectURL(localPreview)
      }
    }

    setUploading(false)
  }, [])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    await uploadFiles(Array.from(files))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTextareaPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items || [])
    const files = items
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file))

    if (files.length > 0) {
      e.preventDefault()
      void uploadFiles(files)
    }
  }

  const autoResize = () => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 150) + 'px'
    }
  }

  return (
    <div className="flex flex-col items-center justify-start md:justify-center h-full px-3 sm:px-4 pt-10 md:pt-0 relative overflow-y-auto md:overflow-hidden pb-52 md:pb-0">
      <div className="max-w-3xl w-full text-center relative z-10">
        <div
          className={`mx-auto mb-2 sm:mb-3 w-fit px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-white/55 border border-white/60 backdrop-blur-md flex items-center gap-2 transition-all duration-300 ${leavingToChat ? 'opacity-0 -translate-y-3 scale-95' : 'opacity-100 translate-y-0'}`}
          style={{ animation: 'fade-up 0.45s ease-out 0.08s both' }}
        >
          <div className={`relative w-8 h-8 ${isAdminUser ? 'admin-crown-wrap' : ''}`}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="Perfil" className={`w-8 h-8 rounded-full object-cover border border-white ${isAdminUser ? 'admin-crown-ring' : ''}`} />
            ) : (
              <div className={`w-8 h-8 rounded-full bg-zinc-200 text-zinc-600 text-xs font-semibold flex items-center justify-center border border-white ${isAdminUser ? 'admin-crown-ring' : ''}`}>
                {(userName || 'U')[0].toUpperCase()}
              </div>
            )}
            {isAdminUser && (
              <span className="admin-crown-badge" aria-hidden="true">
                <Crown size={8} strokeWidth={2.2} />
              </span>
            )}
            <span
              className={`status-wave-dot absolute -right-0.5 bottom-0 w-2.5 h-2.5 rounded-full border border-white ${activityCfg.dotClass}`}
            />
          </div>
          <span className="hidden sm:inline text-[11px] font-medium text-zinc-700">{activityCfg.label}</span>
        </div>

        {contextProjectId && (
          <div
            className={`mx-auto mb-2 sm:mb-3 w-fit max-w-[92%] px-2.5 py-1 rounded-full border border-cyan-200/80 bg-cyan-50/85 text-cyan-700 backdrop-blur-md flex items-center gap-2 transition-all duration-300 ${leavingToChat ? 'opacity-0 -translate-y-3 scale-95' : 'opacity-100 translate-y-0'}`}
            style={{ animation: 'fade-up 0.45s ease-out 0.12s both' }}
          >
            <FolderOpen size={13} className="shrink-0" />
            <span className="text-[11px] sm:text-xs font-semibold truncate">
              {contextProjectName ? `${t.chatInput.projectIn}: ${contextProjectName}` : t.chatInput.projectActive}
            </span>
          </div>
        )}

        <Image src="/logo.png" alt="GIA" width={72} height={72}
          className={`mx-auto mb-3 sm:mb-4 w-14 h-14 sm:w-[72px] sm:h-[72px] rounded-2xl shadow-lg shadow-indigo-500/15 transition-all duration-300 ${leavingToChat ? 'opacity-0 -translate-y-4 scale-90' : 'opacity-100 translate-y-0 scale-100'}`}
          style={{ animation: 'bounce-in 0.7s ease-out' }} />

        <h1 className={`text-3xl sm:text-5xl font-bold mb-2 tracking-tight gradient-text-animated transition-all duration-300 ${leavingToChat ? 'opacity-0 -translate-y-4' : 'opacity-100 translate-y-0'}`}
            style={{ animation: 'fade-up 0.5s ease-out 0.15s both' }}>
          {greeting}{userName ? `, ${userName}` : ''}
        </h1>

        <p className={`mb-6 sm:mb-8 text-base sm:text-xl h-7 sm:h-8 font-semibold gradient-text-animated transition-all duration-300 ${leavingToChat ? 'opacity-0 -translate-y-4' : 'opacity-100 translate-y-0'}`}
           style={{ animation: 'fade-up 0.5s ease-out 0.35s both' }}>
          {typedText}<span className="inline-block w-0.5 h-5 sm:h-6 bg-indigo-400 ml-0.5 align-middle" style={{ animation: 'typewriter-cursor 0.8s step-end infinite' }} />
        </p>

        <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3 max-w-2xl mx-auto mb-6 sm:mb-8 transition-all duration-300 ${leavingToChat ? 'opacity-0 -translate-y-6 pointer-events-none' : 'opacity-100 translate-y-0'}`}>
          {SUGGESTION_META.map((s, i) => {
            const Icon = s.icon
            const text = suggestionTexts[i] || ''
            return (
              <button
                key={i}
                onClick={() => handleSend(text)}
                disabled={sending}
                className={`liquid-glass-card text-left p-3 sm:p-3.5 rounded-xl transition-all duration-300 text-sm text-zinc-600 flex items-start gap-2.5 group/card hover:scale-[1.02] active:scale-[0.98] ${i >= 4 ? 'hidden sm:flex' : ''}`}
                style={{ animation: `fade-up 0.4s ease-out ${0.5 + i * 0.08}s both` }}
              >
                <div className={`p-1.5 rounded-lg ${s.bg} shrink-0`}>
                  <Icon size={14} className={`${s.color}`} />
                </div>
                <span className="group-hover/card:text-zinc-800 transition-colors leading-snug">{text}</span>
              </button>
            )
          })}
        </div>

        <div
          className={`hidden md:block max-w-3xl w-full mx-auto transition-all duration-300 ${leavingToChat ? 'translate-y-28 sm:translate-y-36 scale-[1.01]' : 'translate-y-0 scale-100'}`}
          style={{ animation: 'fade-up 0.5s ease-out 0.9s both' }}
        >
          {attachments.length > 0 && (
            <div className={`flex flex-wrap gap-2.5 mb-2 justify-center transition-all duration-300 ${leavingToChat ? 'opacity-0' : 'opacity-100'}`}>
              {attachments.map((attachment, index) => (
                <div key={attachment.file_id || index} className="w-[210px] rounded-xl border border-white/60 bg-white/80 backdrop-blur-md shadow-sm overflow-hidden">
                  <div className="p-2">
                    {attachment.mime?.startsWith('image/') && attachment.local_preview_url ? (
                      <img src={attachment.local_preview_url} alt={attachment.filename} className="w-full h-24 object-cover rounded-lg border border-zinc-100" />
                    ) : (
                      <div className="w-full h-24 rounded-lg border border-zinc-100 bg-zinc-50 flex items-center justify-center">
                        {attachment.mime?.startsWith('image/') ? <FileImage size={24} className="text-blue-500" /> : <FileText size={22} className="text-zinc-400" />}
                      </div>
                    )}
                  </div>
                  <div className="px-2.5 pb-2.5">
                    <p className="text-xs font-medium text-zinc-700 truncate">{attachment.filename}</p>
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-zinc-400">
                      <span>{formatFileSize(attachment.size || 0)}</span>
                      <button
                        type="button"
                        onClick={() => setAttachments((prev) => {
                          const target = prev[index]
                          if (target?.local_preview_url) URL.revokeObjectURL(target.local_preview_url)
                          return prev.filter((_, idx) => idx !== index)
                        })}
                        className="ml-auto p-1 rounded-md hover:text-red-500 hover:bg-red-50 transition-colors"
                        title={t.chatInput.removeAttachment}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeToolsCount > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5 mb-2">
              {webSearch && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 bg-white/50 text-blue-600 border border-white/40 rounded-full backdrop-blur-md">
                  <Globe size={10} /> {t.chatInput.web}
                  <button onClick={() => setWebSearch(false)} className="ml-0.5 hover:text-blue-800"><X size={10} /></button>
                </span>
              )}
              {dbQuery && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 bg-white/50 text-indigo-600 border border-white/40 rounded-full backdrop-blur-md">
                  <Database size={10} /> {t.chatInput.db}
                  <button onClick={() => setDbQuery(false)} className="ml-0.5 hover:text-indigo-800"><X size={10} /></button>
                </span>
              )}
              {networkDriveRag && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 bg-white/50 text-emerald-600 border border-white/40 rounded-full backdrop-blur-md">
                  <HardDrive size={10} /> {t.chatInput.net}
                  <button onClick={() => setNetworkDriveRag(false)} className="ml-0.5 hover:text-emerald-800"><X size={10} /></button>
                </span>
              )}
              {imageGeneration && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 bg-white/50 text-purple-600 border border-white/40 rounded-full backdrop-blur-md">
                  <ImagePlus size={10} /> {t.chatInput.image}
                  <button onClick={() => setImageGeneration(false)} className="ml-0.5 hover:text-purple-800"><X size={10} /></button>
                </span>
              )}
              {deepResearch && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 bg-white/50 text-amber-600 border border-white/40 rounded-full backdrop-blur-md">
                  <FlaskConical size={10} /> {t.chatInput.deepResearch}
                  <button
                    onClick={() => setResearchMode(researchMode === 'standard' ? 'exhaustive' : 'standard')}
                    className="ml-1 px-1.5 py-0.5 bg-amber-100/80 hover:bg-amber-200/80 rounded text-[10px] font-semibold transition-colors"
                    title={researchMode === 'standard' ? 'Cambiar a modo exhaustivo (más profundo)' : 'Cambiar a modo estándar (más rápido)'}
                  >
                    {researchMode === 'standard' ? '⚡ Rápido' : '🔬 Profundo'}
                  </button>
                  <button onClick={() => setDeepResearch(false)} className="ml-0.5 hover:text-amber-800"><X size={10} /></button>
                </span>
              )}
              {documentGeneration && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 bg-white/50 text-sky-700 border border-white/40 rounded-full backdrop-blur-md">
                  <FileText size={10} /> {t.chatInput.doc}
                  <button onClick={() => setDocumentGeneration(false)} className="ml-0.5 hover:text-sky-800"><X size={10} /></button>
                </span>
              )}
              {spreadsheetAnalysis && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 bg-white/50 text-cyan-700 border border-white/40 rounded-full backdrop-blur-md">
                  <BarChart3 size={10} /> {t.chatInput.sheet}
                  <button onClick={() => setSpreadsheetAnalysis(false)} className="ml-0.5 hover:text-cyan-800"><X size={10} /></button>
                </span>
              )}
            </div>
          )}

          <div className="liquid-glass-input flex items-center gap-2 rounded-full px-4 py-2.5 transition-all duration-500 focus-within:scale-[1.01]">
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" />
            <div className="relative shrink-0" ref={toolsMenuRef}>
              <button onClick={() => setToolsOpen(!toolsOpen)}
                className={`p-2 rounded-full transition-all duration-200 ${toolsOpen ? 'bg-white/40 text-zinc-700 rotate-45' : 'text-zinc-400 hover:text-zinc-600 hover:bg-white/30'} ${activeToolsCount > 0 ? 'text-blue-500' : ''}`}
                aria-label={t.chatInput.tools}>
                <Plus size={20} />
              </button>
              {activeToolsCount > 0 && !toolsOpen && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{activeToolsCount}</span>
              )}
              {toolsOpen && (
                <div className="absolute bottom-full left-0 mb-3 rounded-2xl p-1.5 min-w-[240px] z-[100]
                  liquid-glass-dropdown menu-solid-panel"
                     style={{ animation: 'message-in 0.18s ease-out' }}>
                  <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-3 pt-1.5 pb-1">{t.chatInput.tools}</p>
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                    className="w-full text-left px-3 py-2.5 text-[13px] hover:bg-gradient-to-r hover:from-zinc-100 hover:to-zinc-50 flex items-center gap-3 text-zinc-700 transition-all duration-150 rounded-xl font-medium">
                    {uploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} className="text-zinc-400" />}
                    {t.chatInput.attachFile}
                  </button>
                  <hr className="border-zinc-200/60 my-1 mx-2" />
                  {toolPermissions.webSearch && (
                    <button onClick={() => { setWebSearch(!webSearch) }}
                      className={`w-full text-left px-3 py-2.5 text-[13px] flex items-center gap-3 transition-all duration-150 rounded-xl font-medium ${webSearch ? 'bg-blue-50 text-blue-700 shadow-sm shadow-blue-100' : 'text-zinc-700 hover:bg-gradient-to-r hover:from-blue-50/80 hover:to-blue-50/30'}`}>
                      <Globe size={16} className={webSearch ? 'text-blue-500' : 'text-blue-400'} />
                      {t.chatInput.webSearch}
                      {webSearch && <Check size={14} className="ml-auto text-blue-500" />}
                    </button>
                  )}
                  {toolPermissions.dbQuery && (
                    <button onClick={() => { setDbQuery(!dbQuery) }}
                      className={`w-full text-left px-3 py-2.5 text-[13px] flex items-center gap-3 transition-all duration-150 rounded-xl font-medium ${dbQuery ? 'bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-100' : 'text-zinc-700 hover:bg-gradient-to-r hover:from-indigo-50/80 hover:to-indigo-50/30'}`}>
                      <Database size={16} className={dbQuery ? 'text-indigo-500' : 'text-indigo-400'} />
                      {t.chatInput.database}
                      {dbQuery && <Check size={14} className="ml-auto text-indigo-500" />}
                    </button>
                  )}
                  {toolPermissions.networkDriveRag && (
                    <button onClick={() => { setNetworkDriveRag(!networkDriveRag) }}
                      className={`w-full text-left px-3 py-2.5 text-[13px] flex items-center gap-3 transition-all duration-150 rounded-xl font-medium ${networkDriveRag ? 'bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100' : 'text-zinc-700 hover:bg-gradient-to-r hover:from-emerald-50/80 hover:to-emerald-50/30'}`}>
                      <HardDrive size={16} className={networkDriveRag ? 'text-emerald-500' : 'text-emerald-400'} />
                      {t.chatInput.networkDrive}
                      {networkDriveRag && <Check size={14} className="ml-auto text-emerald-500" />}
                    </button>
                  )}
                  {toolPermissions.imageGeneration && (
                    <button onClick={() => { setImageGeneration(!imageGeneration) }}
                      className={`w-full text-left px-3 py-2.5 text-[13px] flex items-center gap-3 transition-all duration-150 rounded-xl font-medium ${imageGeneration ? 'bg-purple-50 text-purple-700 shadow-sm shadow-purple-100' : 'text-zinc-700 hover:bg-gradient-to-r hover:from-purple-50/80 hover:to-purple-50/30'}`}>
                      <ImagePlus size={16} className={imageGeneration ? 'text-purple-500' : 'text-purple-400'} />
                      {t.chatInput.generateImage}
                      {imageGeneration && <Check size={14} className="ml-auto text-purple-500" />}
                    </button>
                  )}
                  <hr className="border-zinc-200/60 my-1 mx-2" />
                  {toolPermissions.deepResearch && (
                    <button onClick={() => { setDeepResearch(!deepResearch); if (!deepResearch) setWebSearch(true) }}
                      className={`w-full text-left px-3 py-2.5 text-[13px] flex items-center gap-3 transition-all duration-150 rounded-xl font-medium ${deepResearch ? 'bg-amber-50 text-amber-700 shadow-sm shadow-amber-100' : 'text-zinc-700 hover:bg-gradient-to-r hover:from-amber-50/80 hover:to-amber-50/30'}`}>
                      <FlaskConical size={16} className={deepResearch ? 'text-amber-500' : 'text-amber-400'} />
                      {t.chatInput.deepResearch}
                      {deepResearch && <Check size={14} className="ml-auto text-amber-500" />}
                    </button>
                  )}
                  {toolPermissions.documentGeneration && (
                    <button onClick={() => { setDocumentGeneration(!documentGeneration) }}
                      className={`w-full text-left px-3 py-2.5 text-[13px] flex items-center gap-3 transition-all duration-150 rounded-xl font-medium ${documentGeneration ? 'bg-sky-50 text-sky-700 shadow-sm shadow-sky-100' : 'text-zinc-700 hover:bg-gradient-to-r hover:from-sky-50/80 hover:to-sky-50/30'}`}>
                      <FileText size={16} className={documentGeneration ? 'text-sky-500' : 'text-sky-400'} />
                      {t.chatInput.generateDocument}
                      {documentGeneration && <Check size={14} className="ml-auto text-sky-500" />}
                    </button>
                  )}
                  {toolPermissions.spreadsheetAnalysis && (
                    <button onClick={() => { setSpreadsheetAnalysis(!spreadsheetAnalysis) }}
                      className={`w-full text-left px-3 py-2.5 text-[13px] flex items-center gap-3 transition-all duration-150 rounded-xl font-medium ${spreadsheetAnalysis ? 'bg-cyan-50 text-cyan-700 shadow-sm shadow-cyan-100' : 'text-zinc-700 hover:bg-gradient-to-r hover:from-cyan-50/80 hover:to-cyan-50/30'}`}>
                      <BarChart3 size={16} className={spreadsheetAnalysis ? 'text-cyan-500' : 'text-cyan-400'} />
                      {t.chatInput.spreadsheetAnalysis}
                      {spreadsheetAnalysis && <Check size={14} className="ml-auto text-cyan-500" />}
                    </button>
                  )}
                </div>
              )}
            </div>
            <textarea ref={textareaRef} value={input} onChange={(e) => { setInput(e.target.value); autoResize() }}
              onKeyDown={handleKeyDown} onPaste={handleTextareaPaste} placeholder={welcomeInputPlaceholder}
              className="flex-1 bg-transparent text-base text-zinc-700 placeholder-zinc-400/70 resize-none max-h-[120px] focus:outline-none py-0.5"
              rows={1} disabled={sending} />
            <button onClick={() => handleSend()} disabled={(!input.trim() && attachments.length === 0) || sending || uploading}
              className={`p-2.5 text-white rounded-full transition-all duration-300 shrink-0 hover:scale-110 active:scale-95 ${
                input.trim() || attachments.length > 0 ? 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 shadow-lg shadow-blue-500/30' : 'bg-zinc-300/60'
              }`}
              style={input.trim() || attachments.length > 0 ? { animation: 'send-ready 2s ease-in-out infinite' } : undefined}
              aria-label={t.chatInput.send}>
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>

          <div className="flex items-center justify-center gap-2 mt-2.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400/80 bg-white/40 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/30">
              <Cpu size={10} />
              {selectedModel}
            </span>
            <span className="text-[10px] text-zinc-400/60">-</span>
            <p className="text-[10px] text-zinc-400/70">{t.welcome.modelDisclaimer}</p>
          </div>
        </div>
      </div>

      {/* Mobile: use the main composer (fixed + keyboard-safe). */}
      <div className="md:hidden w-full">
        <ChatInput />
      </div>
    </div>
  )
}
