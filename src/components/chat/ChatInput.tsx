'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useChatStore } from '@/store/chat-store'
import { createClient } from '@/lib/supabase/client'
import { FileAttachment } from '@/lib/types'
import { useUIStore, type ToolStatus } from '@/store/ui-store'
import { trackEvent } from '@/lib/analytics'
import { Send, Paperclip, X, Square, Loader2, Globe, Database, HardDrive, Plus, ImagePlus, FlaskConical, Mic, MicOff, Volume2, VolumeX, Eye, FileImage, FileText, Check, BarChart3, FolderOpen, Code2 } from 'lucide-react'
import { useTranslation } from '@/i18n/LanguageContext'
import { coerceMimeType, sanitizeFilename } from '@/lib/file-utils'
import { AUTO_RAG_INGEST_ON_UPLOAD } from '@/lib/rag-ingest-config'
import { useProjectContext } from '@/hooks/useProjectContext'
import SmartSuggestions from './SmartSuggestions'

interface PendingAttachment extends FileAttachment {
  local_preview_url?: string
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ChatInput() {
  const { t, language } = useTranslation()
  const router = useRouter()
  const { projectId, projectName } = useProjectContext()
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(false)
  const [multiline, setMultiline] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const toolCycleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const toolsMenuRef = useRef<HTMLDivElement>(null)
  const toolsSheetRef = useRef<HTMLDivElement>(null)
  const attachmentsRef = useRef<PendingAttachment[]>([])

  const {
    activeConversationId, projectContextId, createConversation, isStreaming,
    setIsStreaming, setStreamingContent, selectedModel, selectedAgent, streamingContent,
    setStreamingConversationId,
    setStreamAbortController,
    abortStreaming,
    ragMode, citeMode, webSearch, setWebSearch, dbQuery, setDbQuery,
    networkDriveRag, setNetworkDriveRag, imageGeneration, setImageGeneration,
    deepResearch, setDeepResearch, researchMode, setResearchMode,
    documentGeneration, setDocumentGeneration,
    spreadsheetAnalysis, setSpreadsheetAnalysis,
    codeInterpreter, setCodeInterpreter,
    addMessage, loadMessages, loadConversations,
  } = useChatStore()
  const { setToolStatus, openFilePreview, soundEnabled, addToast } = useUIStore()

  const revokeAttachmentPreviews = useCallback((items: PendingAttachment[]) => {
    for (const item of items) {
      if (item.local_preview_url) {
        URL.revokeObjectURL(item.local_preview_url)
      }
    }
  }, [])

  const playNotificationSound = useCallback(() => {
    if (!soundEnabled || typeof window === 'undefined') return
    try {
      const AudioContextCtor = window.AudioContext || (
        window as Window & { webkitAudioContext?: typeof AudioContext }
      ).webkitAudioContext
      if (!AudioContextCtor) return

      const ctx = new AudioContextCtor()
      const now = ctx.currentTime
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.linearRampToValueAtTime(0.08, now + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32)
      gain.connect(ctx.destination)

      const toneA = ctx.createOscillator()
      toneA.type = 'sine'
      toneA.frequency.setValueAtTime(880, now)
      toneA.frequency.exponentialRampToValueAtTime(1174, now + 0.14)
      toneA.connect(gain)

      const toneB = ctx.createOscillator()
      toneB.type = 'sine'
      toneB.frequency.setValueAtTime(1320, now + 0.15)
      toneB.frequency.exponentialRampToValueAtTime(1760, now + 0.30)
      toneB.connect(gain)

      toneA.start(now)
      toneA.stop(now + 0.15)
      toneB.start(now + 0.15)
      toneB.stop(now + 0.31)

      window.setTimeout(() => {
        void ctx.close().catch(() => undefined)
      }, 450)
    } catch {
      // Ignore audio runtime errors
    }
  }, [soundEnabled])

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  useEffect(() => {
    return () => {
      revokeAttachmentPreviews(attachmentsRef.current)
    }
  }, [revokeAttachmentPreviews])

  // Mobile keyboard handling: keep the composer above the virtual keyboard.
  // We update a CSS var so layout responds without React re-renders.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0))
      document.documentElement.style.setProperty('--keyboard-offset', `${offset}px`)
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    window.addEventListener('orientationchange', update)

    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      window.removeEventListener('orientationchange', update)
      document.documentElement.style.setProperty('--keyboard-offset', '0px')
    }
  }, [])

  // Voice Mode: Speech-to-Text (STT)
  const toggleListening = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SpeechRecognition) { alert(t.chatInput.voiceUnsupported); return }
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = language === 'ca' ? 'ca-ES' : 'es-ES'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      setInput(transcript)
    }
    recognition.onerror = () => setIsListening(false)
    recognition.onend = () => setIsListening(false)
    recognition.start()
    recognitionRef.current = recognition
    setIsListening(true)
  }, [isListening, language, t.chatInput.voiceUnsupported])

  // Voice Mode: Text-to-Speech (TTS)
  const prevIsStreamingRef = useRef(false)
  const lastStreamedResponseRef = useRef('')

  useEffect(() => {
    if (isStreaming && streamingContent) {
      lastStreamedResponseRef.current = streamingContent
    }
  }, [isStreaming, streamingContent])

  useEffect(() => {
    const justFinished = prevIsStreamingRef.current && !isStreaming
    prevIsStreamingRef.current = isStreaming

    if (!ttsEnabled || !justFinished) return
    if (!('speechSynthesis' in window)) return

    const rawText = (streamingContent || lastStreamedResponseRef.current)
      .replace(/[#*_`~\[\]()]/g, '')
      .substring(0, 5000)

    if (!rawText.trim()) return

    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(rawText)
      utterance.lang = language === 'ca' ? 'ca-ES' : 'es-ES'
      utterance.rate = 1.0
      window.speechSynthesis.speak(utterance)
    } catch {
      // Ignore speech synthesis runtime errors
    }

    lastStreamedResponseRef.current = ''
  }, [isStreaming, streamingContent, ttsEnabled, language])

  const handleApplySuggestion = useCallback((text: string, toolActivations?: {
    webSearch?: boolean
    dbQuery?: boolean
    imageGeneration?: boolean
    spreadsheetAnalysis?: boolean
  }) => {
    setInput(text)
    if (toolActivations) {
      if (toolActivations.webSearch) setWebSearch(true)
      if (toolActivations.dbQuery) setDbQuery(true)
      if (toolActivations.imageGeneration) setImageGeneration(true)
      if (toolActivations.spreadsheetAnalysis) setSpreadsheetAnalysis(true)
    }
    // Focus textarea
    textareaRef.current?.focus()
  }, [setWebSearch, setDbQuery, setImageGeneration, setSpreadsheetAnalysis])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text && attachments.length === 0) return
    if (isStreaming || uploading) return
    // Stop listening if active
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false) }

    let convId = activeConversationId
    if (!convId) {
      convId = await createConversation(projectContextId)
      if (!convId) return
      router.push(`/chat/${convId}`)
    }

    setInput('')
    setMultiline(false)
    if (typeof window !== 'undefined') window.requestAnimationFrame(() => autoResize())

    const controller = new AbortController()
    setStreamAbortController(controller)
    setIsStreaming(true)
    setStreamingConversationId(convId)
    setStreamingContent('')

    // Auto-activation of tools by keywords
    let autoWebSearch = webSearch
    let autoImageGen = imageGeneration
    let autoDbQuery = dbQuery
    let autoNetworkRag = networkDriveRag
    let autoDeepResearch = deepResearch
    let autoDocumentGeneration = documentGeneration
    let autoSpreadsheetAnalysis = spreadsheetAnalysis

    const lowerText = text.toLowerCase()

    // Web search keywords
    if (!autoWebSearch && (
      lowerText.includes('busca en la web') ||
      lowerText.includes('buscar en internet') ||
      lowerText.includes('busca en internet') ||
      lowerText.includes('busqueda web') ||
      lowerText.includes('search the web') ||
      lowerText.includes('search online') ||
      lowerText.includes('busca online') ||
      lowerText.includes('investiga en la web') ||
      lowerText.includes('investiga en internet')
    )) {
      autoWebSearch = true
      console.log('[Auto-Tool] ðŸŒ Web search activated by keyword')
    }

    // Image generation keywords
    if (!autoImageGen && (
      lowerText.includes('genera una imagen') ||
      lowerText.includes('generar imagen') ||
      lowerText.includes('generar una imagen') ||
      lowerText.includes('crea una imagen') ||
      lowerText.includes('crear una imagen') ||
      lowerText.includes('dibuja') ||
      lowerText.includes('dibujame') ||
      lowerText.includes('create an image') ||
      lowerText.includes('generate an image') ||
      lowerText.includes('draw me') ||
      lowerText.includes('genera imagen')
    )) {
      autoImageGen = true
      console.log('[Auto-Tool] ðŸŽ¨ Image generation activated by keyword')
    }

    // Database query keywords
    if (!autoDbQuery && (
      lowerText.includes('consulta la base de datos') ||
      lowerText.includes('consulta la bd') ||
      lowerText.includes('busca en la base de datos') ||
      lowerText.includes('busca en la bd') ||
      lowerText.includes('query the database') ||
      lowerText.includes('query database') ||
      lowerText.includes('consulta bd') ||
      lowerText.includes('datos de la empresa')
    )) {
      autoDbQuery = true
      console.log('[Auto-Tool] ðŸ—„ï¸ DB query activated by keyword')
    }

    // Network drive RAG keywords
    if (!autoNetworkRag && (
      lowerText.includes('busca en los documentos') ||
      lowerText.includes('busca en los archivos') ||
      lowerText.includes('busca en documentos') ||
      lowerText.includes('busca en archivos') ||
      lowerText.includes('buscar en documentos') ||
      lowerText.includes('search in documents') ||
      lowerText.includes('search documents') ||
      lowerText.includes('busca en la unidad') ||
      lowerText.includes('busca en el drive')
    )) {
      autoNetworkRag = true
      console.log('[Auto-Tool] ðŸ“ Network RAG activated by keyword')
    }

    // Deep Research keywords
    if (!autoDeepResearch && (
      lowerText.includes('investiga a fondo') || lowerText.includes('investigacion profunda') ||
      lowerText.includes('deep research') || lowerText.includes('investiga en profundidad') ||
      lowerText.includes('analiza a fondo') || lowerText.includes('informe completo sobre') ||
      lowerText.includes('informe detallado sobre')
    )) {
      autoDeepResearch = true
      autoWebSearch = true
      console.log('[Auto-Tool] ðŸ”¬ Deep research activated by keyword')
    }

    // Document generation keywords - DISABLED (user request)
    /*
    if (!autoDocumentGeneration && (
      lowerText.includes('hazme un documento') ||
      lowerText.includes('genera un documento') ||
      lowerText.includes('crea un documento') ||
      lowerText.includes('redacta un documento') ||
      lowerText.includes('hazme un pdf') ||
      lowerText.includes('genera un pdf') ||
      lowerText.includes('crear pdf') ||
      lowerText.includes('hazme un word') ||
      lowerText.includes('genera un word') ||
      lowerText.includes('hazme un docx') ||
      lowerText.includes('hazme un excel') ||
      lowerText.includes('genera un excel') ||
      lowerText.includes('hazme un xlsx') ||
      lowerText.includes('genera un markdown') ||
      lowerText.includes('generate a document') ||
      lowerText.includes('create a document') ||
      lowerText.includes('generate a pdf') ||
      lowerText.includes('create a pdf') ||
      lowerText.includes('generate a word') ||
      lowerText.includes('generate an excel')
    )) {
      autoDocumentGeneration = true
      console.log('[Auto-Tool] ðŸ“„ Document generation activated by keyword')
    }
    */

    // Spreadsheet analysis keywords
    if (!autoSpreadsheetAnalysis && (
      lowerText.includes('analiza excel') ||
      lowerText.includes('analiza csv') ||
      lowerText.includes('analiza xlsx') ||
      lowerText.includes('graficos automaticos') ||
      lowerText.includes('grafico automatico') ||
      lowerText.includes('conclusiones del excel') ||
      lowerText.includes('analyze spreadsheet')
    )) {
      autoSpreadsheetAnalysis = true
      console.log('[Auto-Tool] ðŸ“Š Spreadsheet analysis activated by keyword')
    }

    const hasImageAttachment = attachments.some((attachment) => attachment.mime?.startsWith('image/'))

    // Start tool status cycling (#20)
    const enabledTools: ToolStatus[] = []
    if (autoDeepResearch) enabledTools.push('deep_research')
    if (autoWebSearch) enabledTools.push('searching_web')
    if (autoDbQuery) enabledTools.push('querying_db')
    if (autoNetworkRag) enabledTools.push('searching_network')
    if (autoImageGen) enabledTools.push('generating_image')
    if (autoDocumentGeneration) enabledTools.push('creating_document')
    if (hasImageAttachment) enabledTools.push('reading_ocr')
    if (autoSpreadsheetAnalysis) enabledTools.push('analyzing_spreadsheet')
    if (enabledTools.length > 0) {
      setToolStatus(enabledTools[0])
      let toolIdx = 0
      const toolCycleInterval = setInterval(() => {
        toolIdx = (toolIdx + 1) % enabledTools.length
        setToolStatus(enabledTools[toolIdx])
      }, 3000)
      toolCycleIntervalRef.current = toolCycleInterval
    } else {
      setToolStatus('thinking')
    }

    // Add optimistic user message
    const tempId = crypto.randomUUID()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      if (toolCycleIntervalRef.current) {
        clearInterval(toolCycleIntervalRef.current)
        toolCycleIntervalRef.current = null
      }
      setToolStatus('idle')
      setIsStreaming(false)
      setStreamingConversationId(null)
      setStreamingContent('')
      setStreamAbortController(null)
      return
    }

    const attachmentsPayload: FileAttachment[] = attachments.map((attachment) => ({
      file_id: attachment.file_id,
      filename: attachment.filename,
      mime: attachment.mime,
      size: attachment.size,
      storage_path: attachment.storage_path,
    }))

    trackEvent('chat_message_sent', {
      conversation_id: convId,
      message_length: text.length,
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
      id: tempId, conversation_id: convId, user_id: user.id,
      role: 'user', content: text, attachments_json: attachmentsPayload,
      sources_json: [], edit_version: 1, created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(), parent_message_id: null,
      branch_id: null, edited_at: null, active_version_id: null,
    })
    revokeAttachmentPreviews(attachments)
    setAttachments([])

    let wasAborted = false
    let completed = false
    try {
      // Check if agent is selected
      if (selectedAgent) {
        // Execute agent instead of LLM
        const res = await fetch('/api/agents/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_id: selectedAgent,
            user_input: text,
          }),
          signal: controller.signal,
        })

        if (!res.ok) throw new Error('Agent execution failed')
        const data = await res.json()

        // Add agent response as assistant message
        const assistantMessage = {
          id: crypto.randomUUID(),
          conversation_id: convId,
          user_id: user.id,
          role: 'assistant' as const,
          content: data.result || 'No se pudo obtener respuesta del agente',
          attachments_json: [],
          sources_json: [],
          edit_version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          parent_message_id: null,
          branch_id: null,
          edited_at: null,
          active_version_id: null,
          meta_json: {
            agent_execution_id: data.execution_id,
            agent_id: selectedAgent,
            tools_used: data.tools_used || [],
          },
        }

        // Show the result as streaming content
        setStreamingContent(data.result || '')
        addMessage(assistantMessage)
        completed = true
      } else {
        // Normal LLM flow
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: convId, input: text, model: selectedModel,
            rag_mode: ragMode, cite_mode: citeMode,
            web_search: autoWebSearch, db_query: autoDbQuery,
            network_drive_rag: autoNetworkRag, image_generation: autoImageGen,
            deep_research: autoDeepResearch,
            research_mode: researchMode,
            document_generation: autoDocumentGeneration,
            spreadsheet_analysis: autoSpreadsheetAnalysis,
            attachments: attachmentsPayload.map(a => a.file_id),
          }),
          signal: controller.signal,
        })

        if (!res.body) throw new Error('No response body')
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let full = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          full += chunk
          // Strip title update signal from displayed content
          setStreamingContent(full.replace('\n__TITLE_UPDATED__', ''))
        }
        // If title was updated, reload sidebar conversations
        if (full.includes('__TITLE_UPDATED__')) {
          loadConversations()
        }
        completed = true
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
        // User paused
        wasAborted = true
      } else {
        console.error('Chat error:', e)
      }
    } finally {
      if (toolCycleIntervalRef.current) {
        clearInterval(toolCycleIntervalRef.current)
        toolCycleIntervalRef.current = null
      }
      setToolStatus('idle')
      if (completed && !wasAborted) playNotificationSound()
      // Reload silently before clearing streamed content to avoid visual flicker.
      if (convId) await loadMessages(convId, { silent: true })
      setIsStreaming(false)
      setStreamingConversationId(null)
      setStreamingContent('')
      setStreamAbortController(null)
    }
  }, [input, attachments, activeConversationId, createConversation, isStreaming, uploading, isListening, setIsStreaming, setStreamingConversationId, setStreamingContent, selectedModel, selectedAgent, ragMode, citeMode, webSearch, dbQuery, networkDriveRag, imageGeneration, deepResearch, documentGeneration, spreadsheetAnalysis, addMessage, loadMessages, loadConversations, setToolStatus, revokeAttachmentPreviews, playNotificationSound, router, setStreamAbortController, researchMode, projectContextId])

  const handleStop = () => {
    abortStreaming()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const uploadFiles = useCallback(async (incomingFiles: File[]) => {
    if (!incomingFiles || incomingFiles.length === 0) return
    setUploading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    for (const file of incomingFiles) {
      const safeName = sanitizeFilename(file.name)
      const mime = coerceMimeType(file.type, safeName)
      const path = `${user.id}/${Date.now()}_${safeName}`
      const localPreview = mime.startsWith('image/') ? URL.createObjectURL(file) : ''
      const { error } = await supabase.storage.from('user-files').upload(path, file, { contentType: mime })
      if (!error) {
        const { data: fileRec } = await supabase.from('files').insert({
          user_id: user.id, storage_path: path, filename: file.name,
          mime, size: file.size,
          ...(projectContextId ? { project_id: projectContextId } : {}),
        }).select().single()
        if (fileRec) {
          if (AUTO_RAG_INGEST_ON_UPLOAD) {
            // Auto-index supported docs (PDF, DOCX, TXT, etc.) so RAG can use them without manual ingest.
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

          setAttachments(prev => [...prev, {
            file_id: fileRec.id, filename: file.name, mime,
            size: file.size, storage_path: path,
            ...(localPreview ? { local_preview_url: localPreview } : {}),
          }])
        } else {
          if (localPreview) URL.revokeObjectURL(localPreview)
          addToast({ type: 'error', message: 'No se pudo registrar el archivo. Reintenta.' })
        }
      } else {
        if (localPreview) URL.revokeObjectURL(localPreview)
        addToast({ type: 'error', message: 'No se pudo subir el archivo. Reintenta.' })
      }
    }
    setUploading(false)
  }, [addToast])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    await uploadFiles(Array.from(files))
    if (fileInputRef.current) fileInputRef.current.value = ''
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
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
    setMultiline(ta.scrollHeight > 48)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files || [])
    if (files.length > 0) void uploadFiles(files)
  }

  // Close tools menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (toolsMenuRef.current && toolsMenuRef.current.contains(target)) return
      if (toolsSheetRef.current && toolsSheetRef.current.contains(target)) return
      setToolsOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const activeToolsCount = [webSearch, dbQuery, networkDriveRag, imageGeneration, deepResearch, documentGeneration, spreadsheetAnalysis, codeInterpreter].filter(Boolean).length
  const inputPlaceholder = isListening
    ? t.chatInput.listening
    : projectName
      ? `${t.chatInput.projectPlaceholderPrefix} ${projectName}...`
      : t.chatInput.placeholder

  return (
    <div
      className="fixed md:absolute bottom-[calc(56px+env(safe-area-inset-bottom))] md:bottom-0 left-0 right-0 z-30 pointer-events-none"
      style={{ transform: 'translateY(calc(-1 * var(--keyboard-offset, 0px)))' }}
    >
      <div className="max-w-4xl mx-auto px-3 sm:px-4 pb-4 pointer-events-auto">
        {/* Attachment preview cards */}
        {attachments.length > 0 && (
          <div className="flex gap-2.5 mb-2 overflow-x-auto pb-1 -mx-1 px-1 md:flex-wrap md:overflow-visible md:pb-0 md:mx-0 md:px-0">
            {attachments.map((a, i) => (
              <div key={a.file_id || i} className="w-[200px] sm:w-[240px] rounded-xl border border-white/60 bg-white/80 backdrop-blur-md shadow-sm overflow-hidden shrink-0">
                <div className="p-2">
                  {a.mime?.startsWith('image/') && a.local_preview_url ? (
                    <img src={a.local_preview_url} alt={a.filename} className="w-full h-28 object-cover rounded-lg border border-zinc-100" />
                  ) : (
                    <div className="w-full h-28 rounded-lg border border-zinc-100 bg-zinc-50 flex items-center justify-center">
                      {a.mime?.startsWith('image/') ? <FileImage size={26} className="text-blue-500" /> : <FileText size={24} className="text-zinc-400" />}
                    </div>
                  )}
                </div>
                <div className="px-2.5 pb-2.5">
                  <p className="text-xs font-medium text-zinc-700 truncate">{a.filename}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">{formatFileSize(a.size || 0)}</p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openFilePreview(a.file_id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                    >
                      <Eye size={12} /> {t.chatInput.openAttachment}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (a.local_preview_url) URL.revokeObjectURL(a.local_preview_url)
                        setAttachments(prev => prev.filter((_, j) => j !== i))
                      }}
                      className="ml-auto p-1 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title={t.chatInput.removeAttachment}
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {projectId && (
          <div className="mb-2">
            <span className="inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 rounded-full border border-cyan-200/80 bg-cyan-50/85 text-cyan-700 text-[11px] font-semibold shadow-sm">
              <FolderOpen size={12} className="shrink-0" />
              <span className="truncate">{projectName ? `${t.chatInput.projectIn}: ${projectName}` : t.chatInput.projectActive}</span>
            </span>
          </div>
        )}

        {/* Smart Suggestions */}
        <SmartSuggestions
          input={input}
          attachments={attachments}
          onApplySuggestion={handleApplySuggestion}
        />

        {/* Active tools indicator pills */}
        {activeToolsCount > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {webSearch && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full">
                <Globe size={10} /> {t.chatInput.web}
                <button onClick={() => setWebSearch(false)} className="ml-0.5 hover:text-blue-800"><X size={10} /></button>
              </span>
            )}
            {dbQuery && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full">
                <Database size={10} /> {t.chatInput.db}
                <button onClick={() => setDbQuery(false)} className="ml-0.5 hover:text-indigo-800"><X size={10} /></button>
              </span>
            )}
            {networkDriveRag && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full">
                <HardDrive size={10} /> {t.chatInput.net}
                <button onClick={() => setNetworkDriveRag(false)} className="ml-0.5 hover:text-emerald-800"><X size={10} /></button>
              </span>
            )}
            {imageGeneration && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 bg-purple-50 text-purple-600 border border-purple-100 rounded-full">
                <ImagePlus size={10} /> {t.chatInput.image}
                <button onClick={() => setImageGeneration(false)} className="ml-0.5 hover:text-purple-800"><X size={10} /></button>
              </span>
            )}
            {deepResearch && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 bg-amber-50 text-amber-600 border border-amber-100 rounded-full">
                <FlaskConical size={10} /> {t.chatInput.deepResearch}
                <button
                  onClick={() => setResearchMode(researchMode === 'standard' ? 'exhaustive' : 'standard')}
                  className="ml-1 px-1.5 py-0.5 bg-amber-100 hover:bg-amber-200 rounded text-[10px] font-semibold transition-colors"
                  title={researchMode === 'standard' ? 'Cambiar a modo exhaustivo (más profundo)' : 'Cambiar a modo estándar (más rápido)'}
                >
                  {researchMode === 'standard' ? '⚡ Rápido' : '🔬 Profundo'}
                </button>
                <button onClick={() => setDeepResearch(false)} className="ml-0.5 hover:text-amber-800"><X size={10} /></button>
              </span>
            )}
            {documentGeneration && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 bg-sky-50 text-sky-600 border border-sky-100 rounded-full">
                <FileText size={10} /> {t.chatInput.doc}
                <button onClick={() => setDocumentGeneration(false)} className="ml-0.5 hover:text-sky-800"><X size={10} /></button>
              </span>
            )}
            {spreadsheetAnalysis && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 bg-cyan-50 text-cyan-700 border border-cyan-100 rounded-full">
                <BarChart3 size={10} /> {t.chatInput.sheet}
                <button onClick={() => setSpreadsheetAnalysis(false)} className="ml-0.5 hover:text-cyan-800"><X size={10} /></button>
              </span>
            )}
            {codeInterpreter && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 bg-orange-50 text-orange-600 border border-orange-100 rounded-full">
                <Code2 size={10} /> Code
                <button onClick={() => setCodeInterpreter(false)} className="ml-0.5 hover:text-orange-800"><X size={10} /></button>
              </span>
            )}
          </div>
        )}

        <div
          className={`flex items-end gap-2 sm:gap-3 bg-white/70 backdrop-blur-xl border border-white/40 px-4 sm:px-5 py-2.5 sm:py-3 shadow-[0_8px_32px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.03] ${multiline ? 'rounded-2xl' : 'rounded-2xl sm:rounded-full'}`}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" />

          {/* Plus button with tools menu */}
          <div className="relative shrink-0" ref={toolsMenuRef}>
            <button onClick={() => setToolsOpen(!toolsOpen)}
              className={`p-2 rounded-xl transition-all duration-200 ${toolsOpen ? 'bg-zinc-200 text-zinc-700 rotate-45' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'} ${activeToolsCount > 0 ? 'text-blue-500' : ''}`}
              aria-label={t.chatInput.tools}>
              <Plus size={20} />
            </button>
            {activeToolsCount > 0 && !toolsOpen && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{activeToolsCount}</span>
            )}

            {/* Tools popup menu — desktop dropdown */}
            {toolsOpen && (
              <div className="hidden md:block absolute bottom-full left-0 mb-3 rounded-2xl p-1.5 min-w-[240px] z-[120] liquid-glass-dropdown menu-solid-panel"
                   style={{ animation: 'message-in 0.18s ease-out' }}>
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-3 pt-1.5 pb-1">{t.chatInput.tools}</p>
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="w-full text-left px-3 py-2.5 text-[13px] hover:bg-gradient-to-r hover:from-zinc-100 hover:to-zinc-50 flex items-center gap-3 text-zinc-700 transition-all duration-150 rounded-xl font-medium">
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} className="text-zinc-400" />}
                  {t.chatInput.attachFile}
                </button>
                <hr className="border-zinc-200/60 my-1 mx-2" />
                <button onClick={() => { setWebSearch(!webSearch) }}
                  className={`w-full text-left px-3 py-2.5 text-[13px] flex items-center gap-3 transition-all duration-150 rounded-xl font-medium ${webSearch ? 'bg-blue-50 text-blue-700 shadow-sm shadow-blue-100' : 'text-zinc-700 hover:bg-gradient-to-r hover:from-blue-50/80 hover:to-blue-50/30'}`}>
                  <Globe size={16} className={webSearch ? 'text-blue-500' : 'text-blue-400'} />
                  {t.chatInput.webSearch}
                  {webSearch && <Check size={14} className="ml-auto text-blue-500" />}
                </button>
                <button onClick={() => { setDbQuery(!dbQuery) }}
                  className={`w-full text-left px-3 py-2.5 text-[13px] flex items-center gap-3 transition-all duration-150 rounded-xl font-medium ${dbQuery ? 'bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-100' : 'text-zinc-700 hover:bg-gradient-to-r hover:from-indigo-50/80 hover:to-indigo-50/30'}`}>
                  <Database size={16} className={dbQuery ? 'text-indigo-500' : 'text-indigo-400'} />
                  {t.chatInput.database}
                  {dbQuery && <Check size={14} className="ml-auto text-indigo-500" />}
                </button>
                <button onClick={() => { setNetworkDriveRag(!networkDriveRag) }}
                  className={`w-full text-left px-3 py-2.5 text-[13px] flex items-center gap-3 transition-all duration-150 rounded-xl font-medium ${networkDriveRag ? 'bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100' : 'text-zinc-700 hover:bg-gradient-to-r hover:from-emerald-50/80 hover:to-emerald-50/30'}`}>
                  <HardDrive size={16} className={networkDriveRag ? 'text-emerald-500' : 'text-emerald-400'} />
                  {t.chatInput.networkDrive}
                  {networkDriveRag && <Check size={14} className="ml-auto text-emerald-500" />}
                </button>
                <button onClick={() => { setImageGeneration(!imageGeneration) }}
                  className={`w-full text-left px-3 py-2.5 text-[13px] flex items-center gap-3 transition-all duration-150 rounded-xl font-medium ${imageGeneration ? 'bg-purple-50 text-purple-700 shadow-sm shadow-purple-100' : 'text-zinc-700 hover:bg-gradient-to-r hover:from-purple-50/80 hover:to-purple-50/30'}`}>
                  <ImagePlus size={16} className={imageGeneration ? 'text-purple-500' : 'text-purple-400'} />
                  {t.chatInput.generateImage}
                  {imageGeneration && <Check size={14} className="ml-auto text-purple-500" />}
                </button>
                <hr className="border-zinc-200/60 my-1 mx-2" />
                <button onClick={() => { setDeepResearch(!deepResearch); if (!deepResearch) setWebSearch(true) }}
                  className={`w-full text-left px-3 py-2.5 text-[13px] flex items-center gap-3 transition-all duration-150 rounded-xl font-medium ${deepResearch ? 'bg-amber-50 text-amber-700 shadow-sm shadow-amber-100' : 'text-zinc-700 hover:bg-gradient-to-r hover:from-amber-50/80 hover:to-amber-50/30'}`}>
                  <FlaskConical size={16} className={deepResearch ? 'text-amber-500' : 'text-amber-400'} />
                  {t.chatInput.deepResearch}
                  {deepResearch && <Check size={14} className="ml-auto text-amber-500" />}
                </button>
                <button onClick={() => { setDocumentGeneration(!documentGeneration) }}
                  className={`w-full text-left px-3 py-2.5 text-[13px] flex items-center gap-3 transition-all duration-150 rounded-xl font-medium ${documentGeneration ? 'bg-sky-50 text-sky-700 shadow-sm shadow-sky-100' : 'text-zinc-700 hover:bg-gradient-to-r hover:from-sky-50/80 hover:to-sky-50/30'}`}>
                  <FileText size={16} className={documentGeneration ? 'text-sky-500' : 'text-sky-400'} />
                  {t.chatInput.generateDocument}
                  {documentGeneration && <Check size={14} className="ml-auto text-sky-500" />}
                </button>
                <button onClick={() => { setSpreadsheetAnalysis(!spreadsheetAnalysis) }}
                  className={`w-full text-left px-3 py-2.5 text-[13px] flex items-center gap-3 transition-all duration-150 rounded-xl font-medium ${spreadsheetAnalysis ? 'bg-cyan-50 text-cyan-700 shadow-sm shadow-cyan-100' : 'text-zinc-700 hover:bg-gradient-to-r hover:from-cyan-50/80 hover:to-cyan-50/30'}`}>
                  <BarChart3 size={16} className={spreadsheetAnalysis ? 'text-cyan-500' : 'text-cyan-400'} />
                  {t.chatInput.spreadsheetAnalysis}
                  {spreadsheetAnalysis && <Check size={14} className="ml-auto text-cyan-500" />}
                </button>
                <button onClick={() => { setCodeInterpreter(!codeInterpreter) }}
                  className={`w-full text-left px-3 py-2.5 text-[13px] flex items-center gap-3 transition-all duration-150 rounded-xl font-medium ${codeInterpreter ? 'bg-orange-50 text-orange-700 shadow-sm shadow-orange-100' : 'text-zinc-700 hover:bg-gradient-to-r hover:from-orange-50/80 hover:to-orange-50/30'}`}>
                  <Code2 size={16} className={codeInterpreter ? 'text-orange-500' : 'text-orange-400'} />
                  Code Interpreter
                  {codeInterpreter && <Check size={14} className="ml-auto text-orange-500" />}
                </button>
              </div>
            )}
          </div>

          <textarea ref={textareaRef} value={input} onChange={(e) => { setInput(e.target.value); autoResize() }}
            onKeyDown={handleKeyDown} onPaste={handleTextareaPaste} placeholder={inputPlaceholder}
            className={`flex-1 bg-transparent text-base text-zinc-800 placeholder-zinc-400 resize-none max-h-[160px] sm:max-h-[200px] overflow-y-auto focus:outline-none py-1 ${isListening ? 'placeholder-red-400' : ''}`}
            rows={1} />

          {/* TTS toggle */}
          <button onClick={() => {
            setTtsEnabled(!ttsEnabled)
            if (ttsEnabled && 'speechSynthesis' in window) window.speechSynthesis.cancel()
          }}
            className={`p-2 rounded-xl transition-all duration-200 shrink-0 ${ttsEnabled ? 'text-blue-500 bg-blue-50' : 'text-zinc-400 hover:text-zinc-600'}`}
            aria-label={ttsEnabled ? t.chatInput.ttsOn : t.chatInput.ttsOff} title={ttsEnabled ? t.chatInput.ttsEnabled : t.chatInput.ttsDisabled}>
            {ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          {/* Microphone button for STT */}
          <button onClick={toggleListening}
            className={`p-2 rounded-xl transition-all duration-200 shrink-0 ${isListening ? 'text-white bg-red-500 animate-pulse' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'}`}
            aria-label={isListening ? t.chatInput.stopListening : t.chatInput.speak} title={isListening ? t.chatInput.listening : t.chatInput.speak}>
            {isListening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>

          {/* Send/stop button with animation */}
          {isStreaming ? (
            <button onClick={handleStop}
              className="p-2.5 text-white bg-red-500 hover:bg-red-600 rounded-xl transition-all duration-300 shrink-0 hover:scale-105 active:scale-95"
              aria-label={t.chatInput.stop}>
              <Square size={18} className="animate-pulse" />
            </button>
          ) : (
            <button onClick={handleSend} disabled={uploading || (!input.trim() && attachments.length === 0)}
              className={`p-2.5 text-white rounded-xl transition-all duration-300 shrink-0 hover:scale-105 active:scale-95 ${
                input.trim() || attachments.length > 0
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 shadow-md shadow-blue-500/25'
                  : 'bg-zinc-300'
              }`}
              style={input.trim() ? { animation: 'send-ready 2s ease-in-out infinite' } : undefined}
              aria-label={t.chatInput.sendEnter}>
              <Send size={18} />
            </button>
          )}
        </div>
        <p className="hidden md:block text-[10px] text-zinc-400 mt-1.5 text-center">{t.chatInput.disclaimer}</p>
      </div>

      {/* Tools popup menu — mobile bottom sheet */}
      {toolsOpen && (
        <div className="md:hidden pointer-events-auto">
          <div
            className="fixed inset-0 z-[160] bg-black/35 backdrop-blur-[2px]"
            onClick={() => setToolsOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={toolsSheetRef}
            className="fixed left-0 right-0 bottom-0 z-[170] px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]"
            style={{ animation: 'message-in 0.18s ease-out' }}
          >
            <div className="liquid-glass-dropdown menu-solid-panel rounded-3xl p-2 shadow-[0_20px_60px_rgba(15,23,42,0.25)] border border-white/70">
              <div className="flex items-center justify-between px-2.5 py-2">
                <p className="text-[11px] font-bold text-zinc-600 tracking-tight">{t.chatInput.tools}</p>
                <button
                  type="button"
                  onClick={() => setToolsOpen(false)}
                  className="p-2 rounded-xl text-zinc-500 hover:bg-white/60"
                  aria-label="Cerrar"
                >
                  <X size={16} />
                </button>
              </div>

              <button
                onClick={() => { setToolsOpen(false); fileInputRef.current?.click() }}
                disabled={uploading}
                className="w-full text-left px-3 py-3 text-[15px] hover:bg-white/60 flex items-center gap-3 text-zinc-800 transition-colors rounded-2xl font-semibold"
              >
                {uploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} className="text-zinc-500" />}
                {t.chatInput.attachFile}
              </button>

              <hr className="border-white/40 my-2 mx-2" />

              <button
                onClick={() => { setWebSearch(!webSearch) }}
                className={`w-full text-left px-3 py-3 text-[15px] flex items-center gap-3 transition-colors rounded-2xl font-semibold ${
                  webSearch ? 'bg-blue-50/80 text-blue-700' : 'text-zinc-800 hover:bg-white/60'
                }`}
              >
                <Globe size={18} className={webSearch ? 'text-blue-600' : 'text-blue-500'} />
                {t.chatInput.webSearch}
                {webSearch && <Check size={16} className="ml-auto text-blue-600" />}
              </button>
              <button
                onClick={() => { setDbQuery(!dbQuery) }}
                className={`w-full text-left px-3 py-3 text-[15px] flex items-center gap-3 transition-colors rounded-2xl font-semibold ${
                  dbQuery ? 'bg-indigo-50/80 text-indigo-700' : 'text-zinc-800 hover:bg-white/60'
                }`}
              >
                <Database size={18} className={dbQuery ? 'text-indigo-600' : 'text-indigo-500'} />
                {t.chatInput.database}
                {dbQuery && <Check size={16} className="ml-auto text-indigo-600" />}
              </button>
              <button
                onClick={() => { setNetworkDriveRag(!networkDriveRag) }}
                className={`w-full text-left px-3 py-3 text-[15px] flex items-center gap-3 transition-colors rounded-2xl font-semibold ${
                  networkDriveRag ? 'bg-emerald-50/80 text-emerald-700' : 'text-zinc-800 hover:bg-white/60'
                }`}
              >
                <HardDrive size={18} className={networkDriveRag ? 'text-emerald-600' : 'text-emerald-500'} />
                {t.chatInput.networkDrive}
                {networkDriveRag && <Check size={16} className="ml-auto text-emerald-600" />}
              </button>
              <button
                onClick={() => { setImageGeneration(!imageGeneration) }}
                className={`w-full text-left px-3 py-3 text-[15px] flex items-center gap-3 transition-colors rounded-2xl font-semibold ${
                  imageGeneration ? 'bg-purple-50/80 text-purple-700' : 'text-zinc-800 hover:bg-white/60'
                }`}
              >
                <ImagePlus size={18} className={imageGeneration ? 'text-purple-600' : 'text-purple-500'} />
                {t.chatInput.generateImage}
                {imageGeneration && <Check size={16} className="ml-auto text-purple-600" />}
              </button>

              <hr className="border-white/40 my-2 mx-2" />

              <button
                onClick={() => { setDeepResearch(!deepResearch); if (!deepResearch) setWebSearch(true) }}
                className={`w-full text-left px-3 py-3 text-[15px] flex items-center gap-3 transition-colors rounded-2xl font-semibold ${
                  deepResearch ? 'bg-amber-50/80 text-amber-700' : 'text-zinc-800 hover:bg-white/60'
                }`}
              >
                <FlaskConical size={18} className={deepResearch ? 'text-amber-600' : 'text-amber-500'} />
                {t.chatInput.deepResearch}
                {deepResearch && <Check size={16} className="ml-auto text-amber-600" />}
              </button>
              <button
                onClick={() => { setDocumentGeneration(!documentGeneration) }}
                className={`w-full text-left px-3 py-3 text-[15px] flex items-center gap-3 transition-colors rounded-2xl font-semibold ${
                  documentGeneration ? 'bg-sky-50/80 text-sky-700' : 'text-zinc-800 hover:bg-white/60'
                }`}
              >
                <FileText size={18} className={documentGeneration ? 'text-sky-600' : 'text-sky-500'} />
                {t.chatInput.generateDocument}
                {documentGeneration && <Check size={16} className="ml-auto text-sky-600" />}
              </button>
              <button
                onClick={() => { setSpreadsheetAnalysis(!spreadsheetAnalysis) }}
                className={`w-full text-left px-3 py-3 text-[15px] flex items-center gap-3 transition-colors rounded-2xl font-semibold ${
                  spreadsheetAnalysis ? 'bg-cyan-50/80 text-cyan-800' : 'text-zinc-800 hover:bg-white/60'
                }`}
              >
                <BarChart3 size={18} className={spreadsheetAnalysis ? 'text-cyan-700' : 'text-cyan-600'} />
                {t.chatInput.spreadsheetAnalysis}
                {spreadsheetAnalysis && <Check size={16} className="ml-auto text-cyan-700" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

