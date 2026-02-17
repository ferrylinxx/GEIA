'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { isValidElement } from 'react'
import { Message, MessageVersion, ChunkSource } from '@/lib/types'
import { useChatStore } from '@/store/chat-store'
import { useUIStore } from '@/store/ui-store'
import { createClient } from '@/lib/supabase/client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import {
  Copy,
  Check,
  Pencil,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  FileText,
  Paperclip,
  Eye,
  Globe,
  ExternalLink,
  Trash2,
  Clipboard,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  WrapText,
  Loader2,
  HardDrive,
} from 'lucide-react'
import Image from 'next/image'
import type { Components } from 'react-markdown'
import { useTranslation } from '@/i18n/LanguageContext'
import CodeExecutionBlock from './CodeExecutionBlock'

interface AttachmentPreview {
  file_id: string
  filename: string
  mime: string
  size: number
  signed_url: string | null
}

interface CodeExecution {
  code: string
  output?: string
  error?: string
  execution_time_ms?: number
  status?: 'pending' | 'running' | 'completed' | 'failed'
}

interface DeepResearchImagePreview {
  image_url: string
  source_url: string
  source_title: string
}

interface UserMessageVersion {
  version_index: number
  content: string
}

const attachmentPreviewCache = new Map<string, AttachmentPreview>()

function getImageUrl(message: Message): string | null {
  const url = message.meta_json?.image_url
  return typeof url === 'string' && url.trim().length > 0 ? url : null
}

function getImagePrompt(message: Message): string | null {
  const prompt = message.meta_json?.image_prompt
  return typeof prompt === 'string' && prompt.trim().length > 0 ? prompt : null
}

function getDeepResearchImages(message: Message): DeepResearchImagePreview[] {
  const raw = message.meta_json?.deep_research_images
  if (!Array.isArray(raw)) return []

  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const candidate = item as Record<string, unknown>
      const imageUrl = typeof candidate.image_url === 'string' ? candidate.image_url.trim() : ''
      const sourceUrl = typeof candidate.source_url === 'string' ? candidate.source_url.trim() : ''
      const sourceTitle = typeof candidate.source_title === 'string' ? candidate.source_title.trim() : sourceUrl
      if (!imageUrl || !sourceUrl) return null
      return {
        image_url: imageUrl,
        source_url: sourceUrl,
        source_title: sourceTitle || sourceUrl,
      }
    })
    .filter((item): item is DeepResearchImagePreview => Boolean(item))
    .slice(0, 4)
}

function getWebSearchImages(message: Message): DeepResearchImagePreview[] {
  const raw = message.meta_json?.web_search_images
  if (!Array.isArray(raw)) return []

  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const candidate = item as Record<string, unknown>
      const imageUrl = typeof candidate.image_url === 'string' ? candidate.image_url.trim() : ''
      const sourceUrl = typeof candidate.source_url === 'string' ? candidate.source_url.trim() : ''
      const sourceTitle = typeof candidate.source_title === 'string' ? candidate.source_title.trim() : sourceUrl
      if (!imageUrl || !sourceUrl) return null
      return {
        image_url: imageUrl,
        source_url: sourceUrl,
        source_title: sourceTitle || sourceUrl,
      }
    })
    .filter((item): item is DeepResearchImagePreview => Boolean(item))
    .slice(0, 4)
}

function getSpreadsheetCharts(message: Message): DeepResearchImagePreview[] {
  const raw = message.meta_json?.spreadsheet_charts
  if (!Array.isArray(raw)) return []

  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const candidate = item as Record<string, unknown>
      const imageUrl = typeof candidate.image_url === 'string' ? candidate.image_url.trim() : ''
      const sourceUrl = typeof candidate.source_url === 'string' ? candidate.source_url.trim() : imageUrl
      const sourceTitle = typeof candidate.source_title === 'string' ? candidate.source_title.trim() : 'Grafico'
      if (!imageUrl) return null
      return {
        image_url: imageUrl,
        source_url: sourceUrl || imageUrl,
        source_title: sourceTitle || 'Grafico',
      }
    })
    .filter((item): item is DeepResearchImagePreview => Boolean(item))
    .slice(0, 4)
}

function getCodeExecutions(message: Message): CodeExecution[] {
  const raw = message.meta_json?.code_executions
  if (!Array.isArray(raw)) return []

  return raw
    .map((item): CodeExecution | null => {
      if (!item || typeof item !== 'object') return null
      const candidate = item as Record<string, unknown>
      const code = typeof candidate.code === 'string' ? candidate.code : ''
      if (!code) return null
      return {
        code,
        output: typeof candidate.output === 'string' ? candidate.output : undefined,
        error: typeof candidate.error === 'string' ? candidate.error : undefined,
        execution_time_ms: typeof candidate.execution_time_ms === 'number' ? candidate.execution_time_ms : undefined,
        status: (typeof candidate.status === 'string' ? candidate.status : 'completed') as CodeExecution['status'],
      }
    })
    .filter((item): item is CodeExecution => item !== null)
}

function getSourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return url
  }
}

async function triggerDownload(url: string, filename: string) {
  try {
    const response = await fetch(url)
    if (response.ok) {
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = blobUrl
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
      return
    }
  } catch {
    // fallback below
  }

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener noreferrer'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

async function copyImageToClipboard(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Image fetch failed')
  const blob = await response.blob()
  await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })])
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function buildUserMessageVersions(
  edits: Array<{ previous_content?: string | null; new_content?: string | null }> | null | undefined,
  currentContent: string,
  currentEditVersion?: number | null,
): UserMessageVersion[] {
  const normalizedCurrent = (currentContent || '').trim()
  const sanitizedEdits = (edits || []).map((item) => ({
    previous_content: (item.previous_content || '').trim(),
    new_content: (item.new_content || '').trim(),
  }))

  if (sanitizedEdits.length === 0) {
    return [{
      version_index: Math.max(1, Math.floor(Number(currentEditVersion) || 1)),
      content: normalizedCurrent || currentContent || '',
    }]
  }

  const rawVersions: string[] = []
  if (sanitizedEdits[0].previous_content) {
    rawVersions.push(sanitizedEdits[0].previous_content)
  }
  for (const edit of sanitizedEdits) {
    rawVersions.push(edit.new_content || '')
  }

  if (rawVersions.length === 0) {
    rawVersions.push(normalizedCurrent || currentContent || '')
  }

  const targetVersion = Math.max(
    1,
    Math.floor(Number(currentEditVersion) || rawVersions.length),
  )
  const startVersion = Math.max(1, targetVersion - rawVersions.length + 1)
  const mapped = rawVersions.map((content, idx) => ({
    version_index: startVersion + idx,
    content,
  }))

  if (mapped.length > 0) {
    mapped[mapped.length - 1] = {
      ...mapped[mapped.length - 1],
      content: normalizedCurrent || mapped[mapped.length - 1].content,
    }
  }

  return mapped
}

function resolveVersionIndexByNumber(
  versions: Array<{ version_index: number }>,
  requestedVersion: number | null | undefined,
): number {
  if (versions.length === 0) return 0
  if (!Number.isFinite(Number(requestedVersion))) return versions.length - 1

  const target = Math.floor(Number(requestedVersion))
  const exact = versions.findIndex((item) => Number(item.version_index) === target)
  if (exact >= 0) return exact

  // Backward compatibility with old index-based overrides from in-memory state.
  if (target >= 0 && target < versions.length) return target

  if (target <= Number(versions[0].version_index)) return 0
  if (target >= Number(versions[versions.length - 1].version_index)) return versions.length - 1

  let fallback = 0
  for (let i = 0; i < versions.length; i++) {
    if (Number(versions[i].version_index) <= target) fallback = i
  }
  return fallback
}

function extractTextFromReactNode(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractTextFromReactNode).join('')
  if (isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode }
    return extractTextFromReactNode(props.children)
  }
  if (typeof node === 'object') {
    const maybeNode = node as { value?: unknown; raw?: unknown; children?: unknown }
    if (typeof maybeNode.value === 'string' || typeof maybeNode.value === 'number') {
      return String(maybeNode.value)
    }
    if (typeof maybeNode.raw === 'string' || typeof maybeNode.raw === 'number') {
      return String(maybeNode.raw)
    }
    if (maybeNode.children !== undefined) {
      return extractTextFromReactNode(maybeNode.children as React.ReactNode)
    }
  }
  return ''
}

function CodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const [copiedPlain, setCopiedPlain] = useState(false)
  const [copiedFull, setCopiedFull] = useState(false)
  const [wrapped, setWrapped] = useState(false)
  const codeRef = useRef<HTMLElement>(null)

  const lang = className?.replace('language-', '') || ''
  const fallbackCode = extractTextFromReactNode(children).replace(/\n$/, '')
  const readCode = () => codeRef.current?.textContent?.replace(/\n$/, '') || fallbackCode

  const handleCopyPlain = async () => {
    await navigator.clipboard.writeText(readCode())
    setCopiedPlain(true)
    setTimeout(() => setCopiedPlain(false), 1800)
  }

  const handleCopyFull = async () => {
    const code = readCode()
    const fullBlock = `\`\`\`${lang}\n${code}\n\`\`\``
    await navigator.clipboard.writeText(fullBlock)
    setCopiedFull(true)
    setTimeout(() => setCopiedFull(false), 1800)
  }

  return (
    <div className="code-block-wrapper">
      <div className="code-header">
        <span>{lang || 'codigo'}</span>
        <div className="code-actions">
          <button onClick={() => setWrapped((prev) => !prev)} title={wrapped ? 'No ajustar lineas' : 'Ajustar lineas'}>
            <WrapText size={12} /> {wrapped ? 'No wrap' : 'Wrap'}
          </button>
          <button onClick={handleCopyPlain} title="Copiar sin formato">
            {copiedPlain ? <><ClipboardCheck size={12} /> Plano</> : <><Clipboard size={12} /> Plano</>}
          </button>
          <button onClick={handleCopyFull} title="Copiar bloque completo">
            {copiedFull ? <><Check size={12} /> Bloque</> : <><Copy size={12} /> Bloque</>}
          </button>
        </div>
      </div>
      <pre className={wrapped ? 'code-pre-wrap' : 'code-pre-nowrap'}>
        <code ref={codeRef as React.RefObject<HTMLElement>} className={className}>{children}</code>
      </pre>
    </div>
  )
}

const markdownComponents: Components = {
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children, ...props }) => {
    const text = extractTextFromReactNode(children)
    const isBlock = className?.startsWith('language-') || text.includes('\n')
    if (isBlock) return <CodeBlock className={className}>{children}</CodeBlock>
    return <code className={className} {...props}>{children}</code>
  },
}

interface Props { message: Message }

export default function MessageBubble({ message }: Props) {
  const { t } = useTranslation()
  const [isEditing, setIsEditing] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const [copied, setCopied] = useState(false)
  const [assistantVersions, setAssistantVersions] = useState<MessageVersion[]>([])
  const [activeAssistantVersionIdx, setActiveAssistantVersionIdx] = useState(0)
  const [userVersions, setUserVersions] = useState<UserMessageVersion[]>([])
  const [activeUserVersionIdx, setActiveUserVersionIdx] = useState(0)
  const [regeneratingVariant, setRegeneratingVariant] = useState(false)
  const [attachmentPreviews, setAttachmentPreviews] = useState<AttachmentPreview[]>([])

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const {
    messages,
    updateMessage,
    setIsStreaming,
    setStreamingConversationId,
    setStreamingContent,
    setStreamAbortController,
    activeConversationId,
    selectedModel,
    ragMode,
    citeMode,
    webSearch,
    removeMessagesAfter,
    loadMessages,
    assistantVersionOverrides,
    setAssistantVersionOverride,
  } = useChatStore()

  const { openFilePreview, openImagePreview, showConfirm } = useUIStore()

  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const sources: ChunkSource[] = message.sources_json || []
  const rawAttachments = useMemo(
    () => (Array.isArray(message.attachments_json) ? message.attachments_json : []),
    [message.attachments_json]
  )

  const generatedImageUrl = isAssistant ? getImageUrl(message) : null
  const generatedImagePrompt = isAssistant ? getImagePrompt(message) : null
  const deepResearchImages = useMemo(
    () => (isAssistant ? getDeepResearchImages(message) : []),
    [isAssistant, message]
  )
  const webSearchImages = useMemo(
    () => (isAssistant ? getWebSearchImages(message) : []),
    [isAssistant, message]
  )
  const spreadsheetCharts = useMemo(
    () => (isAssistant ? getSpreadsheetCharts(message) : []),
    [isAssistant, message]
  )
  const codeExecutions = useMemo(
    () => (isAssistant ? getCodeExecutions(message) : []),
    [isAssistant, message]
  )
  const relatedSearchImages = deepResearchImages.length > 0 ? deepResearchImages : webSearchImages
  const relatedSearchImageUrls = useMemo(
    () => relatedSearchImages.map((image) => image.image_url),
    [relatedSearchImages]
  )
  const spreadsheetChartUrls = useMemo(
    () => spreadsheetCharts.map((chart) => chart.image_url),
    [spreadsheetCharts]
  )
  const messageTime = useMemo(() => {
    return new Date(message.created_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  }, [message.created_at])

  const imageEntries = useMemo(() => {
    return (messages || [])
      .map((msg) => {
        const url = getImageUrl(msg)
        if (!url) return null
        return {
          messageId: msg.id,
          url,
          prompt: getImagePrompt(msg),
        }
      })
      .filter((entry): entry is { messageId: string; url: string; prompt: string | null } => Boolean(entry))
  }, [messages])

  const imageUrls = useMemo(() => imageEntries.map((entry) => entry.url), [imageEntries])

  const currentImageIndex = useMemo(() => {
    if (!generatedImageUrl) return -1
    return imageEntries.findIndex((entry) => entry.messageId === message.id && entry.url === generatedImageUrl)
  }, [generatedImageUrl, imageEntries, message.id])

  const pairedAssistantMessageId = useMemo(() => {
    if (!isUser) return null
    const idx = (messages || []).findIndex((item) => item.id === message.id)
    if (idx < 0) return null
    for (let i = idx + 1; i < messages.length; i++) {
      const candidate = messages[i]
      if (candidate.role === 'assistant') return candidate.id
      if (candidate.role === 'user') break
    }
    return null
  }, [isUser, message.id, messages])

  const forcedAssistantVersion = isAssistant ? assistantVersionOverrides[message.id] : undefined

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length)
    }
  }, [isEditing])

  useEffect(() => {
    if (!isEditing) {
      setEditContent(message.content || '')
    }
  }, [message.content, isEditing])

  useEffect(() => {
    if (!isAssistant) return
    const supabase = createClient()
    supabase
      .from('message_versions')
      .select('*')
      .eq('message_id', message.id)
      .order('version_index')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setAssistantVersions(data)
          setActiveAssistantVersionIdx(data.length - 1)
        }
      })
  }, [isAssistant, message.id])

  useEffect(() => {
    if (!isAssistant || assistantVersions.length === 0) return
    if (!Number.isFinite(Number(forcedAssistantVersion))) return
    const resolvedIdx = resolveVersionIndexByNumber(
      assistantVersions.map((item) => ({ version_index: Number(item.version_index) || 1 })),
      Number(forcedAssistantVersion),
    )
    if (resolvedIdx !== activeAssistantVersionIdx) {
      setActiveAssistantVersionIdx(resolvedIdx)
    }
  }, [isAssistant, assistantVersions, forcedAssistantVersion, activeAssistantVersionIdx])

  useEffect(() => {
    if (!isUser) return
    const supabase = createClient()

    const loadUserVersions = async () => {
      try {
        const { data } = await supabase
          .from('message_edits')
          .select('id, previous_content, new_content, edited_at')
          .eq('message_id', message.id)
          .order('edited_at', { ascending: true })
          .order('id', { ascending: true })

        const computed = buildUserMessageVersions(
          (data || []) as Array<{ previous_content?: string | null; new_content?: string | null }>,
          message.content || '',
          message.edit_version,
        )
        setUserVersions(computed)
        setActiveUserVersionIdx(resolveVersionIndexByNumber(computed, message.edit_version))
      } catch (error) {
        console.error('Error loading user message versions:', error)
        const fallback = buildUserMessageVersions([], message.content || '', message.edit_version)
        setUserVersions(fallback)
        setActiveUserVersionIdx(resolveVersionIndexByNumber(fallback, message.edit_version))
      }
    }

    void loadUserVersions()
  }, [isUser, message.id, message.content, message.edit_version])

  useEffect(() => {
    let cancelled = false

    if (!rawAttachments || rawAttachments.length === 0) {
      setAttachmentPreviews([])
      return
    }

    const loadAttachmentPreviews = async () => {
      const supabase = createClient()
      const ids = Array.from(new Set(rawAttachments
        .map((attachment) => attachment?.file_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)))

      const cached = ids
        .map((id) => attachmentPreviewCache.get(id))
        .filter((item): item is AttachmentPreview => Boolean(item))

      const missingIds = ids.filter((id) => !attachmentPreviewCache.has(id))
      const recordMap = new Map<string, {
        id: string
        filename: string
        mime: string | null
        size: number | null
        storage_path: string
      }>()

      if (missingIds.length > 0) {
        const { data: records } = await supabase
          .from('files')
          .select('id, filename, mime, size, storage_path')
          .in('id', missingIds)

        for (const record of records || []) {
          recordMap.set(record.id, record)
        }
      }

      for (const attachment of rawAttachments) {
        if (!attachment?.file_id || attachmentPreviewCache.has(attachment.file_id)) continue

        const dbRecord = recordMap.get(attachment.file_id)
        const filename = dbRecord?.filename || attachment.filename || 'archivo'
        const mime = dbRecord?.mime || attachment.mime || 'application/octet-stream'
        const size = typeof dbRecord?.size === 'number'
          ? dbRecord.size
          : (typeof attachment.size === 'number' ? attachment.size : 0)

        let signedUrl: string | null = null
        const storagePath = dbRecord?.storage_path || attachment.storage_path
        if (storagePath) {
          const { data: signed } = await supabase.storage
            .from('user-files')
            .createSignedUrl(storagePath, 3600)
          signedUrl = signed?.signedUrl || null
        }

        attachmentPreviewCache.set(attachment.file_id, {
          file_id: attachment.file_id,
          filename,
          mime,
          size,
          signed_url: signedUrl,
        })
      }

      if (cancelled) return

      const ordered = rawAttachments
        .map((attachment) => attachment?.file_id ? attachmentPreviewCache.get(attachment.file_id) : null)
        .filter((item): item is AttachmentPreview => Boolean(item))

      setAttachmentPreviews(ordered.length > 0 ? ordered : cached)
    }

    loadAttachmentPreviews().catch((err) => {
      if (!cancelled) console.error('Attachment preview error:', err)
    })

    return () => {
      cancelled = true
    }
  }, [rawAttachments])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleOpenImagePreview = () => {
    if (!generatedImageUrl) return
    const urls = imageUrls.length > 0 ? imageUrls : [generatedImageUrl]
    const index = currentImageIndex >= 0 ? currentImageIndex : Math.max(urls.indexOf(generatedImageUrl), 0)
    openImagePreview(urls, index, generatedImagePrompt)
  }

  const handleOpenDeepResearchImage = (index: number) => {
    if (relatedSearchImageUrls.length === 0) return
    openImagePreview(relatedSearchImageUrls, index, 'Imagenes relacionadas')
  }

  const handleOpenSpreadsheetChart = (index: number) => {
    if (spreadsheetChartUrls.length === 0) return
    openImagePreview(spreadsheetChartUrls, index, 'Graficos automáticos')
  }

  const handleCopyImage = async () => {
    if (!generatedImageUrl) return
    try {
      await copyImageToClipboard(generatedImageUrl)
    } catch {
      await navigator.clipboard.writeText(generatedImageUrl)
    }
  }

  const handleOpenImageExternal = () => {
    if (!generatedImageUrl) return
    window.open(generatedImageUrl, '_blank', 'noopener,noreferrer')
  }

  const handleDownloadImage = async () => {
    if (!generatedImageUrl) return
    await triggerDownload(generatedImageUrl, `imagen-${message.id.slice(0, 8)}.png`)
  }

  const handleRegenerateVariant = async () => {
    if (!activeConversationId || regeneratingVariant) return
    const basePrompt = (generatedImagePrompt || message.content || '').trim()
    if (!basePrompt) return

    setRegeneratingVariant(true)
    setIsStreaming(true)
    setStreamingConversationId(activeConversationId)
    setStreamingContent('')
    const controller = new AbortController()
    setStreamAbortController(controller)

    try {
      const variantPrompt = `Genera una variante visual de esta imagen manteniendo su estilo base: ${basePrompt}`
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: activeConversationId,
          input: variantPrompt,
          model: selectedModel,
          rag_mode: ragMode,
          cite_mode: citeMode,
          web_search: webSearch,
          image_generation: true,
        }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) return

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let full = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true })
        setStreamingContent(full.replace('\n__TITLE_UPDATED__', ''))
      }

      if (full.includes('__TITLE_UPDATED__')) {
        useChatStore.getState().loadConversations()
      }
    } catch (error) {
      console.error('Image variant error:', error)
    } finally {
      if (activeConversationId) await loadMessages(activeConversationId, { silent: true })
      setIsStreaming(false)
      setStreamingConversationId(null)
      setStreamingContent('')
      setStreamAbortController(null)
      setRegeneratingVariant(false)
    }
  }

  const handleEditSave = async () => {
    if (editContent.trim() === message.content) {
      setIsEditing(false)
      return
    }
    const conversationIdForEdit = activeConversationId || message.conversation_id
    if (!conversationIdForEdit || savingEdit) return

    setSavingEdit(true)
    const requestedContent = editContent.trim()
    let targetMessageId = message.id

    const sendEdit = async (messageId: string) => {
      return fetch('/api/messages/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_id: messageId,
          conversation_id: conversationIdForEdit,
          new_content: requestedContent,
        }),
      })
    }

    try {
      let editRes = await sendEdit(targetMessageId)

      // Fallback for optimistic user message ids that are not persisted yet.
      if (editRes.status === 404) {
        await loadMessages(conversationIdForEdit, { silent: true })
        const refreshedMessages = useChatStore.getState().messages
        const originalTime = new Date(message.created_at).getTime()

        const candidate = refreshedMessages
          .filter((item) => item.role === 'user' && item.content.trim() === message.content.trim())
          .sort((a, b) => {
            const aDiff = Math.abs(new Date(a.created_at).getTime() - originalTime)
            const bDiff = Math.abs(new Date(b.created_at).getTime() - originalTime)
            return aDiff - bDiff
          })[0]

        if (candidate) {
          targetMessageId = candidate.id
          editRes = await sendEdit(targetMessageId)
        }
      }

      if (!editRes.ok) {
        const err = await editRes.json().catch(() => ({}))
        console.error('Error editing message:', err?.error || editRes.statusText)
        return
      }

      const payload = await editRes.json().catch(() => ({}))
      const editedAt = typeof payload?.edited_at === 'string'
        ? payload.edited_at
        : new Date().toISOString()
      const nextVersion = Number.isFinite(Number(payload?.edit_version))
        ? Number(payload.edit_version)
        : (message.edit_version || 0) + 1
      const regenTargetMessageId = typeof payload?.regen_target_message_id === 'string' && payload.regen_target_message_id.length > 0
        ? payload.regen_target_message_id
        : undefined

      updateMessage(targetMessageId, {
        content: requestedContent,
        edited_at: editedAt,
        edit_version: nextVersion,
      })

      const optimisticVersions: UserMessageVersion[] = userVersions.length > 0
        ? [...userVersions]
        : [{
            version_index: Math.max(1, Math.floor(Number(message.edit_version) || 1)),
            content: (message.content || '').trim(),
          }]

      const existingVersionIdx = optimisticVersions.findIndex((item) => item.version_index === nextVersion)
      if (existingVersionIdx >= 0) {
        optimisticVersions[existingVersionIdx] = { version_index: nextVersion, content: requestedContent }
      } else {
        optimisticVersions.push({ version_index: nextVersion, content: requestedContent })
      }
      optimisticVersions.sort((a, b) => a.version_index - b.version_index)
      const nextActiveIdx = resolveVersionIndexByNumber(optimisticVersions, nextVersion)

      setUserVersions(optimisticVersions)
      setActiveUserVersionIdx(nextActiveIdx)
      setEditContent(requestedContent)
      setIsEditing(false)
      removeMessagesAfter(targetMessageId)
      if (pairedAssistantMessageId) {
        setAssistantVersionOverride(pairedAssistantMessageId, nextVersion)
      }

      await regenerateFromHere(requestedContent, true, regenTargetMessageId)
      await loadMessages(conversationIdForEdit, { silent: true })
    } catch (error) {
      console.error('Error saving edited message:', error)
    } finally {
      setSavingEdit(false)
    }
  }

  const handleEditKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setIsEditing(false)
      setEditContent(displayContent)
    }
    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault()
      handleEditSave()
    }
  }

  const handleDelete = async () => {
    if (!activeConversationId) return
    const supabase = createClient()
    const allMessages = useChatStore.getState().messages
    const messageIndex = allMessages.findIndex((msg) => msg.id === message.id)
    if (messageIndex < 0) return

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('conversation_id', activeConversationId)
      .gte('created_at', message.created_at)

    if (error) console.error('Error deleting messages:', error)

    if (messageIndex === 0) {
      useChatStore.getState().clearMessages()
    } else {
      const previousMessage = allMessages[messageIndex - 1]
      removeMessagesAfter(previousMessage.id)
    }
  }

  const regenerateFromHere = async (content?: string, skipUserSave?: boolean, regenerateMessageId?: string) => {
    const conversationId = activeConversationId || message.conversation_id
    if (!conversationId) return

    setIsStreaming(true)
    setStreamingConversationId(conversationId)
    setStreamingContent('')
    const controller = new AbortController()
    setStreamAbortController(controller)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          input: content || message.content,
          model: selectedModel,
          rag_mode: ragMode,
          cite_mode: citeMode,
          web_search: webSearch,
          regenerate_message_id: regenerateMessageId || (isAssistant ? message.id : undefined),
          skip_user_save: skipUserSave || false,
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const errText = await res.text()
        console.error('Chat API error:', res.status, errText)
        return
      }

      if (!res.body) return

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let full = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true })
        setStreamingContent(full.replace('\n__TITLE_UPDATED__', ''))
      }

      if (full.includes('__TITLE_UPDATED__')) {
        useChatStore.getState().loadConversations()
      }
    } catch (error) {
      console.error('Regeneration error:', error)
    } finally {
      await loadMessages(conversationId, { silent: true })
      setIsStreaming(false)
      setStreamingConversationId(null)
      setStreamingContent('')
      setStreamAbortController(null)
    }
  }

  const handleAssistantVersionNav = (dir: -1 | 1) => {
    const nextIndex = activeAssistantVersionIdx + dir
    if (nextIndex >= 0 && nextIndex < assistantVersions.length) {
      setActiveAssistantVersionIdx(nextIndex)
      const nextVersion = Number(assistantVersions[nextIndex]?.version_index) || (nextIndex + 1)
      setAssistantVersionOverride(message.id, nextVersion)
    }
  }

  const handleUserVersionNav = (dir: -1 | 1) => {
    const nextIndex = activeUserVersionIdx + dir
    if (nextIndex >= 0 && nextIndex < userVersions.length) {
      setActiveUserVersionIdx(nextIndex)
      if (pairedAssistantMessageId) {
        const nextVersion = Number(userVersions[nextIndex]?.version_index) || (nextIndex + 1)
        setAssistantVersionOverride(pairedAssistantMessageId, nextVersion)
      }
    }
  }

  const activeUserVersion = userVersions[activeUserVersionIdx]
  const activeUserVersionNumber = Number(activeUserVersion?.version_index) || (activeUserVersionIdx + 1)
  const totalUserVersionNumber = userVersions.length > 0
    ? userVersions.reduce((max, item) => Math.max(max, Number(item.version_index) || 0), 0)
    : Math.max(1, Number(message.edit_version) || 1)

  const activeAssistantVersion = assistantVersions[activeAssistantVersionIdx]
  const activeAssistantVersionNumber = Number(activeAssistantVersion?.version_index) || (activeAssistantVersionIdx + 1)
  const totalAssistantVersionNumber = assistantVersions.length > 0
    ? assistantVersions.reduce((max, item) => Math.max(max, Number(item.version_index) || 0), 0)
    : 1

  const displayContent = isAssistant
    ? (assistantVersions.length > 0
        ? assistantVersions[activeAssistantVersionIdx]?.content || message.content
        : message.content)
    : (userVersions.length > 0
        ? userVersions[activeUserVersionIdx]?.content || message.content
        : message.content)

  return (
    <div className={`mb-5 md:mb-6 group ${isUser ? 'flex justify-end' : ''}`} style={{ animation: 'message-in 0.35s ease-out' }}>
      <div className={`flex gap-2 md:gap-3 ${isUser ? `flex-row-reverse ${isEditing ? 'max-w-[96%] md:max-w-[94%]' : 'max-w-[92%] md:max-w-[85%]'}` : 'max-w-full'}`}>
        {isAssistant && (
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg overflow-hidden bg-white ring-1 ring-indigo-100 flex items-center justify-center shadow-sm">
              <Image src="/logo.png" alt="GIA" width={32} height={32} className="object-contain" />
            </div>
          </div>
        )}

        <div className={`flex-1 min-w-0 ${isUser ? 'text-right' : ''}`}>
          {isAssistant && message.model ? (
            <span className="text-xs font-medium text-zinc-400 mb-1 block">{String(message.model)}</span>
          ) : null}

          {isAssistant && relatedSearchImages.length > 0 && (
            <div className="mb-3 max-w-[760px]">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Imágenes relacionadas</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
                {relatedSearchImages.map((image, index) => (
                  <button
                    key={`${image.image_url}-${index}`}
                    type="button"
                    onClick={() => handleOpenDeepResearchImage(index)}
                    className="group/dr text-left rounded-xl overflow-hidden border border-white/60 bg-white/50 backdrop-blur-xl shadow-[0_8px_24px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.55)] hover:shadow-[0_12px_32px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.65)] transition-all"
                    title={image.source_title}
                  >
                    <div className="relative h-28 sm:h-32 w-full bg-zinc-100">
                      <img
                        src={image.image_url}
                        alt={image.source_title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.style.display = 'none'
                          const parent = target.parentElement
                          if (parent) {
                            parent.innerHTML = `<div class="h-full w-full flex items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200"><svg class="w-8 h-8 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>`
                          }
                        }}
                      />
                    </div>
                    <div className="px-2 py-1.5 border-t border-white/65 bg-white/30">
                      <p className="text-[10px] font-medium text-zinc-700 truncate">
                        {getSourceHost(image.source_url)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {isAssistant && spreadsheetCharts.length > 0 && (
            <div className="mb-3 max-w-[760px]">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Graficos automaticos</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
                {spreadsheetCharts.map((chart, index) => (
                  <button
                    key={`${chart.image_url}-${index}`}
                    type="button"
                    onClick={() => handleOpenSpreadsheetChart(index)}
                    className="group/dr text-left rounded-xl overflow-hidden border border-white/60 bg-white/50 backdrop-blur-xl shadow-[0_8px_24px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.55)] hover:shadow-[0_12px_32px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.65)] transition-all"
                    title={chart.source_title}
                  >
                    <img
                      src={chart.image_url}
                      alt={chart.source_title}
                      className="h-28 sm:h-32 w-full object-cover"
                    />
                    <div className="px-2 py-1.5 border-t border-white/65 bg-white/30">
                      <p className="text-[10px] font-medium text-zinc-700 truncate">
                        {chart.source_title}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {isEditing ? (
            <div className="w-full max-w-[840px] ml-auto rounded-2xl border border-white/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.78)_0%,rgba(240,248,255,0.62)_100%)] backdrop-blur-xl shadow-[0_14px_36px_rgba(15,23,42,0.16),inset_0_1px_0_rgba(255,255,255,0.62)] p-3 sm:p-4">
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Editar mensaje</p>
                {userVersions.length > 1 && (
                  <div className="inline-flex items-center gap-1 text-[11px] text-zinc-500 bg-white/50 border border-white/60 rounded-full px-2 py-1">
                    <button
                      onClick={() => handleUserVersionNav(-1)}
                      disabled={activeUserVersionIdx === 0}
                      className="p-0.5 rounded hover:bg-white/70 disabled:opacity-35"
                      title="Version anterior"
                    >
                      <ChevronLeft size={12} />
                    </button>
                    <span className="font-medium tabular-nums">{activeUserVersionNumber}/{totalUserVersionNumber}</span>
                    <button
                      onClick={() => handleUserVersionNav(1)}
                      disabled={activeUserVersionIdx === userVersions.length - 1}
                      className="p-0.5 rounded hover:bg-white/70 disabled:opacity-35"
                      title="Version siguiente"
                    >
                      <ChevronRight size={12} />
                    </button>
                  </div>
                )}
              </div>

              <textarea
                ref={textareaRef}
                value={editContent}
                onChange={(event) => setEditContent(event.target.value)}
                onKeyDown={handleEditKeyDown}
                className="w-full rounded-xl border border-white/75 bg-white/75 px-4 py-3 text-sm text-zinc-800 resize-none min-h-[130px] leading-relaxed shadow-[inset_0_1px_2px_rgba(15,23,42,0.06)] focus:outline-none focus:ring-2 focus:ring-blue-400/60 focus:border-blue-300"
                rows={5}
              />

              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[11px] text-zinc-500">{editContent.length} caracteres · `Ctrl+Enter` para enviar</span>
                <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setIsEditing(false)
                    setEditContent(displayContent)
                  }}
                  className="px-3 py-1.5 text-xs text-zinc-600 hover:bg-white/70 border border-white/60 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleEditSave}
                  disabled={savingEdit}
                  className="px-3.5 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-60 disabled:hover:bg-blue-600 inline-flex items-center gap-1.5 shadow-sm"
                >
                  {savingEdit && <Loader2 size={12} className="animate-spin" />}
                  Guardar y enviar
                </button>
                </div>
              </div>
            </div>
          ) : (
            <div className={`${isUser ? 'inline-block rounded-2xl rounded-br-md px-4 py-2.5 text-left text-white border border-blue-200/40 bg-[linear-gradient(135deg,rgba(29,78,216,0.96)_0%,rgba(67,56,202,0.92)_100%)] backdrop-blur-xl shadow-[0_14px_30px_rgba(30,64,175,0.34),inset_0_1px_0_rgba(255,255,255,0.24)]' : ''}`}>
              <div className={`prose max-w-none leading-relaxed ${isUser ? 'text-sm prose-invert prose-p:my-1 prose-p:text-white prose-headings:text-white prose-strong:text-white prose-li:text-white prose-a:text-cyan-100 prose-a:decoration-cyan-200/80 prose-code:text-white' : 'text-base'}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={isUser ? undefined : markdownComponents}>
                  {displayContent}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Code Execution Results */}
          {isAssistant && codeExecutions.length > 0 && (
            <div className="mt-3 space-y-2">
              {codeExecutions.map((execution, index) => (
                <CodeExecutionBlock
                  key={index}
                  code={execution.code}
                  output={execution.output}
                  error={execution.error}
                  execution_time_ms={execution.execution_time_ms}
                  status={execution.status}
                  allowManualExecution={true}
                  conversationId={message.conversation_id}
                />
              ))}
            </div>
          )}

          <div className={`mt-1 flex items-center gap-1.5 text-[10px] ${isUser ? 'justify-end text-blue-700' : 'text-zinc-500'}`}>
            {message.edited_at && (
              <span className={`${isUser ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-zinc-100 border-zinc-200 text-zinc-600'} px-1.5 py-0.5 rounded-full border`}>
                editado
              </span>
            )}
            <span className={`${isUser ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-zinc-100 border-zinc-200 text-zinc-600'} px-1.5 py-0.5 rounded-full border tabular-nums`}>
              {messageTime}
            </span>
            {isUser && userVersions.length > 1 && (
              <div className="inline-flex items-center gap-0.5 text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-1.5 py-0.5">
                <button
                  onClick={() => handleUserVersionNav(-1)}
                  disabled={activeUserVersionIdx === 0}
                  className="p-0.5 hover:bg-blue-100 rounded disabled:opacity-40"
                  title="Version anterior"
                >
                  <ChevronLeft size={12} />
                </button>
                <span className="tabular-nums">{activeUserVersionNumber}/{totalUserVersionNumber}</span>
                <button
                  onClick={() => handleUserVersionNav(1)}
                  disabled={activeUserVersionIdx === userVersions.length - 1}
                  className="p-0.5 hover:bg-blue-100 rounded disabled:opacity-40"
                  title="Version siguiente"
                >
                  <ChevronRight size={12} />
                </button>
              </div>
            )}
            {isAssistant && assistantVersions.length > 1 && (
              <div className="inline-flex items-center gap-0.5 text-[11px] text-zinc-600 bg-zinc-100 border border-zinc-200 rounded-full px-1.5 py-0.5">
                <button
                  onClick={() => handleAssistantVersionNav(-1)}
                  disabled={activeAssistantVersionIdx === 0}
                  className="p-0.5 hover:bg-zinc-200 rounded disabled:opacity-40"
                  title="Version anterior IA"
                >
                  <ChevronLeft size={12} />
                </button>
                <span className="tabular-nums">{activeAssistantVersionNumber}/{totalAssistantVersionNumber}</span>
                <button
                  onClick={() => handleAssistantVersionNav(1)}
                  disabled={activeAssistantVersionIdx === assistantVersions.length - 1}
                  className="p-0.5 hover:bg-zinc-200 rounded disabled:opacity-40"
                  title="Version siguiente IA"
                >
                  <ChevronRight size={12} />
                </button>
              </div>
            )}
          </div>

          {rawAttachments.length > 0 && (
            <div className={`mt-2.5 flex flex-wrap gap-2 ${isUser ? 'justify-end' : ''}`}>
              {(attachmentPreviews.length > 0 ? attachmentPreviews : rawAttachments.map((item) => ({
                file_id: item.file_id,
                filename: item.filename || 'archivo',
                mime: item.mime || 'application/octet-stream',
                size: typeof item.size === 'number' ? item.size : 0,
                signed_url: null,
              }))).map((attachment) => {
                const hasFileId = typeof attachment.file_id === 'string' && attachment.file_id.length > 0
                const isImageAttachment = attachment.mime.startsWith('image/')
                const lowerMime = attachment.mime.toLowerCase()
                const lowerName = attachment.filename.toLowerCase()
                const isPdfAttachment = lowerMime.includes('application/pdf') || lowerName.endsWith('.pdf')
                const isSheetAttachment = lowerMime.includes('spreadsheetml') || lowerMime.includes('ms-excel') || lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')
                const isDocAttachment = lowerMime.includes('wordprocessingml') || lowerMime.includes('msword') || lowerName.endsWith('.docx') || lowerName.endsWith('.doc')
                return (
                  <button
                    type="button"
                    key={attachment.file_id}
                    onClick={() => {
                      if (hasFileId) openFilePreview(attachment.file_id)
                    }}
                    disabled={!hasFileId}
                    className={`w-[220px] text-left rounded-xl border shadow-sm overflow-hidden transition-all ${
                      hasFileId ? 'hover:shadow-md' : 'cursor-not-allowed opacity-70'
                    } ${isUser ? 'bg-blue-500/20 border-blue-200/70 text-white' : 'bg-white border-zinc-200'}`}
                    title={hasFileId ? t.chatInput.openAttachment : 'Adjunto sin vista previa disponible'}
                  >
                    <div className="p-2">
                      {isImageAttachment && attachment.signed_url ? (
                        <img src={attachment.signed_url} alt={attachment.filename} className="w-full h-24 rounded-lg object-cover border border-white/50" />
                      ) : (
                        <div className={`w-full h-24 rounded-lg flex items-center justify-center border ${isUser ? 'bg-blue-500/25 border-white/35' : 'bg-zinc-50 border-zinc-100'}`}>
                          {isPdfAttachment ? (
                            <FileText size={22} className={isUser ? 'text-red-100' : 'text-red-400'} />
                          ) : isSheetAttachment ? (
                            <FileSpreadsheet size={22} className={isUser ? 'text-emerald-100' : 'text-emerald-500'} />
                          ) : isDocAttachment ? (
                            <FileText size={22} className={isUser ? 'text-blue-100' : 'text-blue-500'} />
                          ) : (
                            <Paperclip size={22} className={isUser ? 'text-blue-100' : 'text-zinc-400'} />
                          )}
                        </div>
                      )}
                    </div>
                    <div className="px-2.5 pb-2.5">
                      <p className={`text-xs font-medium truncate ${isUser ? 'text-white' : 'text-zinc-700'}`}>{attachment.filename}</p>
                      <div className="mt-1 flex items-center gap-1 text-[11px]">
                        <span className={isUser ? 'text-blue-100/90' : 'text-zinc-400'}>{formatFileSize(attachment.size)}</span>
                        <Eye size={11} className={isUser ? 'text-blue-100/90 ml-auto' : 'text-zinc-400 ml-auto'} />
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {isAssistant && generatedImageUrl && (
            <div className="mt-3 mb-2">
              <div className="relative inline-block max-w-full group/image">
                <button
                  type="button"
                  onClick={handleOpenImagePreview}
                  className="block rounded-xl overflow-hidden border border-zinc-200 bg-white shadow-lg hover:shadow-xl transition-shadow"
                >
                  <img
                    src={generatedImageUrl}
                    alt="Imagen generada por IA"
                    className="max-w-full w-auto max-h-[520px] object-contain"
                  />
                </button>

                <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-t from-black/35 via-black/5 to-transparent opacity-0 group-hover/image:opacity-100 transition-opacity" />

                <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover/image:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      void handleDownloadImage()
                    }}
                    className="h-8 w-8 rounded-lg bg-white/90 border border-zinc-200 text-zinc-700 hover:bg-white"
                    title="Descargar"
                  >
                    <Download size={14} className="mx-auto" />
                  </button>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      void handleCopyImage()
                    }}
                    className="h-8 w-8 rounded-lg bg-white/90 border border-zinc-200 text-zinc-700 hover:bg-white"
                    title="Copiar imagen"
                  >
                    <Copy size={14} className="mx-auto" />
                  </button>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleOpenImageExternal()
                    }}
                    className="h-8 w-8 rounded-lg bg-white/90 border border-zinc-200 text-zinc-700 hover:bg-white"
                    title="Abrir"
                  >
                    <ExternalLink size={14} className="mx-auto" />
                  </button>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleRegenerateVariant()
                    }}
                    disabled={regeneratingVariant}
                    className="h-8 px-2 rounded-lg bg-blue-600/95 text-white hover:bg-blue-500 disabled:opacity-60"
                    title="Regenerar variante"
                  >
                    {regeneratingVariant ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {isAssistant && sources.length > 0 && (() => {
            const ragSrcs = sources.filter((source) => source.source_type === 'rag' || !source.source_type)
            const webSrcs = sources.filter((source) => source.source_type === 'web')
            const networkSrcs = sources.filter((source) => source.source_type === 'network')

            return (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {webSrcs.map((source, idx) => (
                  <a
                    key={`w${idx}`}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 bg-blue-50 text-blue-600 border border-blue-100 rounded-full hover:bg-blue-100 transition-colors"
                  >
                    <Globe size={11} className="shrink-0" />
                    <span className="truncate max-w-[140px]">{source.filename}</span>
                    <ExternalLink size={9} className="shrink-0 opacity-50" />
                  </a>
                ))}

                {ragSrcs.map((source, idx) => (
                  <button
                    key={`r${idx}`}
                    onClick={() => openFilePreview(source.file_id)}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full hover:bg-emerald-100 transition-colors"
                  >
                    <FileText size={11} className="shrink-0" />
                    <span className="truncate max-w-[140px]">{source.filename}</span>
                    {source.page && <span className="text-emerald-400 text-[10px]">p.{source.page}</span>}
                  </button>
                ))}

                {networkSrcs.map((source, idx) => (
                  <button
                    key={`n${idx}`}
                    onClick={() => window.open(`/api/network-files/${source.network_file_id}/download?inline=1`, '_blank')}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 bg-purple-50 text-purple-600 border border-purple-100 rounded-full hover:bg-purple-100 transition-colors"
                  >
                    <HardDrive size={11} className="shrink-0" />
                    <span className="truncate max-w-[140px]">{source.filename}</span>
                    <ExternalLink size={9} className="shrink-0 opacity-50" />
                  </button>
                ))}
              </div>
            )
          })()}

          {!isEditing && (
            <div className={`flex items-center gap-1 mt-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity ${isUser ? 'justify-end' : ''}`}>
              {isUser && (
                <button
                  onClick={() => {
                    setEditContent(displayContent)
                    setIsEditing(true)
                  }}
                  className="p-2 md:p-1 hover:bg-zinc-100 rounded text-zinc-400 hover:text-zinc-600"
                  title="Editar"
                >
                  <Pencil size={13} />
                </button>
              )}

              <button onClick={handleCopy} className="p-2 md:p-1 hover:bg-zinc-100 rounded text-zinc-400 hover:text-zinc-600" title="Copiar">
                {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
              </button>

              {isAssistant && (
                <button onClick={() => regenerateFromHere()} className="p-2 md:p-1 hover:bg-zinc-100 rounded text-zinc-400 hover:text-zinc-600" title="Regenerar">
                  <RefreshCw size={13} />
                </button>
              )}

              <button
                onClick={() => showConfirm({
                  title: 'Eliminar mensaje',
                  message: isUser
                    ? 'Se eliminaran este mensaje y todos los posteriores. Continuar?'
                    : 'Se eliminara esta respuesta y todos los mensajes posteriores. Continuar?',
                  confirmLabel: 'Eliminar',
                  variant: 'danger',
                  onConfirm: handleDelete,
                })}
                className="p-2 md:p-1 hover:bg-red-50 rounded text-zinc-400 hover:text-red-500 transition-colors"
                title="Eliminar desde aqui"
              >
                <Trash2 size={13} />
              </button>

            </div>
          )}
        </div>
      </div>
    </div>
  )
}
