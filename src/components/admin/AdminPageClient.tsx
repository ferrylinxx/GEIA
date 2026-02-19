'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AIProvider, ModelConfig, DbConnection, DbSchemaTable, NetworkDrive, Banner } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/contexts/ThemeContext'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import RolesManagement from './RolesManagement'
import ToolsManagement from './ToolsManagement'
import UserTokenUsage from './UserTokenUsage'
import {
  ArrowLeft, Users, Bot, Plug, Trash2, Edit3, Plus, Eye, EyeOff,
  ArrowUp, ArrowDown, Shield, Loader2, Save, X, Check,
  ChevronRight, RefreshCw, MessageSquare, FileText, Database, GripVertical, Upload, HardDrive, Megaphone, ToggleLeft, ToggleRight, Search, Crown, MessageCircle,
  MonitorSmartphone, MousePointerClick, ImageIcon, Sparkles, PanelsTopLeft, Zap, Clock as ClockIcon, Play, Edit2, Globe, Code2, CheckCircle2, XCircle,
  Palette, Volume2, MessageSquareText, BarChart3, Brain, UserPlus, Menu, Home, Settings, LayoutGrid
} from 'lucide-react'
import AnalyticsDashboard from '@/components/analytics/AnalyticsDashboard'
import ThemeGallery from '@/components/themes/ThemeGallery'
import DatasetUploader from '@/components/fine-tuning/DatasetUploader'
import JobMonitor from '@/components/fine-tuning/JobMonitor'
import MemoryCategories from '@/components/memory/MemoryCategories'
import ParticipantsList from '@/components/collaboration/ParticipantsList'

type AdminTab = 'dashboard' | 'users' | 'roles' | 'tools' | 'models' | 'providers' | 'connections' | 'network-drives' | 'files' | 'banners' | 'document-analysis' | 'agents' | 'themes' | 'notification-sound' | 'analytics' | 'theme-gallery' | 'fine-tuning' | 'memory' | 'collaboration'

interface UserRow {
  id: string
  name: string | null
  email: string
  role: string
  avatar_url: string | null
  created_at: string
  activity_status?: 'online' | 'typing' | 'read' | 'offline'
  activity_last_seen_at?: string | null
}

interface Props {
  stats: { users: number; conversations: number; messages: number; files: number; chunks: number }
  currentUserId: string
}

interface AdminFileItem {
  id: string
  user_id: string
  user_name: string | null
  storage_path: string
  filename: string
  mime: string | null
  size: number
  ingest_status: 'none' | 'queued' | 'processing' | 'done' | 'failed'
  created_at: string
  signed_url?: string | null
  chunk_count?: number
}

interface AdminConversationListItem {
  id: string
  title: string
  model_default: string | null
  is_archived: boolean
  created_at: string
  updated_at: string
  message_count: number
  last_message_at: string | null
  last_message_preview: string
}

interface AdminConversationMessageItem {
  id: string
  conversation_id: string
  user_id: string
  user_name: string | null
  role: 'user' | 'assistant' | 'system'
  content: string
  model: string | null
  attachments_json: unknown
  created_at: string
  updated_at: string
}

interface AdminConversationDetail {
  id: string
  user_id: string
  title: string
  model_default: string | null
  is_archived: boolean | null
  created_at: string
  updated_at: string
  owner: {
    id: string
    name: string | null
    avatar_url: string | null
    role: string | null
  } | null
}

type BannerFormState = {
  title: string
  message: string
  type: Banner['type']
  display_mode: Banner['display_mode']
  priority: number
  is_active: boolean
  dismissible: boolean
  show_once: boolean
  cta_label: string
  cta_url: string
  image_url: string
  accent_color: string
  start_date: string
  end_date: string
}

function createEmptyBannerForm(): BannerFormState {
  return {
    title: '',
    message: '',
    type: 'info',
    display_mode: 'banner',
    priority: 0,
    is_active: true,
    dismissible: true,
    show_once: true,
    cta_label: '',
    cta_url: '',
    image_url: '',
    accent_color: '',
    start_date: '',
    end_date: '',
  }
}

export default function AdminPageClient({ stats, currentUserId }: Props) {
  const router = useRouter()
  const { currentTheme, setTheme, availableThemes } = useTheme()
  const [tab, setTab] = useState<AdminTab>('dashboard')
  const [users, setUsers] = useState<UserRow[]>([])
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [models, setModels] = useState<ModelConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [uploadingAvatarForUser, setUploadingAvatarForUser] = useState<string | null>(null)
  const [expandedUserTokens, setExpandedUserTokens] = useState<string | null>(null)
  const [openingDmUserId, setOpeningDmUserId] = useState<string | null>(null)
  const [chatViewerOpen, setChatViewerOpen] = useState(false)
  const [chatViewerUser, setChatViewerUser] = useState<UserRow | null>(null)
  const [userConversations, setUserConversations] = useState<AdminConversationListItem[]>([])
  const [loadingUserConversations, setLoadingUserConversations] = useState(false)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [selectedConversation, setSelectedConversation] = useState<AdminConversationDetail | null>(null)
  const [conversationMessages, setConversationMessages] = useState<AdminConversationMessageItem[]>([])
  const [loadingConversationMessages, setLoadingConversationMessages] = useState(false)

  // Provider form
  const [showProviderForm, setShowProviderForm] = useState(false)
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null)
  const [providerForm, setProviderForm] = useState({ name: '', type: 'openai', base_url: 'https://api.openai.com/v1', api_key: '', is_enabled: true, priority: 0 })

  // Model form
  const [showModelForm, setShowModelForm] = useState(false)
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null)
  const [modelForm, setModelForm] = useState({
    provider_id: '', model_id: '', display_name: '', description: '', icon_url: '',
    system_prompt: '', is_visible: true, sort_order: 0, max_tokens: 4096, use_max_tokens: false,
    supports_streaming: true, supports_vision: false
  })
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [iconPreview, setIconPreview] = useState<string>('')
  const [uploadingIcon, setUploadingIcon] = useState(false)
  const iconInputRef = useRef<HTMLInputElement>(null)

  // Roles for model permissions
  const [availableRoles, setAvailableRoles] = useState<{ id: string; name: string }[]>([])
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [showRolesDropdown, setShowRolesDropdown] = useState(false)
  const [allRoles, setAllRoles] = useState<{ id: string; name: string }[]>([]) // For user role selector

  // Create User Modal
  const [showCreateUserModal, setShowCreateUserModal] = useState(false)
  const [createUserForm, setCreateUserForm] = useState({ email: '', name: '', role: 'user', password: '' })
  const [creatingUser, setCreatingUser] = useState(false)
  const [createdUserCredentials, setCreatedUserCredentials] = useState<{ email: string; temporaryPassword: string; resetLink: string; emailSent?: boolean } | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  // Roles for other resources
  const [selectedConnRoles, setSelectedConnRoles] = useState<string[]>([])
  const [showConnRolesDropdown, setShowConnRolesDropdown] = useState(false)
  const [selectedDriveRoles, setSelectedDriveRoles] = useState<string[]>([])
  const [showDriveRolesDropdown, setShowDriveRolesDropdown] = useState(false)
  const [selectedAgentRoles, setSelectedAgentRoles] = useState<string[]>([])
  const [showAgentRolesDropdown, setShowAgentRolesDropdown] = useState(false)

  // Mobile Menu
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // DB Connections
  const [connections, setConnections] = useState<DbConnection[]>([])
  const [showConnForm, setShowConnForm] = useState(false)
  const [editingConn, setEditingConn] = useState<DbConnection | null>(null)
  const [connForm, setConnForm] = useState({ name: '', description: '', db_type: 'mssql', host: '', port: 1433, database_name: '', username: '', password: '' })
  const [syncingSchema, setSyncingSchema] = useState<string | null>(null)
  const [viewingSchema, setViewingSchema] = useState<string | null>(null)

  // Network Drives
  const [networkDrives, setNetworkDrives] = useState<NetworkDrive[]>([])
  const [showDriveForm, setShowDriveForm] = useState(false)
  const [editingDrive, setEditingDrive] = useState<NetworkDrive | null>(null)
  const [driveForm, setDriveForm] = useState({
    name: '',
    unc_path: '',
    description: '',
    file_extensions: 'pdf,docx,xlsx,pptx,txt,csv,md,json,xml,html,doc,xls,ppt,rtf,log',
    max_file_size_mb: 50,
    connection_type: 'smb' as 'smb' | 'sftp',
    sftp_host: '',
    sftp_port: 22,
    sftp_username: '',
    sftp_password: ''
  })
  const [syncingDrive, setSyncingDrive] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<Record<string, unknown> | null>(null)
  const [testingSFTP, setTestingSFTP] = useState(false)
  const [sftpTestResult, setSftpTestResult] = useState<{ success: boolean; message: string; details?: any } | null>(null)

  // Banners
  const [banners, setBanners] = useState<Banner[]>([])
  const [showBannerForm, setShowBannerForm] = useState(false)
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null)
  const [bannerForm, setBannerForm] = useState<BannerFormState>(createEmptyBannerForm())
  const [bannersLoading, setBannersLoading] = useState(false)
  const [adminFiles, setAdminFiles] = useState<AdminFileItem[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesQuery, setFilesQuery] = useState('')
  const [selectedAdminFile, setSelectedAdminFile] = useState<AdminFileItem | null>(null)
  const [fileModalLoading, setFileModalLoading] = useState(false)
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set())
  const [filesFilterUser, setFilesFilterUser] = useState('')
  const [filesFilterMime, setFilesFilterMime] = useState('')
  const [filesFilterStatus, setFilesFilterStatus] = useState('')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [storageStats, setStorageStats] = useState<{ total: number; by_user: Array<{ user_id: string; user_name: string | null; size: number; file_count: number }> } | null>(null)
  const [convertedHtml, setConvertedHtml] = useState<string | null>(null)
  const [conversionError, setConversionError] = useState<string | null>(null)

  // Agents State
  const [agents, setAgents] = useState<any[]>([])
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [agentSubTab, setAgentSubTab] = useState<'list' | 'create' | 'history'>('list')
  const [selectedAgent, setSelectedAgent] = useState<any | null>(null)
  const [executingAgentId, setExecutingAgentId] = useState<string | null>(null)
  const [agentExecutions, setAgentExecutions] = useState<any[]>([])
  const [agentForm, setAgentForm] = useState({
    name: '',
    description: '',
    goal: '',
    tools: [] as string[],
    schedule_type: 'manual' as 'manual' | 'interval' | 'daily' | 'cron',
    schedule_config: {} as Record<string, unknown>,
  })

  // Document Analysis Config
  const [docAnalysisConfig, setDocAnalysisConfig] = useState({
    extractionEngine: 'hybrid' as 'pdf-parse' | 'tika' | 'hybrid',
    tikaServerUrl: 'https://tika.fgarola.es/',
    tikaTimeout: 30000,
    embeddingModel: 'text-embedding-3-large',
    embeddingDimensions: 1536,
    embeddingBatchSize: 100,
    chunkSize: 1500,
    chunkOverlap: 200,
    chunkingStrategy: 'semantic' as 'fixed' | 'semantic',
    ocrEnabled: true,
    ocrLanguages: 'spa+eng',
    ocrMinTextLength: 100,
    llmAnalysisEnabled: true,
    llmAnalysisModel: 'gpt-4o-mini',
    llmAnalysisTemperature: 0.3,
    embeddingCacheEnabled: true,
    retryEnabled: true,
    retryAttempts: 3,
    retryBackoffMs: 2000,
  })
  const [testingTika, setTestingTika] = useState(false)
  const [tikaTestResult, setTikaTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // Themes State - Ya no se necesita, se usa el contexto local
  // const [themes, setThemes] = useState<any[]>([])
  // const [themesLoading, setThemesLoading] = useState(false)
  // activeTheme ahora viene de currentTheme.slug del contexto

  // Notification Settings State - Ahora local con localStorage
  const [notificationSettings, setNotificationSettings] = useState({
    sound_url: null as string | null,
    duration_seconds: 5
  })
  const [uploadingSoundFile, setUploadingSoundFile] = useState(false)

  const PROVIDER_TYPES = [
    { value: 'openai', label: 'OpenAI', url: 'https://api.openai.com/v1' },
    { value: 'gemini', label: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta' },
    { value: 'anthropic', label: 'Anthropic', url: 'https://api.anthropic.com/v1' },
    { value: 'ollama', label: 'Ollama (Local)', url: 'http://localhost:11434/v1' },
    { value: 'mistral', label: 'Mistral AI', url: 'https://api.mistral.ai/v1' },
    { value: 'groq', label: 'Groq', url: 'https://api.groq.com/openai/v1' },
    { value: 'openrouter', label: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
    { value: 'custom', label: 'Custom (OpenAI Compatible)', url: '' },
  ]

  useEffect(() => {
    loadData()
    loadRoles() // Load roles for user selector
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [usersRes, providersRes, modelsRes, connsRes, drivesRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/providers'),
        fetch('/api/admin/models'),
        fetch('/api/admin/db-connections'),
        fetch('/api/admin/network-drives'),
      ])
      if (usersRes.ok) { const d = await usersRes.json(); setUsers(d.users || []) }
      if (providersRes.ok) { const d = await providersRes.json(); setProviders(d.providers || []) }
      if (modelsRes.ok) { const d = await modelsRes.json(); setModels(d.models || []) }
      if (connsRes.ok) { const d = await connsRes.json(); setConnections(d.connections || []) }
      if (drivesRes.ok) { const d = await drivesRes.json(); setNetworkDrives(d.drives || []) }
    } catch (e) { console.error('Failed to load admin data', e) }
    setLoading(false)
  }

  const loadBanners = async () => {
    setBannersLoading(true)
    try {
      const res = await fetch('/api/admin/banners')
      if (res.ok) {
        const data = await res.json()
        setBanners((Array.isArray(data) ? data : []) as Banner[])
      }
    } finally {
      setBannersLoading(false)
    }
  }

  const loadRoles = async () => {
    try {
      const res = await fetch('/api/admin/roles')
      if (res.ok) {
        const data = await res.json()
        setAvailableRoles(data.roles || [])
        setAllRoles(data.roles || []) // Also set for user role selector
      }
    } catch (e) {
      console.error('Failed to load roles', e)
    }
  }

  const loadAgents = async () => {
    setAgentsLoading(true)
    try {
      const res = await fetch('/api/agents')
      if (res.ok) {
        const data = await res.json()
        setAgents(data.agents || [])
      }
    } catch (err) {
      console.error('Error loading agents:', err)
    } finally {
      setAgentsLoading(false)
    }
  }

  const loadAgentExecutions = async () => {
    try {
      const res = await fetch('/api/agents/executions')
      if (res.ok) {
        const data = await res.json()
        setAgentExecutions(data.executions || [])
      }
    } catch (err) {
      console.error('Error loading executions:', err)
    }
  }

  // Ya no se necesita cargar temas desde Supabase
  // Los temas ahora son locales y están en el contexto
  // const loadThemes = async () => { ... }

  // Cargar configuración de notificaciones desde Supabase
  const loadNotificationSettings = async () => {
    try {
      const res = await fetch('/api/public/app-settings', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      })

      if (res.ok) {
        const data = await res.json()
        const notifSettings = data.notification_sound || { sound_url: null, duration_seconds: 5 }

        setNotificationSettings({
          sound_url: notifSettings.sound_url || null,
          duration_seconds: notifSettings.duration_seconds || 5
        })
        console.log('[Admin] Notification settings loaded from server:', notifSettings)
      }
    } catch (err) {
      console.error('[Admin] Error loading notification settings:', err)
    }
  }

  const executeAgent = async (agentId: string) => {
    setExecutingAgentId(agentId)
    try {
      const res = await fetch('/api/agents/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId }),
      })
      if (res.ok) {
        showStatus('Agente ejecutado exitosamente')
        await loadAgents()
        await loadAgentExecutions()
      } else {
        const data = await res.json()
        showStatus(data.error || 'Error al ejecutar agente')
      }
    } catch (err) {
      showStatus('Error al ejecutar agente')
    } finally {
      setExecutingAgentId(null)
    }
  }

  const deleteAgent = async (agentId: string) => {
    if (!confirm('¿Estás seguro de eliminar este agente?')) return
    try {
      const res = await fetch(`/api/agents?id=${agentId}`, { method: 'DELETE' })
      if (res.ok) {
        showStatus('Agente eliminado')
        await loadAgents()
      } else {
        showStatus('Error al eliminar agente')
      }
    } catch (err) {
      showStatus('Error al eliminar agente')
    }
  }

  const saveAgentPermissions = async (agentId: string) => {
    try {
      // Delete existing permissions
      await fetch('/api/admin/roles/permissions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_type: 'agent', resource_id: agentId })
      })

      // If roles are selected, create new permissions
      if (selectedAgentRoles.length > 0) {
        const permissions = selectedAgentRoles.map(roleId => ({
          role_id: roleId,
          resource_type: 'agent',
          resource_id: agentId,
          can_view: true
        }))

        await fetch('/api/admin/roles/permissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissions })
        })
      }
    } catch (e) {
      console.error('Failed to save agent permissions', e)
    }
  }

  const saveAgent = async () => {
    try {
      const method = selectedAgent ? 'PATCH' : 'POST'
      const body = selectedAgent
        ? { ...agentForm, id: selectedAgent.id }
        : agentForm

      const res = await fetch('/api/agents', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const data = await res.json()
        const agentId = selectedAgent ? selectedAgent.id : data.agent.id
        await saveAgentPermissions(agentId)

        showStatus(selectedAgent ? 'Agente actualizado' : 'Agente creado')
        setAgentSubTab('list')
        setSelectedAgent(null)
        setAgentForm({
          name: '',
          description: '',
          goal: '',
          tools: [],
          schedule_type: 'manual',
          schedule_config: {},
        })
        await loadAgents()
      } else {
        const data = await res.json()
        showStatus(data.error || 'Error al guardar agente')
      }
    } catch (err) {
      showStatus('Error al guardar agente')
    }
  }

  const editAgent = async (agent: any) => {
    await loadRoles()
    setSelectedAgent(agent)
    setAgentForm({
      name: agent.name,
      description: agent.description,
      goal: agent.goal,
      tools: agent.tools || [],
      schedule_type: agent.schedule_type,
      schedule_config: agent.schedule_config || {},
    })

    // Load existing permissions
    try {
      const res = await fetch(`/api/admin/roles/permissions?resource_type=agent&resource_id=${agent.id}`)
      if (res.ok) {
        const data = await res.json()
        const roleIds = data.permissions?.map((p: any) => p.role_id) || []
        setSelectedAgentRoles(roleIds)
      }
    } catch (e) {
      console.error('Failed to load agent permissions', e)
    }

    setAgentSubTab('create')
  }

  useEffect(() => {
    if (tab === 'banners' && banners.length === 0 && !bannersLoading) {
      void loadBanners()
    }
  }, [tab, banners.length, bannersLoading])

  useEffect(() => {
    if (tab === 'dashboard' && !storageStats) {
      void loadStorageStats()
    }
  }, [tab, storageStats])

  useEffect(() => {
    if (tab === 'agents' && agents.length === 0) {
      void loadAgents()
    }
  }, [tab])

  // Ya no se necesita cargar temas desde Supabase
  // useEffect(() => {
  //   if (tab === 'themes' && themes.length === 0) {
  //     void loadThemes()
  //   }
  // }, [tab, themes.length])

  useEffect(() => {
    if (tab === 'notification-sound') {
      void loadNotificationSettings()
    }
  }, [tab])

  const loadAdminFiles = async (query = filesQuery) => {
    setFilesLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('pageSize', '300')
      if (query.trim()) params.set('q', query.trim())
      if (filesFilterUser) params.set('user_id', filesFilterUser)
      if (filesFilterMime) params.set('mime_type', filesFilterMime)
      if (filesFilterStatus) params.set('ingest_status', filesFilterStatus)
      const res = await fetch(`/api/admin/files?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load files')
      const data = await res.json()
      setAdminFiles((data.files || []) as AdminFileItem[])
    } catch (e) {
      console.error('Failed to load admin files', e)
      setAdminFiles([])
    } finally {
      setFilesLoading(false)
    }
  }

  const clearFilters = () => {
    setFilesQuery('')
    setFilesFilterUser('')
    setFilesFilterMime('')
    setFilesFilterStatus('')
    loadAdminFiles('')
  }

  const loadStorageStats = async () => {
    try {
      const res = await fetch('/api/admin/storage-stats')
      if (!res.ok) throw new Error('Failed to load storage stats')
      const data = await res.json()
      setStorageStats(data)
    } catch (e) {
      console.error('Failed to load storage stats', e)
      setStorageStats(null)
    }
  }

  const openAdminFilePreview = async (file: AdminFileItem) => {
    setFileModalLoading(true)
    setConvertedHtml(null)
    setConversionError(null)
    try {
      const res = await fetch(`/api/admin/files/${file.id}`)
      if (!res.ok) {
        setSelectedAdminFile(file)
        return
      }
      const data = await res.json()
      const fileWithUrl = (data.file || file) as AdminFileItem
      setSelectedAdminFile(fileWithUrl)

      // Convert DOCX or XLSX to HTML for inline preview
      const mime = fileWithUrl.mime || ''
      if (mime.includes('wordprocessingml') && fileWithUrl.signed_url) {
        // DOCX conversion
        await convertDocxToHtml(fileWithUrl.signed_url)
      } else if (mime.includes('spreadsheetml') && fileWithUrl.signed_url) {
        // XLSX conversion
        await convertXlsxToHtml(fileWithUrl.signed_url)
      }
    } catch {
      setSelectedAdminFile(file)
    } finally {
      setFileModalLoading(false)
    }
  }

  const convertDocxToHtml = async (url: string) => {
    try {
      const mammoth = (await import('mammoth')).default
      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      const result = await mammoth.convertToHtml({ arrayBuffer })
      setConvertedHtml(result.value)
    } catch (e) {
      console.error('Error converting DOCX:', e)
      setConversionError('Error al convertir el documento DOCX')
    }
  }

  const convertXlsxToHtml = async (url: string) => {
    try {
      const XLSX = (await import('xlsx')).default
      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })

      // Convert all sheets to HTML
      let html = ''
      workbook.SheetNames.forEach((sheetName, index) => {
        const worksheet = workbook.Sheets[sheetName]
        const sheetHtml = XLSX.utils.sheet_to_html(worksheet)
        html += `<div class="mb-4"><h3 class="text-sm font-semibold text-zinc-700 mb-2">${sheetName}</h3>${sheetHtml}</div>`
      })

      setConvertedHtml(html)
    } catch (e) {
      console.error('Error converting XLSX:', e)
      setConversionError('Error al convertir el archivo Excel')
    }
  }

  const deleteAdminFile = async (file: AdminFileItem) => {
    // Fetch chunk count if not already loaded
    let chunkCount = file.chunk_count
    if (chunkCount === undefined) {
      try {
        const res = await fetch(`/api/admin/files/${file.id}`)
        if (res.ok) {
          const data = await res.json()
          chunkCount = data.file?.chunk_count || 0
        }
      } catch {
        chunkCount = 0
      }
    }

    const message = `¿Eliminar "${file.filename}"?\n\nEsto eliminará:\n- El archivo del storage (${formatBytes(file.size || 0)})\n- ${chunkCount || 0} chunks de RAG\n- Todas las referencias en conversaciones\n\nEsta acción no se puede deshacer.`
    const ok = window.confirm(message)
    if (!ok) return

    try {
      const res = await fetch(`/api/admin/files/${file.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        showStatus(data.error || 'Error al eliminar archivo')
        return
      }

      setAdminFiles((prev) => prev.filter((item) => item.id !== file.id))
      if (selectedAdminFile?.id === file.id) {
        setSelectedAdminFile(null)
      }
      setSelectedFileIds((prev) => {
        const next = new Set(prev)
        next.delete(file.id)
        return next
      })
      showStatus('Archivo eliminado')
    } catch {
      showStatus('Error al eliminar archivo')
    }
  }

  const deleteSelectedFiles = async () => {
    if (selectedFileIds.size === 0) return

    const totalSize = adminFiles
      .filter((f) => selectedFileIds.has(f.id))
      .reduce((sum, f) => sum + (f.size || 0), 0)
    const totalChunks = adminFiles
      .filter((f) => selectedFileIds.has(f.id))
      .reduce((sum, f) => sum + (f.chunk_count || 0), 0)

    const message = `¿Eliminar ${selectedFileIds.size} archivos seleccionados?\n\nEsto eliminará:\n- ${formatBytes(totalSize)} del storage\n- ${totalChunks} chunks de RAG\n- Todas las referencias en conversaciones\n\nEsta acción no se puede deshacer.`
    const ok = window.confirm(message)
    if (!ok) return

    setSaving(true)
    let deleted = 0
    let failed = 0

    for (const fileId of Array.from(selectedFileIds)) {
      try {
        const res = await fetch(`/api/admin/files/${fileId}`, { method: 'DELETE' })
        if (res.ok) {
          deleted++
          setAdminFiles((prev) => prev.filter((item) => item.id !== fileId))
        } else {
          failed++
        }
      } catch {
        failed++
      }
    }

    setSelectedFileIds(new Set())
    setSaving(false)
    showStatus(`${deleted} archivos eliminados${failed > 0 ? `, ${failed} fallaron` : ''}`)
  }

  const toggleFileSelection = (fileId: string) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev)
      if (next.has(fileId)) {
        next.delete(fileId)
      } else {
        next.add(fileId)
      }
      return next
    })
  }

  const toggleAllFiles = () => {
    if (selectedFileIds.size === adminFiles.length) {
      setSelectedFileIds(new Set())
    } else {
      setSelectedFileIds(new Set(adminFiles.map((f) => f.id)))
    }
  }

  useEffect(() => {
    if (tab === 'files') {
      loadAdminFiles()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  const showStatus = (msg: string) => { setStatusMsg(msg); setTimeout(() => setStatusMsg(''), 3000) }

  // === USER MANAGEMENT ===
  const startEditUser = (u: UserRow) => { setEditingUser(u.id); setEditName(u.name || ''); setEditRole(u.role) }
  const saveUser = async (userId: string) => {
    setSaving(true)
    const res = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, name: editName, role: editRole }) })
    if (res.ok) { setUsers(users.map(u => u.id === userId ? { ...u, name: editName, role: editRole } : u)); setEditingUser(null); showStatus('Usuario actualizado') }
    else showStatus('Error al actualizar')
    setSaving(false)
  }
  const deleteUser = async (userId: string) => {
    setSaving(true)
    const res = await fetch('/api/admin/users', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) })
    if (res.ok) { setUsers(users.filter(u => u.id !== userId)); setConfirmDelete(null); showStatus('Usuario eliminado') }
    else showStatus('Error al eliminar')
    setSaving(false)
  }

  const handleUserAvatarUpload = async (userId: string, file: File) => {
    setUploadingAvatarForUser(userId)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() || 'png'
      const path = `${userId}/avatar_${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })

      if (error) {
        console.error('Upload error:', error)
        showStatus('Error al subir avatar')
        return
      }

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      const avatarUrl = urlData.publicUrl

      // Update profile
      await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', userId)

      // Update local state
      setUsers(users.map(u => u.id === userId ? { ...u, avatar_url: avatarUrl } : u))
      showStatus('Avatar actualizado')
    } catch (err) {
      console.error('Avatar upload error:', err)
      showStatus('Error al subir avatar')
    } finally {
      setUploadingAvatarForUser(null)
    }
  }

  const createNewUser = async () => {
    if (!createUserForm.email || !createUserForm.name) {
      alert('Por favor completa todos los campos')
      return
    }
    setCreatingUser(true)
    try {
      const res = await fetch('/api/admin/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createUserForm),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        // Only show credentials modal if temporary password was generated
        if (data.temporaryPassword) {
          setCreatedUserCredentials({
            email: data.user.email,
            temporaryPassword: data.temporaryPassword,
            resetLink: data.resetLink,
            emailSent: data.emailSent,
          })
        } else {
          // Custom password was used, just show success message
          showStatus(data.message || 'Usuario creado correctamente')
          setShowCreateUserModal(false)
        }
        await loadData() // Reload all data including users list
        setCreateUserForm({ email: '', name: '', role: 'user', password: '' })
      } else {
        alert(data.error || 'Error al crear usuario')
      }
    } catch (error) {
      console.error('Error creating user:', error)
      alert('Error al crear usuario')
    }
    setCreatingUser(false)
  }

  const statusInfo = (status?: 'online' | 'typing' | 'read' | 'offline') => {
    if (status === 'online') return { label: 'En linea', dot: 'bg-emerald-500', text: 'text-emerald-600' }
    if (status === 'typing') return { label: 'Escribiendo...', dot: 'bg-blue-500', text: 'text-blue-600' }
    if (status === 'read') return { label: 'Leído', dot: 'bg-purple-500', text: 'text-purple-600' }
    return { label: 'Desconectado', dot: 'bg-zinc-400', text: 'text-zinc-500' }
  }

  const formatLastSeen = (dateValue?: string | null) => {
    if (!dateValue) return null
    const parsed = Date.parse(dateValue)
    if (!Number.isFinite(parsed)) return null
    return new Date(parsed).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
  }

  const openPrivateChat = async (targetUserId: string) => {
    if (openingDmUserId) return
    setOpeningDmUserId(targetUserId)
    try {
      const res = await fetch('/api/channels/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: targetUserId }),
      })
      if (!res.ok) {
        showStatus('No se pudo abrir chat privado')
        return
      }
      const data = await res.json()
      if (!data?.id) {
        showStatus('No se pudo abrir chat privado')
        return
      }
      router.push(`/channels?channel=${encodeURIComponent(data.id)}`)
    } catch {
      showStatus('No se pudo abrir chat privado')
    } finally {
      setOpeningDmUserId(null)
    }
  }

  const closeChatViewer = () => {
    setChatViewerOpen(false)
    setChatViewerUser(null)
    setUserConversations([])
    setSelectedConversationId(null)
    setSelectedConversation(null)
    setConversationMessages([])
    setLoadingUserConversations(false)
    setLoadingConversationMessages(false)
  }

  const openUserChatsViewer = async (user: UserRow) => {
    setChatViewerOpen(true)
    setChatViewerUser(user)
    setUserConversations([])
    setSelectedConversationId(null)
    setSelectedConversation(null)
    setConversationMessages([])
    setLoadingUserConversations(true)

    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/conversations`)
      if (!res.ok) {
        showStatus('No se pudieron cargar los chats del usuario')
        return
      }

      const data = await res.json()
      const conversations = (data?.conversations || []) as AdminConversationListItem[]
      setUserConversations(conversations)

      if (conversations.length > 0) {
        void openConversationMessages(conversations[0].id)
      }
    } catch {
      showStatus('No se pudieron cargar los chats del usuario')
    } finally {
      setLoadingUserConversations(false)
    }
  }

  const openConversationMessages = async (conversationId: string) => {
    setSelectedConversationId(conversationId)
    setLoadingConversationMessages(true)
    setConversationMessages([])
    setSelectedConversation(null)

    try {
      const res = await fetch(`/api/admin/conversations/${encodeURIComponent(conversationId)}/messages`)
      if (!res.ok) {
        showStatus('No se pudo abrir la conversacion')
        return
      }

      const data = await res.json()
      setSelectedConversation((data?.conversation || null) as AdminConversationDetail | null)
      setConversationMessages((data?.messages || []) as AdminConversationMessageItem[])
    } catch {
      showStatus('No se pudo abrir la conversacion')
    } finally {
      setLoadingConversationMessages(false)
    }
  }

  // === SYNC MODELS FROM ENABLED PROVIDERS ===
  const syncModels = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/admin/models/sync', { method: 'POST' })
      if (res.ok) {
        const d = await res.json()
        const providerResults = Array.isArray(d.providers)
          ? d.providers as Array<{ provider_name?: string; error?: string }>
          : []
        const providerErrors = providerResults
          .filter((provider) => Boolean(provider.error))
          .map((provider) => `${provider.provider_name || 'Proveedor'}: ${provider.error}`)

        if (providerErrors.length > 0) {
          showStatus(`Sincronizados ${d.synced} modelos (${d.total} detectados). Error: ${providerErrors[0]}`)
        } else {
          showStatus(`Sincronizados ${d.synced} modelos nuevos (${d.total} total)`)
        }

        await loadData()
      }
      else showStatus('Error al sincronizar')
    } catch { showStatus('Error al sincronizar') }
    setSyncing(false)
  }

  // === PROVIDER MANAGEMENT ===
  const openProviderForm = (p?: AIProvider) => {
    if (p) { setEditingProvider(p); setProviderForm({ name: p.name, type: p.type, base_url: p.base_url, api_key: p.api_key, is_enabled: p.is_enabled, priority: p.priority }) }
    else { setEditingProvider(null); setProviderForm({ name: '', type: 'openai', base_url: 'https://api.openai.com/v1', api_key: '', is_enabled: true, priority: 0 }) }
    setShowProviderForm(true)
  }
  const saveProvider = async () => {
    setSaving(true)
    const method = editingProvider ? 'PATCH' : 'POST'
    const body = editingProvider ? { id: editingProvider.id, ...providerForm } : providerForm
    const res = await fetch('/api/admin/providers', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) {
      // Sync after provider changes so new provider models appear immediately.
      await fetch('/api/admin/models/sync', { method: 'POST' }).catch(() => null)
      await loadData()
      setShowProviderForm(false)
      showStatus(editingProvider ? 'Proveedor actualizado' : 'Proveedor creado')
    }
    setSaving(false)
  }
  const deleteProvider = async (id: string) => {
    const res = await fetch('/api/admin/providers', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    if (res.ok) { setProviders(providers.filter(p => p.id !== id)); showStatus('Proveedor eliminado') }
  }

  // === MODEL MANAGEMENT ===
  const openModelForm = async (m?: ModelConfig) => {
    // Load roles first
    await loadRoles()

    if (m) {
      setEditingModel(m)
      setModelForm({ provider_id: m.provider_id, model_id: m.model_id, display_name: m.display_name, description: m.description, icon_url: m.icon_url, system_prompt: m.system_prompt, is_visible: m.is_visible, sort_order: m.sort_order, max_tokens: m.max_tokens, use_max_tokens: m.use_max_tokens ?? false, supports_streaming: m.supports_streaming, supports_vision: m.supports_vision })
      setIconPreview(m.icon_url || '')

      // Load existing permissions for this model
      try {
        const res = await fetch(`/api/admin/roles/permissions?resource_type=model&resource_id=${m.id}`)
        if (res.ok) {
          const data = await res.json()
          const roleIds = data.permissions?.map((p: { role_id: string }) => p.role_id) || []
          setSelectedRoles(roleIds)
        }
      } catch (e) {
        console.error('Failed to load model permissions', e)
        setSelectedRoles([])
      }
    } else {
      setEditingModel(null)
      setModelForm({ provider_id: providers[0]?.id || '', model_id: '', display_name: '', description: '', icon_url: '', system_prompt: '', is_visible: true, sort_order: models.length, max_tokens: 4096, use_max_tokens: false, supports_streaming: true, supports_vision: false })
      setIconPreview('')
      setSelectedRoles([])
    }
    setIconFile(null)
    setShowModelForm(true)
  }
  const handleIconSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIconFile(file)
    setIconPreview(URL.createObjectURL(file))
  }
  const uploadIcon = async (): Promise<string> => {
    if (!iconFile) return modelForm.icon_url
    setUploadingIcon(true)
    try {
      const supabase = createClient()
      const ext = iconFile.name.split('.').pop() || 'png'
      const path = `model_${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('model-icons').upload(path, iconFile, { upsert: true })
      if (error) { console.error('Upload error:', error); return modelForm.icon_url }
      const { data: urlData } = supabase.storage.from('model-icons').getPublicUrl(path)
      return urlData.publicUrl
    } catch { return modelForm.icon_url }
    finally { setUploadingIcon(false) }
  }
  const saveModel = async () => {
    setSaving(true)
    try {
      // Upload icon if a new file was selected
      const finalIconUrl = await uploadIcon()
      const formData = { ...modelForm, icon_url: finalIconUrl }
      const method = editingModel ? 'PATCH' : 'POST'
      const body = editingModel ? { id: editingModel.id, ...formData } : formData
      const res = await fetch('/api/admin/models', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

      if (res.ok) {
        const data = await res.json()
        const modelId = editingModel ? editingModel.id : data.model?.id

        // Save permissions if model was saved successfully
        if (modelId) {
          await saveModelPermissions(modelId)
        }

        await loadData()
        setShowModelForm(false)
        setIconFile(null)
        setIconPreview('')
        setSelectedRoles([])
        showStatus(editingModel ? 'Modelo actualizado' : 'Modelo creado')
      }
    } finally {
      setSaving(false)
    }
  }

  const saveModelPermissions = async (modelId: string) => {
    try {
      // Delete existing permissions for this model
      await fetch('/api/admin/roles/permissions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_type: 'model', resource_id: modelId })
      })

      // If roles are selected, create new permissions
      if (selectedRoles.length > 0) {
        const permissions = selectedRoles.map(roleId => ({
          role_id: roleId,
          resource_type: 'model',
          resource_id: modelId,
          can_view: true
        }))

        await fetch('/api/admin/roles/permissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissions })
        })
      }
    } catch (e) {
      console.error('Failed to save model permissions', e)
    }
  }
  const deleteModel = async (id: string) => {
    const res = await fetch('/api/admin/models', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    if (res.ok) { setModels(models.filter(m => m.id !== id)); showStatus('Modelo eliminado') }
  }
  const moveModel = async (id: string, direction: 'up' | 'down') => {
    const idx = models.findIndex(m => m.id === id)
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === models.length - 1)) return
    const newModels = [...models]
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    ;[newModels[idx], newModels[swapIdx]] = [newModels[swapIdx], newModels[idx]]
    const updates = newModels.map((m, i) => ({ id: m.id, sort_order: i }))
    setModels(newModels.map((m, i) => ({ ...m, sort_order: i })))
    for (const u of updates) {
      await fetch('/api/admin/models', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(u) })
    }
  }
  const toggleModelVisibility = async (id: string, current: boolean) => {
    const res = await fetch('/api/admin/models', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_visible: !current }) })
    if (res.ok) { setModels(models.map(m => m.id === id ? { ...m, is_visible: !current } : m)) }
  }

  // === DB CONNECTIONS MANAGEMENT ===
  const openConnForm = async (c?: DbConnection) => {
    await loadRoles()

    if (c) {
      setEditingConn(c)
      setConnForm({ name: c.name, description: c.description, db_type: c.db_type, host: c.host, port: c.port, database_name: c.database_name, username: c.username, password: c.password })

      // Load existing permissions
      try {
        const res = await fetch(`/api/admin/roles/permissions?resource_type=db_connection&resource_id=${c.id}`)
        if (res.ok) {
          const data = await res.json()
          const roleIds = data.permissions?.map((p: any) => p.role_id) || []
          setSelectedConnRoles(roleIds)
        }
      } catch (e) {
        console.error('Failed to load connection permissions', e)
      }
    } else {
      setEditingConn(null)
      setConnForm({ name: '', description: '', db_type: 'mssql', host: '', port: 1433, database_name: '', username: '', password: '' })
      setSelectedConnRoles([])
    }
    setShowConnForm(true)
  }
  const saveConnectionPermissions = async (connId: string) => {
    try {
      // Delete existing permissions
      await fetch('/api/admin/roles/permissions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_type: 'db_connection', resource_id: connId })
      })

      // If roles are selected, create new permissions
      if (selectedConnRoles.length > 0) {
        const permissions = selectedConnRoles.map(roleId => ({
          role_id: roleId,
          resource_type: 'db_connection',
          resource_id: connId,
          can_view: true
        }))

        await fetch('/api/admin/roles/permissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissions })
        })
      }
    } catch (e) {
      console.error('Failed to save connection permissions', e)
    }
  }

  const saveConnection = async () => {
    setSaving(true)
    const method = editingConn ? 'PATCH' : 'POST'
    const body = editingConn ? { id: editingConn.id, ...connForm } : connForm
    const res = await fetch('/api/admin/db-connections', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) {
      const data = await res.json()
      const connId = editingConn ? editingConn.id : data.connection.id
      await saveConnectionPermissions(connId)
      await loadData()
      setShowConnForm(false)
      showStatus(editingConn ? 'Conexion actualizada' : 'Conexion creada')
    }
    else { const d = await res.json(); showStatus(d.error || 'Error') }
    setSaving(false)
  }
  const deleteConnection = async (id: string) => {
    const res = await fetch('/api/admin/db-connections', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_active: false }) })
    if (res.ok) { setConnections(connections.filter(c => c.id !== id)); showStatus('Conexion eliminada') }
  }
  const toggleConnection = async (id: string, current: boolean) => {
    const res = await fetch('/api/admin/db-connections', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_active: !current }) })
    if (res.ok) { setConnections(connections.map(c => c.id === id ? { ...c, is_active: !current } : c)) }
  }
  const syncSchema = async (connId: string) => {
    setSyncingSchema(connId)
    try {
      const res = await fetch('/api/admin/db-connections/sync-schema', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connection_id: connId }) })
      if (res.ok) { const d = await res.json(); showStatus(`Esquema sincronizado: ${d.table_count} tablas`); await loadData() }
      else { const d = await res.json(); showStatus(d.error || 'Error al sincronizar esquema') }
    } catch { showStatus('Error al sincronizar esquema') }
    setSyncingSchema(null)
  }

  // Network drive management functions
  const openDriveForm = async (drive?: NetworkDrive) => {
    await loadRoles()

    if (drive) {
      setEditingDrive(drive)
      setDriveForm({
        name: drive.name,
        unc_path: drive.unc_path,
        description: drive.description || '',
        file_extensions: drive.file_extensions?.join(',') || '',
        max_file_size_mb: drive.max_file_size_mb || 50,
        connection_type: drive.connection_type || 'smb',
        sftp_host: drive.sftp_host || '',
        sftp_port: drive.sftp_port || 22,
        sftp_username: drive.sftp_username || '',
        sftp_password: drive.sftp_password || ''
      })

      // Load existing permissions
      try {
        const res = await fetch(`/api/admin/roles/permissions?resource_type=network_drive&resource_id=${drive.id}`)
        if (res.ok) {
          const data = await res.json()
          const roleIds = data.permissions?.map((p: any) => p.role_id) || []
          setSelectedDriveRoles(roleIds)
        }
      } catch (e) {
        console.error('Failed to load drive permissions', e)
      }
    } else {
      setEditingDrive(null)
      setDriveForm({
        name: '',
        unc_path: '',
        description: '',
        file_extensions: 'pdf,docx,xlsx,pptx,txt,csv,md,json,xml,html,doc,xls,ppt,rtf,log',
        max_file_size_mb: 50,
        connection_type: 'smb',
        sftp_host: '',
        sftp_port: 22,
        sftp_username: '',
        sftp_password: ''
      })
      setSelectedDriveRoles([])
    }
    setShowDriveForm(true)
  }

  const saveDrivePermissions = async (driveId: string) => {
    try {
      // Delete existing permissions
      await fetch('/api/admin/roles/permissions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_type: 'network_drive', resource_id: driveId })
      })

      // If roles are selected, create new permissions
      if (selectedDriveRoles.length > 0) {
        const permissions = selectedDriveRoles.map(roleId => ({
          role_id: roleId,
          resource_type: 'network_drive',
          resource_id: driveId,
          can_view: true
        }))

        await fetch('/api/admin/roles/permissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissions })
        })
      }
    } catch (e) {
      console.error('Failed to save drive permissions', e)
    }
  }

  const testSFTPConnection = async () => {
    setTestingSFTP(true)
    setSftpTestResult(null)
    try {
      const res = await fetch('/api/admin/network-drives/test-sftp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sftp_host: driveForm.sftp_host,
          sftp_port: driveForm.sftp_port,
          sftp_username: driveForm.sftp_username,
          sftp_password: driveForm.sftp_password,
          unc_path: driveForm.unc_path || '/'
        })
      })
      const data = await res.json()
      setSftpTestResult(data)
      if (data.success) {
        showStatus('✅ Conexión SFTP exitosa')
      } else {
        showStatus('❌ Error de conexión SFTP')
      }
    } catch (err) {
      setSftpTestResult({
        success: false,
        message: 'Error al probar la conexión',
        details: { error_message: err instanceof Error ? err.message : 'Error desconocido' }
      })
    }
    setTestingSFTP(false)
  }

  const saveDrive = async () => {
    setSaving(true)
    const method = editingDrive ? 'PATCH' : 'POST'
    const payload = {
      ...(editingDrive ? { id: editingDrive.id } : {}),
      name: driveForm.name,
      unc_path: driveForm.unc_path,
      description: driveForm.description,
      file_extensions: driveForm.file_extensions.split(',').map(e => e.trim()).filter(Boolean),
      max_file_size_mb: driveForm.max_file_size_mb,
      connection_type: driveForm.connection_type,
      sftp_host: driveForm.connection_type === 'sftp' ? driveForm.sftp_host : null,
      sftp_port: driveForm.connection_type === 'sftp' ? driveForm.sftp_port : null,
      sftp_username: driveForm.connection_type === 'sftp' ? driveForm.sftp_username : null,
      sftp_password: driveForm.connection_type === 'sftp' ? driveForm.sftp_password : null,
    }
    const res = await fetch('/api/admin/network-drives', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (res.ok) {
      const data = await res.json()
      const driveId = editingDrive ? editingDrive.id : data.drive.id
      await saveDrivePermissions(driveId)
      await loadData()
      setShowDriveForm(false)
      showStatus(editingDrive ? 'Unidad actualizada' : 'Unidad creada')
    }
    else { const d = await res.json(); showStatus(d.error || 'Error') }
    setSaving(false)
  }
  const deleteDrive = async (id: string) => {
    const res = await fetch('/api/admin/network-drives', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_active: false }) })
    if (res.ok) { setNetworkDrives(networkDrives.filter(d => d.id !== id)); showStatus('Unidad eliminada') }
  }
  const toggleDrive = async (id: string, current: boolean) => {
    const res = await fetch('/api/admin/network-drives', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_active: !current }) })
    if (res.ok) { setNetworkDrives(networkDrives.map(d => d.id === id ? { ...d, is_active: !current } : d)) }
  }
  const syncDrive = async (driveId: string) => {
    setSyncingDrive(driveId)
    setSyncResult(null)
    try {
      const res = await fetch('/api/admin/network-drives/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ drive_id: driveId }) })
      const data = await res.json()
      if (res.ok) {
        setSyncResult(data)
        showStatus(`Sincronizacion completada: ${data.stats?.new_files || 0} nuevos, ${data.stats?.updated_files || 0} actualizados`)
        await loadData()
      } else {
        showStatus(data.error || 'Error al sincronizar')
      }
    } catch { showStatus('Error al sincronizar unidad de red') }
    setSyncingDrive(null)
  }

  // === THEMES MANAGEMENT ===
  const changeTheme = async (themeSlug: string) => {
    try {
      // Guardar en Supabase para que se aplique a TODOS los usuarios
      const res = await fetch('/api/admin/app-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'active_theme',
          value: { slug: themeSlug, name: availableThemes[themeSlug as keyof typeof availableThemes]?.name || themeSlug }
        })
      })

      if (res.ok) {
        // Aplicar localmente
        setTheme(themeSlug as any)
        showStatus('✅ Tema actualizado para TODOS los usuarios')
        console.log('[Admin] Theme updated globally:', themeSlug)
      } else {
        showStatus('Error al guardar tema')
      }
    } catch (err) {
      console.error('[Admin] Error changing theme:', err)
      showStatus('Error al cambiar tema')
    }
  }

  // === NOTIFICATION SETTINGS MANAGEMENT ===
  const uploadNotificationSound = async (file: File) => {
    setUploadingSoundFile(true)
    try {
      // Convertir archivo a Data URL
      const reader = new FileReader()

      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      // Actualizar configuración local
      const updatedSettings = {
        ...notificationSettings,
        sound_url: dataUrl
      }
      setNotificationSettings(updatedSettings)

      // Guardar en Supabase para TODOS los usuarios
      const res = await fetch('/api/admin/app-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'notification_sound',
          value: {
            sound_url: dataUrl,
            duration_seconds: updatedSettings.duration_seconds
          }
        })
      })

      if (res.ok) {
        showStatus('✅ Sonido guardado para TODOS los usuarios')
        console.log('[Admin] Notification sound updated globally')
      } else {
        showStatus('Error al guardar sonido')
      }

      return dataUrl
    } catch (err) {
      console.error('[Admin] Error uploading sound:', err)
      showStatus('Error al procesar el archivo de sonido')
      return null
    } finally {
      setUploadingSoundFile(false)
    }
  }

  const saveNotificationSettings = async () => {
    try {
      // Guardar en Supabase para TODOS los usuarios
      const res = await fetch('/api/admin/app-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'notification_sound',
          value: {
            sound_url: notificationSettings.sound_url,
            duration_seconds: notificationSettings.duration_seconds
          }
        })
      })

      if (res.ok) {
        showStatus('✅ Configuración guardada para TODOS los usuarios')
        console.log('[Admin] Notification settings saved globally:', notificationSettings)
      } else {
        showStatus('Error al guardar configuración')
      }
    } catch (err) {
      console.error('[Admin] Error saving notification settings:', err)
      showStatus('Error al guardar configuración')
    }
  }

  const testTikaConnection = async () => {
    setTestingTika(true)
    setTikaTestResult(null)
    try {
      const res = await fetch('/api/admin/test-tika', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tikaServerUrl: docAnalysisConfig.tikaServerUrl })
      })

      const data = await res.json()

      if (data.success) {
        setTikaTestResult({
          success: true,
          message: `✅ ${data.message}`
        })
      } else {
        setTikaTestResult({
          success: false,
          message: `âŒ ${data.message}`
        })
      }
    } catch (e) {
      setTikaTestResult({
        success: false,
        message: `âŒ Error de conexión: ${e instanceof Error ? e.message : 'Unknown'}`
      })
    } finally {
      setTestingTika(false)
    }
  }

  const saveDocAnalysisConfig = async () => {
    try {
      const res = await fetch('/api/admin/doc-analysis-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docAnalysisConfig)
      })

      if (!res.ok) {
        throw new Error('Error al guardar configuración')
      }

      alert('✅ Configuración guardada correctamente')
    } catch (e) {
      alert(`âŒ Error: ${e instanceof Error ? e.message : 'Unknown'}`)
    }
  }

  const loadDocAnalysisConfig = async () => {
    try {
      const res = await fetch('/api/admin/doc-analysis-config')
      if (!res.ok) return

      const data = await res.json()
      setDocAnalysisConfig({
        extractionEngine: data.extraction_engine,
        tikaServerUrl: data.tika_server_url,
        tikaTimeout: data.tika_timeout,
        embeddingModel: data.embedding_model,
        embeddingDimensions: data.embedding_dimensions,
        embeddingBatchSize: data.embedding_batch_size,
        chunkSize: data.chunk_size,
        chunkOverlap: data.chunk_overlap,
        chunkingStrategy: data.chunking_strategy,
        ocrEnabled: data.ocr_enabled,
        ocrLanguages: data.ocr_languages,
        ocrMinTextLength: data.ocr_min_text_length,
        llmAnalysisEnabled: data.llm_analysis_enabled,
        llmAnalysisModel: data.llm_analysis_model,
        llmAnalysisTemperature: data.llm_analysis_temperature,
        embeddingCacheEnabled: data.embedding_cache_enabled,
        retryEnabled: data.retry_enabled,
        retryAttempts: data.retry_attempts,
        retryBackoffMs: data.retry_backoff_ms,
      })
    } catch (e) {
      console.error('Error loading doc analysis config:', e)
    }
  }

  // Load doc analysis config on mount
  useEffect(() => {
    loadDocAnalysisConfig()
  }, [])

  const statCards = [
    { label: 'Usuarios', value: stats.users, icon: <Users size={20} />, color: 'text-blue-600 bg-blue-50' },
    { label: 'Conversaciones', value: stats.conversations, icon: <MessageSquare size={20} />, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Mensajes', value: stats.messages, icon: <MessageSquare size={20} />, color: 'text-purple-600 bg-purple-50' },
    { label: 'Archivos', value: stats.files, icon: <FileText size={20} />, color: 'text-yellow-600 bg-yellow-50' },
    { label: 'Chunks RAG', value: stats.chunks, icon: <Database size={20} />, color: 'text-red-600 bg-red-50' },
  ]

  const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <Shield size={16} /> },
    { id: 'users', label: 'Usuarios', icon: <Users size={16} /> },
    { id: 'roles', label: 'Roles y Permisos', icon: <Crown size={16} /> },
    { id: 'tools', label: 'Herramientas', icon: <Code2 size={16} /> },
    { id: 'models', label: 'Modelos', icon: <Bot size={16} /> },
    { id: 'providers', label: 'Proveedores IA', icon: <Plug size={16} /> },
    { id: 'connections', label: 'Conexiones BD', icon: <Database size={16} /> },
    { id: 'network-drives', label: 'Unidades de Red', icon: <HardDrive size={16} /> },
    { id: 'files', label: 'Archivos Globales', icon: <FileText size={16} /> },
    { id: 'document-analysis', label: 'Análisis de Documentos', icon: <Sparkles size={16} /> },
    { id: 'agents', label: 'Agentes IA', icon: <Zap size={16} /> },
    { id: 'banners', label: 'Banners', icon: <Megaphone size={16} /> },
    { id: 'themes', label: 'Temas', icon: <Palette size={16} /> },
    { id: 'notification-sound', label: 'Sonido Notificación', icon: <Volume2 size={16} /> },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={16} /> },
    { id: 'theme-gallery', label: 'Galería de Temas', icon: <Palette size={16} /> },
    { id: 'fine-tuning', label: 'Fine-tuning', icon: <Bot size={16} /> },
    { id: 'memory', label: 'Memoria', icon: <Brain size={16} /> },
    { id: 'collaboration', label: 'Colaboración', icon: <UserPlus size={16} /> },
  ]

  function renderMainContent() {
    return (
      <div className="admin-glass min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-50/40">
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-18%] left-[-12%] w-[720px] h-[720px] rounded-full bg-gradient-to-br from-blue-400/45 to-cyan-300/35 blur-[90px]" style={{ animation: 'welcome-blob-1 12s ease-in-out infinite' }} />
        <div className="absolute top-[10%] right-[-18%] w-[680px] h-[680px] rounded-full bg-gradient-to-br from-violet-400/35 to-fuchsia-300/30 blur-[88px]" style={{ animation: 'welcome-blob-2 15s ease-in-out infinite' }} />
        <div className="absolute bottom-[-14%] left-[15%] w-[640px] h-[640px] rounded-full bg-gradient-to-br from-indigo-400/35 to-purple-300/28 blur-[82px]" style={{ animation: 'welcome-blob-3 13s ease-in-out infinite' }} />
      </div>

      {/* Header - Mejorado y Responsive */}
      <header className="liquid-glass-header px-4 md:px-6 py-3 md:py-4 flex items-center gap-2 md:gap-3 sticky top-0 z-30 backdrop-blur-xl bg-white/80 border-b border-zinc-200/50 shadow-sm">
        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="lg:hidden p-2 hover:bg-zinc-100 rounded-xl text-zinc-500 hover:text-zinc-900 transition-all duration-200 hover:scale-105"
        >
          <Menu size={20} />
        </button>

        {/* Back Button - Desktop Only */}
        <button onClick={() => router.push('/chat')} className="hidden lg:block p-2 hover:bg-zinc-100 rounded-xl text-zinc-500 hover:text-zinc-900 transition-all duration-200 hover:scale-105">
          <ArrowLeft size={18} />
        </button>

        <div className="flex items-center gap-2 md:gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30">
            <Shield size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm md:text-base font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Panel Admin
            </h1>
            <p className="text-[10px] md:text-xs text-zinc-500 hidden sm:block">Gestión del sistema</p>
          </div>
        </div>
        <div className="flex-1" />
        {statusMsg && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 animate-in shadow-sm">
            <Check size={14} /> {statusMsg}
          </div>
        )}
      </header>

      {/* Modern Mobile Menu */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop with Blur */}
          <div
            className="lg:hidden fixed inset-0 bg-gradient-to-br from-black/60 via-blue-900/40 to-indigo-900/40 backdrop-blur-md z-40 animate-in fade-in duration-300"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Modern Floating Menu Panel */}
          <div className="lg:hidden fixed inset-x-4 top-20 bottom-24 bg-white/95 backdrop-blur-2xl z-50 rounded-3xl shadow-2xl border border-white/20 animate-in zoom-in-95 slide-in-from-top-10 duration-500 overflow-hidden"
            style={{
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
            }}
          >
            {/* Modern Header with Gradient */}
            <div className="relative p-6 pb-8 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 overflow-hidden">
              {/* Animated Background Blobs */}
              <div className="absolute inset-0 opacity-30">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-full blur-3xl animate-pulse" />
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-cyan-300 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
              </div>

              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-white/20 backdrop-blur-xl border border-white/30 shadow-lg">
                    <Shield size={24} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-white font-bold text-lg tracking-tight">Panel Admin</h2>
                    <p className="text-white/90 text-xs font-medium">Gestión del sistema</p>
                  </div>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2.5 hover:bg-white/20 rounded-xl text-white transition-all hover:scale-110 active:scale-95"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative mt-4">
                <input
                  type="text"
                  placeholder="Buscar sección..."
                  className="w-full px-4 py-3 pl-11 bg-white/20 backdrop-blur-xl border border-white/30 rounded-2xl text-white placeholder-white/70 text-sm focus:outline-none focus:ring-2 focus:ring-white/50 transition-all"
                />
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/70" size={18} />
              </div>
            </div>

            {/* Modern Grid Menu */}
            <div className="overflow-y-auto h-[calc(100%-180px)] px-4 py-6 space-y-6">
              {/* Quick Access Cards */}
              <div>
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider px-1 mb-3">Acceso Rápido</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => { setTab('dashboard'); setMobileMenuOpen(false); }}
                    className={`group relative overflow-hidden rounded-2xl p-4 transition-all duration-300 ${
                      tab === 'dashboard'
                        ? 'bg-gradient-to-br from-blue-500 to-indigo-600 shadow-xl shadow-blue-500/50 scale-105'
                        : 'bg-white/60 backdrop-blur-sm border border-zinc-200/50 hover:shadow-lg hover:scale-105 active:scale-95'
                    }`}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity`} />
                    <div className="relative">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${
                        tab === 'dashboard' ? 'bg-white/20' : 'bg-gradient-to-br from-blue-500 to-indigo-600'
                      }`}>
                        <Home size={20} className={tab === 'dashboard' ? 'text-white' : 'text-white'} />
                      </div>
                      <p className={`text-sm font-bold ${tab === 'dashboard' ? 'text-white' : 'text-zinc-800'}`}>Dashboard</p>
                      <p className={`text-xs ${tab === 'dashboard' ? 'text-white/80' : 'text-zinc-500'}`}>Vista general</p>
                    </div>
                  </button>

                  <button
                    onClick={() => { setTab('users'); setMobileMenuOpen(false); }}
                    className={`group relative overflow-hidden rounded-2xl p-4 transition-all duration-300 ${
                      tab === 'users'
                        ? 'bg-gradient-to-br from-purple-500 to-pink-600 shadow-xl shadow-purple-500/50 scale-105'
                        : 'bg-white/60 backdrop-blur-sm border border-zinc-200/50 hover:shadow-lg hover:scale-105 active:scale-95'
                    }`}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity`} />
                    <div className="relative">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${
                        tab === 'users' ? 'bg-white/20' : 'bg-gradient-to-br from-purple-500 to-pink-600'
                      }`}>
                        <Users size={20} className={tab === 'users' ? 'text-white' : 'text-white'} />
                      </div>
                      <p className={`text-sm font-bold ${tab === 'users' ? 'text-white' : 'text-zinc-800'}`}>Usuarios</p>
                      <p className={`text-xs ${tab === 'users' ? 'text-white/80' : 'text-zinc-500'}`}>Gestión</p>
                    </div>
                  </button>

                  <button
                    onClick={() => { setTab('analytics'); setMobileMenuOpen(false); }}
                    className={`group relative overflow-hidden rounded-2xl p-4 transition-all duration-300 ${
                      tab === 'analytics'
                        ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-xl shadow-emerald-500/50 scale-105'
                        : 'bg-white/60 backdrop-blur-sm border border-zinc-200/50 hover:shadow-lg hover:scale-105 active:scale-95'
                    }`}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity`} />
                    <div className="relative">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${
                        tab === 'analytics' ? 'bg-white/20' : 'bg-gradient-to-br from-emerald-500 to-teal-600'
                      }`}>
                        <BarChart3 size={20} className={tab === 'analytics' ? 'text-white' : 'text-white'} />
                      </div>
                      <p className={`text-sm font-bold ${tab === 'analytics' ? 'text-white' : 'text-zinc-800'}`}>Analytics</p>
                      <p className={`text-xs ${tab === 'analytics' ? 'text-white/80' : 'text-zinc-500'}`}>Estadísticas</p>
                    </div>
                  </button>

                  <button
                    onClick={() => { setTab('models'); setMobileMenuOpen(false); }}
                    className={`group relative overflow-hidden rounded-2xl p-4 transition-all duration-300 ${
                      tab === 'models'
                        ? 'bg-gradient-to-br from-orange-500 to-red-600 shadow-xl shadow-orange-500/50 scale-105'
                        : 'bg-white/60 backdrop-blur-sm border border-zinc-200/50 hover:shadow-lg hover:scale-105 active:scale-95'
                    }`}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity`} />
                    <div className="relative">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${
                        tab === 'models' ? 'bg-white/20' : 'bg-gradient-to-br from-orange-500 to-red-600'
                      }`}>
                        <Bot size={20} className={tab === 'models' ? 'text-white' : 'text-white'} />
                      </div>
                      <p className={`text-sm font-bold ${tab === 'models' ? 'text-white' : 'text-zinc-800'}`}>Modelos</p>
                      <p className={`text-xs ${tab === 'models' ? 'text-white/80' : 'text-zinc-500'}`}>IA</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Configuración Section */}
              <div className="p-3">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-3 mb-2">Configuración</p>
                <div className="space-y-1">
                  <button
                    onClick={() => { setTab('roles'); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                      tab === 'roles'
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg'
                        : 'text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <Crown size={18} />
                    <span className="text-sm font-medium">Roles y Permisos</span>
                  </button>
                  <button
                    onClick={() => { setTab('tools'); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                      tab === 'tools'
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg'
                        : 'text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <Code2 size={18} />
                    <span className="text-sm font-medium">Herramientas</span>
                  </button>
                  <button
                    onClick={() => { setTab('themes'); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                      tab === 'themes'
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg'
                        : 'text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <Palette size={18} />
                    <span className="text-sm font-medium">Temas</span>
                  </button>
                  <button
                    onClick={() => { setTab('notification-sound'); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                      tab === 'notification-sound'
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg'
                        : 'text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <Volume2 size={18} />
                    <span className="text-sm font-medium">Sonido Notificación</span>
                  </button>
                </div>
              </div>

              {/* IA y Modelos Section */}
              <div className="p-3">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-3 mb-2">IA y Modelos</p>
                <div className="space-y-1">
                  <button
                    onClick={() => { setTab('models'); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                      tab === 'models'
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg'
                        : 'text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <Bot size={18} />
                    <span className="text-sm font-medium">Modelos</span>
                  </button>
                  <button
                    onClick={() => { setTab('providers'); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                      tab === 'providers'
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg'
                        : 'text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <Plug size={18} />
                    <span className="text-sm font-medium">Proveedores IA</span>
                  </button>
                  <button
                    onClick={() => { setTab('agents'); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                      tab === 'agents'
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg'
                        : 'text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <Zap size={18} />
                    <span className="text-sm font-medium">Agentes IA</span>
                  </button>
                  <button
                    onClick={() => { setTab('fine-tuning'); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                      tab === 'fine-tuning'
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg'
                        : 'text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <Bot size={18} />
                    <span className="text-sm font-medium">Fine-tuning</span>
                  </button>
                </div>
              </div>

              {/* Datos Section */}
              <div className="p-3">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-3 mb-2">Datos</p>
                <div className="space-y-1">
                  <button
                    onClick={() => { setTab('connections'); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                      tab === 'connections'
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg'
                        : 'text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <Database size={18} />
                    <span className="text-sm font-medium">Conexiones BD</span>
                  </button>
                  <button
                    onClick={() => { setTab('network-drives'); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                      tab === 'network-drives'
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg'
                        : 'text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <HardDrive size={18} />
                    <span className="text-sm font-medium">Unidades de Red</span>
                  </button>
                  <button
                    onClick={() => { setTab('files'); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                      tab === 'files'
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg'
                        : 'text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <FileText size={18} />
                    <span className="text-sm font-medium">Archivos Globales</span>
                  </button>
                  <button
                    onClick={() => { setTab('document-analysis'); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                      tab === 'document-analysis'
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg'
                        : 'text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <Sparkles size={18} />
                    <span className="text-sm font-medium">Análisis de Documentos</span>
                  </button>
                  <button
                    onClick={() => { setTab('memory'); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                      tab === 'memory'
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg'
                        : 'text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <Brain size={18} />
                    <span className="text-sm font-medium">Memoria</span>
                  </button>
                </div>
              </div>

              {/* Otros Section */}
              <div className="p-3">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-3 mb-2">Otros</p>
                <div className="space-y-1">
                  <button
                    onClick={() => { setTab('banners'); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                      tab === 'banners'
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg'
                        : 'text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <Megaphone size={18} />
                    <span className="text-sm font-medium">Banners</span>
                  </button>
                  <button
                    onClick={() => { setTab('theme-gallery'); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                      tab === 'theme-gallery'
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg'
                        : 'text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <Palette size={18} />
                    <span className="text-sm font-medium">Galería de Temas</span>
                  </button>
                  <button
                    onClick={() => { setTab('collaboration'); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                      tab === 'collaboration'
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg'
                        : 'text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <UserPlus size={18} />
                    <span className="text-sm font-medium">Colaboración</span>
                  </button>
                </div>
              </div>

              {/* Back to Chat Button */}
              <div className="p-3 border-t border-zinc-200">
                <button
                  onClick={() => router.push('/chat')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition-all"
                >
                  <ArrowLeft size={18} />
                  <span className="text-sm font-medium">Volver al Chat</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Bottom Navigation - Mobile Only */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-zinc-200 shadow-2xl pb-safe">
        <div className="grid grid-cols-4 gap-1 px-2 py-2">
          <button
            onClick={() => setTab('dashboard')}
            className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-all ${
              tab === 'dashboard'
                ? 'bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-lg'
                : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <Home size={20} />
            <span className="text-[10px] font-medium">Inicio</span>
          </button>
          <button
            onClick={() => setTab('users')}
            className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-all ${
              tab === 'users'
                ? 'bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-lg'
                : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <Users size={20} />
            <span className="text-[10px] font-medium">Usuarios</span>
          </button>
          <button
            onClick={() => setTab('analytics')}
            className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-all ${
              tab === 'analytics'
                ? 'bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-lg'
                : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <BarChart3 size={20} />
            <span className="text-[10px] font-medium">Analytics</span>
          </button>
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl text-zinc-600 hover:bg-zinc-100 transition-all"
          >
            <LayoutGrid size={20} />
            <span className="text-[10px] font-medium">Más</span>
          </button>
        </div>
      </div>

      <div className="flex relative z-10">
        {/* Sidebar tabs - Desktop Only */}
        <nav className="hidden lg:flex lg:flex-col w-72 liquid-glass-sidebar min-h-[calc(100vh-65px)] p-6 space-y-2 bg-gradient-to-b from-white/95 to-white/90 backdrop-blur-xl border-r border-zinc-200/50 shadow-xl">
          <div className="mb-6 pb-6 border-b border-zinc-200/50">
            <h2 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Navegación
            </h2>
            <p className="text-xs text-zinc-500 mt-1">Gestión del sistema</p>
          </div>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`w-full text-left px-4 py-3.5 text-sm rounded-xl flex items-center gap-3 transition-all duration-200 ${
                tab === t.id
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-medium shadow-lg shadow-blue-500/30 scale-[1.02]'
                  : 'text-zinc-600 hover:bg-zinc-100/80 hover:text-zinc-900 hover:scale-[1.01] font-medium'
              }`}>
              <div className={`${tab === t.id ? 'text-white' : 'text-zinc-400'}`}>
                {t.icon}
              </div>
              {t.label}
            </button>
          ))}
        </nav>

        {/* Content - Responsive */}
        <main className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8 pb-24 lg:pb-8 max-w-7xl mx-auto w-full overflow-x-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-zinc-400" size={28} /></div>
          ) : (
            <>
              {/* DASHBOARD TAB - Mejorado y Responsive */}
              {tab === 'dashboard' && (
                <div>
                  <h2 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-6">
                    Dashboard General
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 mb-6">
                    {statCards.map(s => (
                      <div key={s.label} className="liquid-glass-card rounded-xl p-4 md:p-5 hover:shadow-xl hover:scale-105 transition-all duration-200 cursor-pointer">
                        <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center mb-3 shadow-lg ${s.color}`}>{s.icon}</div>
                        <p className="text-xl md:text-2xl font-bold text-zinc-800">{s.value.toLocaleString()}</p>
                        <p className="text-xs md:text-sm text-zinc-500 font-medium">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Storage Statistics - Mejorado y Responsive */}
                  {storageStats && (
                    <div className="mt-6">
                      <h3 className="text-base md:text-lg font-bold text-zinc-800 mb-4">📊 Estadísticas de Storage</h3>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                        {/* Total Storage Card */}
                        <div className="liquid-glass-card rounded-xl p-5 md:p-6 hover:shadow-xl transition-all duration-200">
                          <div className="flex items-center gap-4 mb-3">
                            <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                              <HardDrive size={24} className="text-white" />
                            </div>
                            <div>
                              <p className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                                {formatBytes(storageStats.total)}
                              </p>
                              <p className="text-xs md:text-sm text-zinc-500 font-medium">Storage total utilizado</p>
                            </div>
                          </div>
                        </div>

                        {/* Top Users by Storage */}
                        <div className="liquid-glass-card rounded-xl p-5 md:p-6 hover:shadow-xl transition-all duration-200">
                          <h4 className="text-sm md:text-base font-bold text-zinc-700 mb-4 flex items-center gap-2">
                            <Users size={18} className="text-blue-600" />
                            Top usuarios por storage
                          </h4>
                          <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                            {storageStats.by_user.slice(0, 10).map((user, idx) => (
                              <div key={user.user_id} className="flex items-center justify-between text-xs md:text-sm p-2 rounded-lg hover:bg-white/60 transition-colors">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span className="text-zinc-400 font-bold text-xs w-5">#{idx + 1}</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-zinc-700 font-semibold truncate">
                                      {user.user_name || user.user_id}
                                    </p>
                                    <p className="text-zinc-400 text-xs">{user.file_count} archivos</p>
                                  </div>
                                </div>
                                <div className="text-right ml-3">
                                  <p className="text-zinc-800 font-bold">{formatBytes(user.size)}</p>
                                  <p className="text-blue-600 text-xs font-medium">
                                    {((user.size / storageStats.total) * 100).toFixed(1)}%
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* USERS TAB */}
              {tab === 'users' && renderUsersTab()}

              {/* ROLES TAB */}
              {tab === 'roles' && renderRolesTab()}

              {/* TOOLS TAB */}
              {tab === 'tools' && <ToolsManagement />}

              {/* MODELS TAB */}
              {tab === 'models' && renderModelsTab()}

              {/* PROVIDERS TAB */}
              {tab === 'providers' && renderProvidersTab()}

              {/* CONNECTIONS TAB */}
              {tab === 'connections' && renderConnectionsTab()}

              {/* NETWORK DRIVES TAB */}
              {tab === 'network-drives' && renderNetworkDrivesTab()}

              {/* FILES TAB */}
              {tab === 'files' && renderFilesTab()}

              {/* DOCUMENT ANALYSIS TAB */}
              {tab === 'document-analysis' && renderDocumentAnalysisTab()}

              {/* AGENTS TAB */}
              {tab === 'agents' && renderAgentsTab()}

              {/* BANNERS TAB */}
              {tab === 'banners' && renderBannersTab()}

              {/* THEMES TAB */}
              {tab === 'themes' && renderThemesTab()}

              {/* NOTIFICATION SOUND TAB */}
              {tab === 'notification-sound' && renderNotificationSoundTab()}

              {/* ANALYTICS TAB */}
              {tab === 'analytics' && (
                <div>
                  <AnalyticsDashboard isAdmin={true} />
                </div>
              )}

              {/* THEME GALLERY TAB */}
              {tab === 'theme-gallery' && (
                <div>
                  <ThemeGallery />
                </div>
              )}

              {/* FINE-TUNING TAB */}
              {tab === 'fine-tuning' && (
                <div className="space-y-8">
                  <DatasetUploader />
                  <JobMonitor />
                </div>
              )}

              {/* MEMORY TAB */}
              {tab === 'memory' && (
                <div>
                  <MemoryCategories />
                </div>
              )}

              {/* COLLABORATION TAB */}
              {tab === 'collaboration' && (
                <div>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-6">
                    <h2 className="text-xl font-bold text-white mb-4">Sistema de Colaboración</h2>
                    <p className="text-white/60 mb-6">
                      El sistema de colaboración permite a múltiples usuarios trabajar juntos en conversaciones.
                      Los componentes de colaboración (reacciones, typing indicators, participantes) se integran
                      directamente en las conversaciones individuales.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-purple-500/20 border border-purple-500/30 rounded-lg p-4">
                        <h3 className="font-semibold text-white mb-2">✨ Reacciones</h3>
                        <p className="text-sm text-white/60">
                          Los usuarios pueden reaccionar a mensajes con emojis
                        </p>
                      </div>
                      <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-4">
                        <h3 className="font-semibold text-white mb-2">👥 Participantes</h3>
                        <p className="text-sm text-white/60">
                          Invita usuarios y gestiona permisos de colaboración
                        </p>
                      </div>
                      <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-4">
                        <h3 className="font-semibold text-white mb-2">⌨️ Typing Indicators</h3>
                        <p className="text-sm text-white/60">
                          Ve cuando otros usuarios están escribiendo
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {chatViewerOpen && (
        <div
          className="fixed inset-0 z-40 bg-zinc-900/35 backdrop-blur-[2px] flex items-center justify-center p-2 sm:p-4"
          onClick={closeChatViewer}
        >
          <div
            className="liquid-glass-dropdown w-full max-w-6xl h-[95vh] sm:h-[90vh] md:h-[82vh] rounded-xl sm:rounded-2xl overflow-hidden flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-white/45 bg-white/20 flex items-center justify-between gap-2 sm:gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-800 truncate">
                  Chats de {chatViewerUser?.name || chatViewerUser?.email || 'Usuario'}
                </p>
                <p className="text-xs text-zinc-500">
                  {userConversations.length} conversaciones
                </p>
              </div>
              <button onClick={closeChatViewer} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] lg:grid-cols-[320px_minmax(0,1fr)]">
              <aside className="hidden md:block border-r border-white/45 bg-white/20 overflow-y-auto p-2 sm:p-3 space-y-2">
                {loadingUserConversations ? (
                  <div className="h-full flex items-center justify-center text-zinc-400">
                    <Loader2 size={18} className="animate-spin" />
                  </div>
                ) : userConversations.length === 0 ? (
                  <p className="text-xs text-zinc-500">Este usuario no tiene conversaciones.</p>
                ) : (
                  userConversations.map((conversation) => {
                    const isSelected = selectedConversationId === conversation.id
                    const timestamp = conversation.updated_at || conversation.created_at
                    return (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => { void openConversationMessages(conversation.id) }}
                        className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
                          isSelected
                            ? 'bg-indigo-50 border-indigo-200'
                            : 'bg-white/70 border-white/70 hover:bg-white'
                        }`}
                      >
                        <p className="text-sm font-medium text-zinc-800 truncate">{conversation.title || 'Sin titulo'}</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          {conversation.message_count} msgs
                          {' · '}
                          {new Date(timestamp).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                        </p>
                        {conversation.last_message_preview ? (
                          <p className="text-[11px] text-zinc-400 mt-1 truncate">{conversation.last_message_preview}</p>
                        ) : null}
                      </button>
                    )
                  })
                )}
              </aside>

              <section className="min-h-0 flex flex-col bg-white/20">
                {loadingConversationMessages ? (
                  <div className="flex-1 flex items-center justify-center text-zinc-400">
                    <Loader2 size={18} className="animate-spin" />
                  </div>
                ) : selectedConversation ? (
                  <>
                    <div className="px-4 py-3 border-b border-white/45 bg-white/25">
                      <p className="text-sm font-semibold text-zinc-800">{selectedConversation.title || 'Sin titulo'}</p>
                      <p className="text-xs text-zinc-500">
                        Modelo: {selectedConversation.model_default || 'N/A'}
                        {' · '}
                        {conversationMessages.length} mensajes
                        {' · '}
                        {new Date(selectedConversation.updated_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gradient-to-br from-[#eef8ff]/70 via-[#f7fbff]/65 to-[#f5f3ff]/65">
                      {conversationMessages.length === 0 ? (
                        <p className="text-sm text-zinc-500">Conversacion sin mensajes.</p>
                      ) : (
                        conversationMessages.map((message) => {
                          const attachmentCount = Array.isArray(message.attachments_json) ? message.attachments_json.length : 0
                          const isUserMessage = message.role === 'user'
                          const senderName = message.user_name || (message.role === 'assistant' ? 'GIA' : message.role)
                          const senderInitial = senderName.trim().charAt(0).toUpperCase()
                          return (
                            <div key={message.id} className={`flex ${isUserMessage ? 'justify-end' : 'justify-start'}`}>
                              <article className={`max-w-[88%] flex gap-2.5 items-start ${isUserMessage ? 'flex-row-reverse' : ''}`}>
                                <div className={`w-8 h-8 rounded-lg text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5 ${
                                  isUserMessage
                                    ? 'bg-blue-500/85 text-white border border-blue-300/70'
                                    : 'bg-white/80 border border-zinc-200 text-zinc-600'
                                }`}>
                                  {senderInitial || 'G'}
                                </div>
                                <div
                                  className={`rounded-2xl px-3.5 py-2.5 border shadow-sm backdrop-blur-md ${
                                    isUserMessage
                                      ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white border-blue-500/45'
                                      : 'bg-white/72 border-white/75 text-zinc-800 shadow-[0_10px_24px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.55)]'
                                  }`}
                                >
                                  <div className={`flex items-center justify-between gap-3 mb-1.5 text-[11px] ${isUserMessage ? 'text-blue-100' : 'text-zinc-500'}`}>
                                    <span className={`font-medium ${isUserMessage ? 'text-blue-50' : 'text-zinc-700'}`}>{senderName}</span>
                                    <span>{new Date(message.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</span>
                                  </div>
                                  <div className={`${isUserMessage ? 'prose prose-sm prose-invert max-w-none prose-p:my-1.5 prose-headings:text-white prose-strong:text-white' : 'prose prose-sm max-w-none prose-p:my-1.5 prose-headings:text-zinc-800 prose-strong:text-zinc-800'}`}>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                      {message.content || '(sin contenido)'}
                                    </ReactMarkdown>
                                  </div>
                                  {attachmentCount > 0 && (
                                    <p className={`mt-1.5 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] ${isUserMessage ? 'bg-white/15 text-blue-50' : 'bg-zinc-100/85 text-zinc-600'}`}>
                                      Adjuntos: {attachmentCount}
                                    </p>
                                  )}
                                </div>
                              </article>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
                    Selecciona una conversacion para verla.
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
    )
  }

  // ======= RENDER FUNCTIONS =======

  function renderUsersTab() {
    return (
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-lg md:text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Usuarios ({users.length})
          </h2>
          <button
            onClick={() => setShowCreateUserModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm rounded-xl hover:from-blue-500 hover:to-indigo-500 transition-all shadow-lg hover:shadow-xl"
          >
            <Plus size={16} />
            Crear Usuario
          </button>
        </div>
        <div className="liquid-glass-card rounded-xl overflow-hidden shadow-lg">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="bg-gradient-to-r from-zinc-50 to-zinc-100/50 border-b border-zinc-200">
                  <th className="text-left px-4 py-3 text-xs text-zinc-600 font-semibold">Usuario</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-600 font-semibold">Email</th>
                <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Actividad</th>
                <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Rol</th>
                <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Creado</th>
                <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const status = statusInfo(u.activity_status)
                const lastSeen = formatLastSeen(u.activity_last_seen_at)
                const initials = (u.name || u.email || 'U').trim().charAt(0).toUpperCase()
                const isAdmin = (u.role || '').toLowerCase() === 'admin'

                return (
                <React.Fragment key={u.id}>
                <tr className="border-b border-zinc-100/70 hover:bg-white/40">
                  <td className="px-4 py-3">
                    {editingUser === u.id ? (
                      <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-2 py-1 border border-zinc-300 rounded text-sm" />
                    ) : (
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`relative h-10 w-10 rounded-full group ${isAdmin ? 'admin-crown-wrap' : ''}`}>
                          <div className={`h-full w-full rounded-full overflow-hidden bg-white flex items-center justify-center ${isAdmin ? 'admin-crown-ring' : 'ring-1 ring-zinc-200/80'}`}>
                            {u.avatar_url ? (
                              <img src={u.avatar_url} alt={u.name || u.email || 'Usuario'} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs font-semibold text-zinc-500">{initials}</span>
                            )}
                          </div>
                          {isAdmin && (
                            <span className="admin-crown-badge" aria-hidden="true">
                              <Crown size={8} strokeWidth={2.2} />
                            </span>
                          )}
                          {/* Upload avatar button */}
                          <label className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                            {uploadingAvatarForUser === u.id ? (
                              <Loader2 size={14} className="text-white animate-spin" />
                            ) : (
                              <Upload size={14} className="text-white" />
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={uploadingAvatarForUser === u.id}
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) handleUserAvatarUpload(u.id, file)
                              }}
                            />
                          </label>
                        </div>
                        <div className="min-w-0">
                          <p className="text-zinc-700 font-medium truncate">{u.name || 'Sin nombre'}</p>
                          <p className="text-[11px] text-zinc-400 truncate">{u.id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{u.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${status.text}`}>
                        <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                      {u.activity_status === 'offline' && lastSeen && (
                        <span className="text-[10px] text-zinc-400">Ult. {lastSeen}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {editingUser === u.id ? (
                      <select value={editRole} onChange={e => setEditRole(e.target.value)} className="px-2 py-1 border border-zinc-300 rounded text-sm">
                        {allRoles.map(role => (
                          <option key={role.id} value={role.name}>{role.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${isAdmin ? 'bg-purple-50 text-purple-600' : 'bg-zinc-100 text-zinc-500'}`}>{u.role}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{new Date(u.created_at).toLocaleDateString('es-ES')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {editingUser === u.id ? (
                        <>
                          <button onClick={() => saveUser(u.id)} disabled={saving} className="p-1.5 hover:bg-emerald-50 rounded-lg text-emerald-600"><Check size={14} /></button>
                          <button onClick={() => setEditingUser(null)} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400"><X size={14} /></button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => openPrivateChat(u.id)}
                            disabled={openingDmUserId === u.id || u.id === currentUserId}
                            className="p-1.5 hover:bg-blue-50 rounded-lg text-zinc-400 hover:text-blue-600 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
                            title={u.id === currentUserId ? 'No disponible para tu usuario' : 'Abrir chat privado'}
                          >
                            {openingDmUserId === u.id ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
                          </button>
                          <button
                            onClick={() => { void openUserChatsViewer(u) }}
                            className="p-1.5 hover:bg-indigo-50 rounded-lg text-zinc-400 hover:text-indigo-600"
                            title="Ver chats del usuario"
                          >
                            <MessageSquare size={14} />
                          </button>
                          <button
                            onClick={() => setExpandedUserTokens(expandedUserTokens === u.id ? null : u.id)}
                            className={`p-1.5 hover:bg-purple-50 rounded-lg ${expandedUserTokens === u.id ? 'text-purple-600 bg-purple-50' : 'text-zinc-400 hover:text-purple-600'}`}
                            title="Ver consumo de tokens"
                          >
                            <Zap size={14} />
                          </button>
                          <button onClick={() => startEditUser(u)} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400" title="Editar"><Edit3 size={14} /></button>
                          {confirmDelete === u.id ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => deleteUser(u.id)} disabled={saving} className="px-2 py-1 bg-red-500 text-white rounded text-xs">Confirmar</button>
                              <button onClick={() => setConfirmDelete(null)} className="px-2 py-1 bg-zinc-200 rounded text-xs">Cancelar</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDelete(u.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-500" title="Eliminar"><Trash2 size={14} /></button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                {/* Fila expandible para mostrar consumo de tokens */}
                {expandedUserTokens === u.id && (
                  <tr>
                    <td colSpan={6} className="px-4 py-3 bg-gradient-to-br from-purple-50/50 to-blue-50/50 border-t border-purple-100">
                      <div className="max-w-2xl">
                        <h3 className="text-sm font-semibold text-purple-900 mb-3 flex items-center gap-2">
                          <Zap size={16} className="text-purple-600" />
                          Consumo de Tokens - {u.name || u.email}
                        </h3>
                        <UserTokenUsage userId={u.id} />
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
                )
              })}
            </tbody>
          </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-zinc-200">
            {users.map(u => {
              const status = statusInfo(u.activity_status)
              const lastSeen = formatLastSeen(u.activity_last_seen_at)
              const initials = (u.name || u.email || 'U').trim().charAt(0).toUpperCase()
              const isAdmin = (u.role || '').toLowerCase() === 'admin'

              return (
                <div key={u.id} className="p-4 hover:bg-white/40 transition-colors">
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`relative h-12 w-12 rounded-full shrink-0 group ${isAdmin ? 'admin-crown-wrap' : ''}`}>
                      <div className={`h-full w-full rounded-full overflow-hidden bg-white flex items-center justify-center ${isAdmin ? 'admin-crown-ring' : 'ring-2 ring-zinc-200/80'}`}>
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt={u.name || u.email || 'Usuario'} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm font-semibold text-zinc-500">{initials}</span>
                        )}
                      </div>
                      {isAdmin && (
                        <span className="admin-crown-badge" aria-hidden="true">
                          <Crown size={8} strokeWidth={2.2} />
                        </span>
                      )}
                      {/* Upload avatar button */}
                      <label className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                        {uploadingAvatarForUser === u.id ? (
                          <Loader2 size={16} className="text-white animate-spin" />
                        ) : (
                          <Upload size={16} className="text-white" />
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingAvatarForUser === u.id}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleUserAvatarUpload(u.id, file)
                          }}
                        />
                      </label>
                    </div>
                    <div className="flex-1 min-w-0">
                      {editingUser === u.id ? (
                        <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-2 py-1 border border-zinc-300 rounded text-sm mb-1" />
                      ) : (
                        <p className="text-sm font-semibold text-zinc-800 truncate">{u.name || 'Sin nombre'}</p>
                      )}
                      <p className="text-xs text-zinc-500 truncate">{u.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${status.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                          {status.label}
                        </span>
                        {editingUser === u.id ? (
                          <select value={editRole} onChange={e => setEditRole(e.target.value)} className="px-2 py-0.5 border border-zinc-300 rounded text-xs">
                            {allRoles.map(role => (
                              <option key={role.id} value={role.name}>{role.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${isAdmin ? 'bg-purple-50 text-purple-600' : 'bg-zinc-100 text-zinc-500'}`}>
                            {u.role}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    {editingUser === u.id ? (
                      <>
                        <button onClick={() => saveUser(u.id)} disabled={saving} className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-medium">
                          Guardar
                        </button>
                        <button onClick={() => setEditingUser(null)} className="px-3 py-1.5 bg-zinc-200 text-zinc-700 rounded-lg text-xs font-medium">
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => openPrivateChat(u.id)}
                          disabled={openingDmUserId === u.id || u.id === currentUserId}
                          className="p-2 hover:bg-blue-50 rounded-lg text-zinc-400 hover:text-blue-600 disabled:opacity-40"
                          title="Chat privado"
                        >
                          {openingDmUserId === u.id ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
                        </button>
                        <button
                          onClick={() => { void openUserChatsViewer(u) }}
                          className="p-2 hover:bg-indigo-50 rounded-lg text-zinc-400 hover:text-indigo-600"
                          title="Ver chats"
                        >
                          <MessageSquare size={16} />
                        </button>
                        <button
                          onClick={() => setExpandedUserTokens(expandedUserTokens === u.id ? null : u.id)}
                          className={`p-2 hover:bg-purple-50 rounded-lg ${expandedUserTokens === u.id ? 'text-purple-600 bg-purple-50' : 'text-zinc-400 hover:text-purple-600'}`}
                          title="Ver tokens"
                        >
                          <Zap size={16} />
                        </button>
                        <button onClick={() => startEditUser(u)} className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-400" title="Editar">
                          <Edit3 size={16} />
                        </button>
                        {confirmDelete === u.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => deleteUser(u.id)} disabled={saving} className="px-2 py-1 bg-red-500 text-white rounded text-xs">
                              Confirmar
                            </button>
                            <button onClick={() => setConfirmDelete(null)} className="px-2 py-1 bg-zinc-200 rounded text-xs">
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmDelete(u.id)} className="p-2 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-500" title="Eliminar">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {/* Panel expandible de tokens en móvil */}
                  {expandedUserTokens === u.id && (
                    <div className="mt-3 p-3 bg-gradient-to-br from-purple-50/50 to-blue-50/50 rounded-lg border border-purple-100">
                      <h4 className="text-xs font-semibold text-purple-900 mb-2 flex items-center gap-1.5">
                        <Zap size={14} className="text-purple-600" />
                        Consumo de Tokens
                      </h4>
                      <UserTokenUsage userId={u.id} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  function renderRolesTab() {
    return <RolesManagement />
  }

  function renderModelsTab() {
    return (
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-lg md:text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Modelos IA ({models.length})
          </h2>
          <div className="flex gap-2">
            <button onClick={syncModels} disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-xs md:text-sm rounded-lg hover:shadow-lg hover:scale-105 disabled:opacity-50 transition-all duration-200 font-medium shadow-md">
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              <span className="hidden sm:inline">Sincronizar</span>
            </button>
            <button onClick={() => openModelForm()}
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-xs md:text-sm rounded-lg hover:shadow-lg hover:scale-105 transition-all duration-200 font-medium shadow-md">
              <Plus size={14} /> <span className="hidden sm:inline">Añadir modelo</span><span className="sm:hidden">Nuevo</span>
            </button>
          </div>
        </div>

        {/* Model edit form - Responsive */}
        {showModelForm && (
          <div className="bg-white border border-blue-200 rounded-xl p-4 md:p-6 mb-4 space-y-4 shadow-lg">
            <p className="text-sm md:text-base font-semibold text-zinc-800">{editingModel ? 'Editar modelo' : 'Nuevo modelo'}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Proveedor</label>
                <select value={modelForm.provider_id} onChange={e => setModelForm({ ...modelForm, provider_id: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white">
                  <option value="">Seleccionar...</option>
                  {providers.map(p => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">ID del modelo</label>
                <input value={modelForm.model_id} onChange={e => setModelForm({ ...modelForm, model_id: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="gpt-4o" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Nombre visible</label>
                <input value={modelForm.display_name} onChange={e => setModelForm({ ...modelForm, display_name: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="GPT-4o" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Imagen del modelo</label>
                <div className="flex items-center gap-3">
                  {iconPreview ? (
                    <img src={iconPreview} alt="" className="w-10 h-10 rounded-lg object-cover border border-zinc-200" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center justify-center">
                      <Bot size={18} className="text-zinc-400" />
                    </div>
                  )}
                  <input ref={iconInputRef} type="file" accept="image/*" onChange={handleIconSelect} className="hidden" />
                  <button type="button" onClick={() => iconInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-2 border border-zinc-300 rounded-lg text-sm text-zinc-600 hover:bg-zinc-50 transition-colors">
                    {uploadingIcon ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {iconPreview ? 'Cambiar imagen' : 'Subir imagen'}
                  </button>
                  {iconPreview && (
                    <button type="button" onClick={() => { setIconFile(null); setIconPreview(''); setModelForm({ ...modelForm, icon_url: '' }) }}
                      className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-zinc-500 mb-1 block">Descripcion</label>
                <input value={modelForm.description} onChange={e => setModelForm({ ...modelForm, description: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="Modelo rapido y eficiente..." />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-zinc-500 mb-1 block">Instrucciones del sistema</label>
                <textarea value={modelForm.system_prompt} onChange={e => setModelForm({ ...modelForm, system_prompt: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm h-20 resize-none" placeholder="Eres un asistente..." />
              </div>
              <div className="flex items-center gap-6 col-span-2 flex-wrap">
                <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
                  <input type="checkbox" checked={modelForm.is_visible} onChange={e => setModelForm({ ...modelForm, is_visible: e.target.checked })} className="rounded" /> Visible
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
                  <input type="checkbox" checked={modelForm.supports_streaming} onChange={e => setModelForm({ ...modelForm, supports_streaming: e.target.checked })} className="rounded" /> Streaming
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
                  <input type="checkbox" checked={modelForm.supports_vision} onChange={e => setModelForm({ ...modelForm, supports_vision: e.target.checked })} className="rounded" /> Vision
                </label>
              </div>
              <div className="col-span-2 flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
                  <input type="checkbox" checked={modelForm.use_max_tokens} onChange={e => setModelForm({ ...modelForm, use_max_tokens: e.target.checked })} className="rounded" /> Limitar tokens
                </label>
                {modelForm.use_max_tokens && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-zinc-600">Max tokens:</label>
                    <input type="number" value={modelForm.max_tokens} onChange={e => setModelForm({ ...modelForm, max_tokens: parseInt(e.target.value) || 4096 })} className="w-28 px-2 py-1.5 border border-zinc-300 rounded-lg text-sm" />
                  </div>
                )}
                {!modelForm.use_max_tokens && (
                  <span className="text-xs text-zinc-400">Sin limite de tokens (recomendado)</span>
                )}
              </div>

              {/* Roles selector */}
              <div className="col-span-2">
                <label className="text-xs text-zinc-500 mb-1 block">👥 Roles con acceso a este modelo</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowRolesDropdown(!showRolesDropdown)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm text-left flex items-center justify-between bg-white hover:bg-zinc-50 transition-colors"
                  >
                    <span className="text-zinc-700">
                      {selectedRoles.length === 0
                        ? 'Seleccionar roles...'
                        : `${selectedRoles.length} rol(es) seleccionado(s)`}
                    </span>
                    <ChevronRight size={16} className={`text-zinc-400 transition-transform ${showRolesDropdown ? 'rotate-90' : ''}`} />
                  </button>

                  {showRolesDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-300 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                      {availableRoles.map(role => (
                        <label
                          key={role.id}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 cursor-pointer transition-colors border-b border-zinc-100 last:border-b-0"
                        >
                          <input
                            type="checkbox"
                            checked={selectedRoles.includes(role.id)}
                            onChange={() => {
                              setSelectedRoles(prev =>
                                prev.includes(role.id)
                                  ? prev.filter(id => id !== role.id)
                                  : [...prev, role.id]
                              )
                            }}
                            className="w-4 h-4 text-blue-600 rounded border-zinc-300 focus:ring-blue-500"
                          />
                          <span className="text-sm text-zinc-700">{role.name}</span>
                        </label>
                      ))}
                      {availableRoles.length === 0 && (
                        <div className="px-3 py-2 text-sm text-zinc-400 text-center">
                          No hay roles disponibles
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  💡 Si no seleccionas ningún rol, todos los usuarios podrán ver este modelo
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={saveModel} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
              </button>
              <button onClick={() => setShowModelForm(false)} className="px-4 py-2 text-sm text-zinc-500 hover:bg-zinc-100 rounded-lg">Cancelar</button>
            </div>
          </div>
        )}

        {/* Models list */}
        <div className="space-y-1.5">
          {models.map((m, idx) => (
            <div key={m.id} className={`flex items-center gap-3 px-4 py-3 bg-white border rounded-xl transition-colors ${m.is_visible ? 'border-zinc-200' : 'border-zinc-200 opacity-50'}`}>
              <div className="flex flex-col gap-0.5">
                <button onClick={() => moveModel(m.id, 'up')} disabled={idx === 0} className="p-0.5 hover:bg-zinc-100 rounded text-zinc-400 disabled:opacity-20"><ArrowUp size={12} /></button>
                <button onClick={() => moveModel(m.id, 'down')} disabled={idx === models.length - 1} className="p-0.5 hover:bg-zinc-100 rounded text-zinc-400 disabled:opacity-20"><ArrowDown size={12} /></button>
              </div>
              <GripVertical size={14} className="text-zinc-300" />
              {m.icon_url ? <img src={m.icon_url} alt="" className="w-7 h-7 rounded-lg shrink-0 object-cover" /> : <Bot size={18} className="text-zinc-400 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-800 truncate">{m.display_name}</p>
                <p className="text-xs text-zinc-400 truncate">{m.model_id}  -  {m.provider_name || 'Sin proveedor'}{m.description ? `  -  ${m.description}` : ''}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => toggleModelVisibility(m.id, m.is_visible)} className={`p-1.5 rounded-lg ${m.is_visible ? 'text-emerald-500 hover:bg-emerald-50' : 'text-zinc-400 hover:bg-zinc-100'}`} title={m.is_visible ? 'Ocultar' : 'Mostrar'}>
                  {m.is_visible ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
                <button onClick={() => openModelForm(m)} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400"><Edit3 size={15} /></button>
                <button onClick={() => deleteModel(m.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-500"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
          {models.length === 0 && (
            <div className="text-center py-12 bg-white border border-zinc-200 rounded-xl">
              <Bot size={32} className="mx-auto mb-3 text-zinc-300" />
              <p className="text-sm text-zinc-500 mb-1">No hay modelos configurados</p>
              <p className="text-xs text-zinc-400">Haz clic en &quot;Sincronizar modelos&quot; para importar los modelos de tus proveedores activos</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderProvidersTab() {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-800">Proveedores IA ({providers.length})</h2>
          <button onClick={() => openProviderForm()}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors">
            <Plus size={14} /> Anadir proveedor
          </button>
        </div>

        {showProviderForm && (
          <div className="bg-white border border-blue-200 rounded-xl p-4 mb-4 space-y-3">
            <p className="text-sm font-medium text-zinc-800">{editingProvider ? 'Editar proveedor' : 'Nuevo proveedor'}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Nombre</label>
                <input value={providerForm.name} onChange={e => setProviderForm({ ...providerForm, name: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="Mi OpenAI" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Tipo</label>
                <select value={providerForm.type} onChange={e => {
                  const t = PROVIDER_TYPES.find(pt => pt.value === e.target.value)
                  setProviderForm({ ...providerForm, type: e.target.value, base_url: t?.url || providerForm.base_url })
                }} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white">
                  {PROVIDER_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-zinc-500 mb-1 block">URL Base</label>
                <input value={providerForm.base_url} onChange={e => setProviderForm({ ...providerForm, base_url: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-zinc-500 mb-1 block">API Key</label>
                <input type="password" value={providerForm.api_key} onChange={e => setProviderForm({ ...providerForm, api_key: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="sk-..." />
              </div>
              <div className="flex items-center gap-6 col-span-2">
                <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
                  <input type="checkbox" checked={providerForm.is_enabled} onChange={e => setProviderForm({ ...providerForm, is_enabled: e.target.checked })} className="rounded" /> Habilitado
                </label>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-zinc-600">Prioridad:</label>
                  <input type="number" value={providerForm.priority} onChange={e => setProviderForm({ ...providerForm, priority: parseInt(e.target.value) || 0 })} className="w-20 px-2 py-1.5 border border-zinc-300 rounded-lg text-sm" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={saveProvider} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
              </button>
              <button onClick={() => setShowProviderForm(false)} className="px-4 py-2 text-sm text-zinc-500 hover:bg-zinc-100 rounded-lg">Cancelar</button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {providers.map(p => (
            <div key={p.id} className={`flex items-center gap-3 px-4 py-3 bg-white border rounded-xl transition-colors ${p.is_enabled ? 'border-zinc-200' : 'border-zinc-200 opacity-50'}`}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${
                p.type === 'openai' ? 'bg-emerald-50 text-emerald-600' :
                p.type === 'gemini' ? 'bg-blue-50 text-blue-600' :
                p.type === 'anthropic' ? 'bg-orange-50 text-orange-600' :
                p.type === 'ollama' ? 'bg-purple-50 text-purple-600' :
                'bg-zinc-100 text-zinc-600'
              }`}>
                {p.type.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-800">{p.name}</p>
                <p className="text-xs text-zinc-400 truncate">{p.type}  -  {p.base_url}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`px-2 py-0.5 rounded text-xs ${p.is_enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-100 text-zinc-400'}`}>
                  {p.is_enabled ? 'Activo' : 'Inactivo'}
                </span>
                <button onClick={() => openProviderForm(p)} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400"><Edit3 size={15} /></button>
                <button onClick={() => deleteProvider(p.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-500"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
          {providers.length === 0 && (
            <div className="text-center py-12 bg-white border border-zinc-200 rounded-xl">
              <Plug size={32} className="mx-auto mb-3 text-zinc-300" />
              <p className="text-sm text-zinc-500">No hay proveedores configurados</p>
              <p className="text-xs text-zinc-400 mt-1">Anade un proveedor para conectar modelos de IA</p>
            </div>
          )}
        </div>

        {/* Provider types info */}
        <div className="bg-white border border-zinc-200 rounded-xl p-4 mt-4">
          <p className="text-sm font-medium text-zinc-700 mb-3">Tipos de proveedor soportados</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {PROVIDER_TYPES.map(pt => (
              <div key={pt.value} className="flex items-center gap-2 text-xs text-zinc-500">
                <ChevronRight size={12} className="text-zinc-300" /> <span className="font-medium">{pt.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  function renderConnectionsTab() {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-800">Conexiones BD ({connections.length})</h2>
          <button onClick={() => openConnForm()}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors">
            <Plus size={14} /> Anadir conexion
          </button>
        </div>

        {showConnForm && (
          <div className="bg-white border border-blue-200 rounded-xl p-4 mb-4 space-y-3">
            <p className="text-sm font-medium text-zinc-800">{editingConn ? 'Editar conexion' : 'Nueva conexion'}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Nombre</label>
                <input value={connForm.name} onChange={e => setConnForm({ ...connForm, name: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="BD Visual Form" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Tipo de BD</label>
                <select value={connForm.db_type} onChange={e => setConnForm({ ...connForm, db_type: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white">
                  <option value="mssql">SQL Server</option>
                  <option value="mysql">MySQL</option>
                  <option value="postgresql">PostgreSQL</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Host / IP</label>
                <input value={connForm.host} onChange={e => setConnForm({ ...connForm, host: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="192.168.3.203" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Puerto</label>
                <input type="number" value={connForm.port} onChange={e => setConnForm({ ...connForm, port: parseInt(e.target.value) || 1433 })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Nombre de la BD</label>
                <input value={connForm.database_name} onChange={e => setConnForm({ ...connForm, database_name: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="Dejar vacio para descubrir" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Usuario</label>
                <input value={connForm.username} onChange={e => setConnForm({ ...connForm, username: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="vform" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-zinc-500 mb-1 block">Contrasena</label>
                <input type="password" value={connForm.password} onChange={e => setConnForm({ ...connForm, password: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-zinc-500 mb-1 block">Descripcion</label>
                <input value={connForm.description} onChange={e => setConnForm({ ...connForm, description: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="Servidor de produccion..." />
              </div>

              {/* Roles selector */}
              <div className="col-span-2">
                <label className="text-xs text-zinc-500 mb-1 block">👥 Roles con acceso a esta conexión</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowConnRolesDropdown(!showConnRolesDropdown)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm text-left flex items-center justify-between bg-white hover:bg-zinc-50 transition-colors"
                  >
                    <span className="text-zinc-700">
                      {selectedConnRoles.length === 0
                        ? 'Seleccionar roles...'
                        : `${selectedConnRoles.length} rol(es) seleccionado(s)`}
                    </span>
                    <ChevronRight size={16} className={`text-zinc-400 transition-transform ${showConnRolesDropdown ? 'rotate-90' : ''}`} />
                  </button>

                  {showConnRolesDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-300 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                      {availableRoles.map(role => (
                        <label key={role.id} className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 cursor-pointer transition-colors border-b border-zinc-100 last:border-b-0">
                          <input
                            type="checkbox"
                            checked={selectedConnRoles.includes(role.id)}
                            onChange={() => {
                              setSelectedConnRoles(prev =>
                                prev.includes(role.id)
                                  ? prev.filter(id => id !== role.id)
                                  : [...prev, role.id]
                              )
                            }}
                            className="w-4 h-4 text-blue-600 rounded border-zinc-300 focus:ring-blue-500"
                          />
                          <span className="text-sm text-zinc-700">{role.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  💡 Si no seleccionas ningún rol, todos los usuarios podrán ver esta conexión
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={saveConnection} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
              </button>
              <button onClick={() => setShowConnForm(false)} className="px-4 py-2 text-sm text-zinc-500 hover:bg-zinc-100 rounded-lg">Cancelar</button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {connections.map(c => (
            <div key={c.id} className={`bg-white border rounded-xl transition-colors ${c.is_active ? 'border-zinc-200' : 'border-zinc-200 opacity-50'}`}>
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Database size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-800">{c.name}</p>
                  <p className="text-xs text-zinc-400 truncate">
                    {c.db_type.toUpperCase()}  -  {c.host}:{c.port}{c.database_name ? `  -  ${c.database_name}` : ''}  -  {c.username}
                    {c.schema_cache?.length > 0 && `  -  ${c.schema_cache.length} tablas`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => syncSchema(c.id)} disabled={syncingSchema === c.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors">
                    {syncingSchema === c.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    Sync esquema
                  </button>
                  {c.schema_cache?.length > 0 && (
                    <button onClick={() => setViewingSchema(viewingSchema === c.id ? null : c.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-zinc-100 text-zinc-600 rounded-lg hover:bg-zinc-200 transition-colors">
                      <Eye size={12} /> Esquema
                    </button>
                  )}
                  <button onClick={() => toggleConnection(c.id, c.is_active)}
                    className={`p-1.5 rounded-lg ${c.is_active ? 'text-emerald-500 hover:bg-emerald-50' : 'text-zinc-400 hover:bg-zinc-100'}`}>
                    {c.is_active ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                  <button onClick={() => openConnForm(c)} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400"><Edit3 size={15} /></button>
                  <button onClick={() => deleteConnection(c.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-500"><Trash2 size={15} /></button>
                </div>
              </div>
              {viewingSchema === c.id && c.schema_cache?.length > 0 && (
                <div className="border-t border-zinc-100 px-4 py-3 max-h-80 overflow-y-auto">
                  <p className="text-xs font-medium text-zinc-500 mb-2">Esquema ({c.schema_cache.length} tablas)</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {c.schema_cache.map((t: DbSchemaTable, i: number) => (
                      <div key={i} className="bg-zinc-50 rounded-lg p-2.5">
                        <p className="text-xs font-medium text-zinc-700 mb-1">[{t.schema_name}].[{t.table_name}]</p>
                        <div className="space-y-0.5">
                          {t.columns.slice(0, 8).map((col, j) => (
                            <p key={j} className="text-[11px] text-zinc-500">{col.name} <span className="text-zinc-400">({col.type})</span></p>
                          ))}
                          {t.columns.length > 8 && <p className="text-[11px] text-zinc-400">+{t.columns.length - 8} mas...</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          {connections.length === 0 && (
            <div className="text-center py-12 bg-white border border-zinc-200 rounded-xl">
              <Database size={32} className="mx-auto mb-3 text-zinc-300" />
              <p className="text-sm text-zinc-500 mb-1">No hay conexiones configuradas</p>
              <p className="text-xs text-zinc-400">Anade una conexion para que GIA consulte tu BD</p>
            </div>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mt-4">
          <p className="text-sm font-medium text-blue-700 mb-1">Info Como funciona?</p>
          <ol className="text-xs text-blue-600 space-y-1 list-decimal list-inside">
            <li>Configura la conexion a tu base de datos</li>
            <li>Sincroniza el esquema para que GIA conozca las tablas</li>
            <li>Activa el toggle <strong>&quot;BD Empresa&quot;</strong> en el chat</li>
            <li>Pregunta sobre tus datos - GIA generara la consulta SQL</li>
          </ol>
          <p className="text-xs text-blue-500 mt-2">Nota: solo consultas SELECT. Todas quedan registradas.</p>
        </div>
      </div>
    )
  }

  function renderNetworkDrivesTab() {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-800">Unidades de Red ({networkDrives.length})</h2>
          <button onClick={() => openDriveForm()}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-500 transition-colors">
            <Plus size={14} /> Anadir unidad
          </button>
        </div>

        {showDriveForm && (
          <div className="bg-white border border-emerald-200 rounded-xl p-4 mb-4 space-y-3">
            <p className="text-sm font-medium text-zinc-800">{editingDrive ? 'Editar unidad' : 'Nueva unidad de red'}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Nombre</label>
                <input value={driveForm.name} onChange={e => setDriveForm({ ...driveForm, name: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="Web + Marketing" />
              </div>

              {/* Connection Type Selector */}
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Tipo de Conexión</label>
                <select
                  value={driveForm.connection_type}
                  onChange={e => setDriveForm({ ...driveForm, connection_type: e.target.value as 'smb' | 'sftp' })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm"
                >
                  <option value="smb">SMB (Red Local)</option>
                  <option value="sftp">SFTP (Remoto)</option>
                </select>
              </div>

              {/* SMB Path */}
              {driveForm.connection_type === 'smb' && (
                <div className="col-span-2">
                  <label className="text-xs text-zinc-500 mb-1 block">Ruta UNC</label>
                  <input value={driveForm.unc_path} onChange={e => setDriveForm({ ...driveForm, unc_path: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="\\gesem-dc\Datos\60-Web + Marketing" />
                </div>
              )}

              {/* SFTP Configuration */}
              {driveForm.connection_type === 'sftp' && (
                <>
                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Host SFTP</label>
                    <input value={driveForm.sftp_host} onChange={e => setDriveForm({ ...driveForm, sftp_host: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="192.168.1.100 o nas.ejemplo.com" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Puerto SFTP</label>
                    <input type="number" value={driveForm.sftp_port} onChange={e => setDriveForm({ ...driveForm, sftp_port: parseInt(e.target.value) || 22 })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="22" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Usuario SFTP</label>
                    <input value={driveForm.sftp_username} onChange={e => setDriveForm({ ...driveForm, sftp_username: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="usuario" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Contraseña SFTP</label>
                    <input type="password" value={driveForm.sftp_password} onChange={e => setDriveForm({ ...driveForm, sftp_password: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="••••••••" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-zinc-500 mb-1 block">Ruta Remota</label>
                    <input value={driveForm.unc_path} onChange={e => setDriveForm({ ...driveForm, unc_path: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="/carpeta/documentos" />
                  </div>

                  {/* Test SFTP Connection Button */}
                  <div className="col-span-2">
                    <button
                      type="button"
                      onClick={testSFTPConnection}
                      disabled={testingSFTP || !driveForm.sftp_host || !driveForm.sftp_username || !driveForm.sftp_password}
                      className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {testingSFTP ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                      {testingSFTP ? 'Probando conexión...' : 'Probar Conexión SFTP'}
                    </button>
                  </div>

                  {/* SFTP Test Result */}
                  {sftpTestResult && (
                    <div className={`col-span-2 p-3 rounded-lg border ${sftpTestResult.success ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                      <p className={`text-sm font-medium mb-1 ${sftpTestResult.success ? 'text-emerald-700' : 'text-red-700'}`}>
                        {sftpTestResult.message}
                      </p>
                      {sftpTestResult.details && (
                        <div className="text-xs text-zinc-600 mt-2">
                          {sftpTestResult.success ? (
                            <div>
                              <p>✅ Host: {sftpTestResult.details.host}:{sftpTestResult.details.port}</p>
                              <p>✅ Usuario: {sftpTestResult.details.username}</p>
                              <p>✅ Archivos encontrados: {sftpTestResult.details.items_found}</p>
                              {sftpTestResult.details.sample_items && sftpTestResult.details.sample_items.length > 0 && (
                                <div className="mt-2">
                                  <p className="font-medium">Primeros archivos:</p>
                                  <ul className="list-disc list-inside ml-2">
                                    {sftpTestResult.details.sample_items.map((item: any, i: number) => (
                                      <li key={i}>{item.name} ({item.type})</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <p className="font-medium text-red-700 mb-1">❌ {sftpTestResult.details.error_message}</p>
                              {sftpTestResult.details.troubleshooting && (
                                <div className="mt-2">
                                  <p className="font-medium">Soluciones:</p>
                                  <ul className="list-disc list-inside ml-2 space-y-1">
                                    {sftpTestResult.details.troubleshooting.map((tip: string, i: number) => (
                                      <li key={i}>{tip}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Extensiones (separadas por coma)</label>
                <input value={driveForm.file_extensions} onChange={e => setDriveForm({ ...driveForm, file_extensions: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="pdf,docx,xlsx,txt" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Tamano maximo (MB)</label>
                <input type="number" value={driveForm.max_file_size_mb} onChange={e => setDriveForm({ ...driveForm, max_file_size_mb: parseInt(e.target.value) || 50 })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-zinc-500 mb-1 block">Descripcion</label>
                <input value={driveForm.description} onChange={e => setDriveForm({ ...driveForm, description: e.target.value })} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm" placeholder="Carpeta de marketing y documentacion web..." />
              </div>

              {/* Roles selector */}
              <div className="col-span-2">
                <label className="text-xs text-zinc-500 mb-1 block">👥 Roles con acceso a esta unidad</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowDriveRolesDropdown(!showDriveRolesDropdown)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm text-left flex items-center justify-between bg-white hover:bg-zinc-50 transition-colors"
                  >
                    <span className="text-zinc-700">
                      {selectedDriveRoles.length === 0
                        ? 'Seleccionar roles...'
                        : `${selectedDriveRoles.length} rol(es) seleccionado(s)`}
                    </span>
                    <ChevronRight size={16} className={`text-zinc-400 transition-transform ${showDriveRolesDropdown ? 'rotate-90' : ''}`} />
                  </button>

                  {showDriveRolesDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-300 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                      {availableRoles.map(role => (
                        <label key={role.id} className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 cursor-pointer transition-colors border-b border-zinc-100 last:border-b-0">
                          <input
                            type="checkbox"
                            checked={selectedDriveRoles.includes(role.id)}
                            onChange={() => {
                              setSelectedDriveRoles(prev =>
                                prev.includes(role.id)
                                  ? prev.filter(id => id !== role.id)
                                  : [...prev, role.id]
                              )
                            }}
                            className="w-4 h-4 text-blue-600 rounded border-zinc-300 focus:ring-blue-500"
                          />
                          <span className="text-sm text-zinc-700">{role.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  💡 Si no seleccionas ningún rol, todos los usuarios podrán ver esta unidad
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={saveDrive} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-500 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
              </button>
              <button onClick={() => setShowDriveForm(false)} className="px-4 py-2 text-sm text-zinc-500 hover:bg-zinc-100 rounded-lg">Cancelar</button>
            </div>
          </div>
        )}

        {syncResult && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
            <p className="text-sm font-medium text-emerald-700 mb-2">Resumen Resultado de sincronizacion</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-white rounded-lg p-2.5 text-center">
                <p className="text-lg font-bold text-zinc-800">{(syncResult.stats as Record<string, number>)?.total_scanned ?? 0}</p>
                <p className="text-xs text-zinc-500">Archivos encontrados</p>
              </div>
              <div className="bg-white rounded-lg p-2.5 text-center">
                <p className="text-lg font-bold text-emerald-600">{(syncResult.stats as Record<string, number>)?.new_files ?? 0}</p>
                <p className="text-xs text-zinc-500">Nuevos</p>
              </div>
              <div className="bg-white rounded-lg p-2.5 text-center">
                <p className="text-lg font-bold text-blue-600">{(syncResult.stats as Record<string, number>)?.total_chunks ?? 0}</p>
                <p className="text-xs text-zinc-500">Chunks creados</p>
              </div>
              <div className="bg-white rounded-lg p-2.5 text-center">
                <p className="text-lg font-bold text-zinc-400">{(syncResult.stats as Record<string, number>)?.skipped_files ?? 0}</p>
                <p className="text-xs text-zinc-500">Omitidos</p>
              </div>
              <div className="bg-white rounded-lg p-2.5 text-center">
                <p className="text-lg font-bold text-red-500">{(syncResult.stats as Record<string, number>)?.error_files ?? 0}</p>
                <p className="text-xs text-zinc-500">Errores</p>
              </div>
            </div>
            <button onClick={() => setSyncResult(null)} className="mt-2 text-xs text-emerald-600 hover:underline">Cerrar</button>
          </div>
        )}

        <div className="space-y-2">
          {networkDrives.map(d => (
            <div key={d.id} className={`bg-white border rounded-xl transition-colors ${d.is_active ? 'border-zinc-200' : 'border-zinc-200 opacity-50'}`}>
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <HardDrive size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-800">{d.name}</p>
                  <p className="text-xs text-zinc-400 truncate">
                    {d.unc_path}  -  {d.file_count || 0} archivos  -  {d.total_chunks || 0} chunks
                    {d.last_synced_at && `  -  Ultimo sync: ${new Date(d.last_synced_at).toLocaleString('es-ES')}`}
                  </p>
                  {d.sync_status === 'error' && d.sync_error && (
                    <p className="text-xs text-red-500 mt-0.5">Error: {d.sync_error}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => syncDrive(d.id)} disabled={syncingDrive === d.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors">
                    {syncingDrive === d.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    {syncingDrive === d.id ? 'Sincronizando...' : 'Sincronizar'}
                  </button>
                  <button onClick={() => toggleDrive(d.id, d.is_active)}
                    className={`p-1.5 rounded-lg ${d.is_active ? 'text-emerald-500 hover:bg-emerald-50' : 'text-zinc-400 hover:bg-zinc-100'}`}>
                    {d.is_active ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                  <button onClick={() => openDriveForm(d)} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400"><Edit3 size={15} /></button>
                  <button onClick={() => deleteDrive(d.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-500"><Trash2 size={15} /></button>
                </div>
              </div>
            </div>
          ))}
          {networkDrives.length === 0 && (
            <div className="text-center py-12 bg-white border border-zinc-200 rounded-xl">
              <HardDrive size={32} className="mx-auto mb-3 text-zinc-300" />
              <p className="text-sm text-zinc-500 mb-1">No hay unidades de red configuradas</p>
              <p className="text-xs text-zinc-400">Anade una unidad para indexar documentos de la empresa</p>
            </div>
          )}
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mt-4">
          <p className="text-sm font-medium text-emerald-700 mb-1">Info Como funciona?</p>
          <ol className="text-xs text-emerald-600 space-y-1 list-decimal list-inside">
            <li>Configura la ruta UNC de la unidad de red (ej: \\gesem-dc\Datos\...)</li>
            <li>Pulsa <strong>&quot;Sincronizar&quot;</strong> para indexar los archivos</li>
            <li>Activa el toggle <strong>&quot;Unidad de Red&quot;</strong> (icono disco duro) en el chat</li>
            <li>Pregunta sobre el contenido de tus documentos - GIA buscara por similitud semantica</li>
          </ol>
          <p className="text-xs text-emerald-500 mt-2">Formatos soportados: PDF, Word, Excel, PowerPoint, TXT, CSV, MD, JSON, XML, HTML, RTF</p>
        </div>
      </div>
    )
  }

  function renderFilesTab() {
    const file = selectedAdminFile
    const mime = file?.mime || ''
    const isImage = mime.startsWith('image/')
    const isVideo = mime.startsWith('video/')
    const isAudio = mime.startsWith('audio/')
    const isPdf = mime.includes('pdf')
    const isDocx = mime.includes('wordprocessingml')
    const isXlsx = mime.includes('spreadsheetml')
    const previewUrl = file?.signed_url || null

    return (
      <div>
        <div className="flex items-center justify-between mb-4 gap-2">
          <h2 className="text-lg font-semibold text-zinc-800">
            Archivos globales ({adminFiles.length})
            {selectedFileIds.size > 0 && (
              <span className="ml-2 text-sm font-normal text-blue-600">
                ({selectedFileIds.size} seleccionados)
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            {selectedFileIds.size > 0 && (
              <button
                onClick={deleteSelectedFiles}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Eliminar seleccionados
              </button>
            )}
            <button
              onClick={() => loadAdminFiles()}
              disabled={filesLoading}
              className="flex items-center gap-1.5 px-3 py-2 bg-zinc-100 text-zinc-700 text-sm rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {filesLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Recargar
            </button>
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-xl p-3 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <Search size={15} className="text-zinc-400" />
            <input
              value={filesQuery}
              onChange={(e) => setFilesQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') loadAdminFiles(filesQuery) }}
              placeholder="Buscar por nombre de archivo..."
              className="flex-1 px-2 py-1.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className="px-3 py-1.5 text-sm bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200"
            >
              {showAdvancedFilters ? 'Ocultar filtros' : 'Filtros avanzados'}
            </button>
            <button
              onClick={() => loadAdminFiles(filesQuery)}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-500"
            >
              Buscar
            </button>
          </div>

          {showAdvancedFilters && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 border-t border-zinc-200">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Usuario</label>
                <select
                  value={filesFilterUser}
                  onChange={(e) => setFilesFilterUser(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Todos los usuarios</option>
                  {Array.from(new Set(adminFiles.map(f => f.user_id))).map(userId => {
                    const file = adminFiles.find(f => f.user_id === userId)
                    return (
                      <option key={userId} value={userId}>
                        {file?.user_name || userId}
                      </option>
                    )
                  })}
                </select>
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-1">Tipo de archivo</label>
                <select
                  value={filesFilterMime}
                  onChange={(e) => setFilesFilterMime(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Todos los tipos</option>
                  <option value="application/pdf">PDF</option>
                  <option value="application/vnd.openxmlformats-officedocument.wordprocessingml">Word (DOCX)</option>
                  <option value="application/vnd.openxmlformats-officedocument.spreadsheetml">Excel (XLSX)</option>
                  <option value="application/vnd.openxmlformats-officedocument.presentationml">PowerPoint (PPTX)</option>
                  <option value="image/">Imágenes</option>
                  <option value="video/">Videos</option>
                  <option value="audio/">Audio</option>
                  <option value="text/">Texto</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-1">Estado RAG</label>
                <select
                  value={filesFilterStatus}
                  onChange={(e) => setFilesFilterStatus(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Todos los estados</option>
                  <option value="none">Sin procesar</option>
                  <option value="queued">En cola</option>
                  <option value="processing">Procesando</option>
                  <option value="done">Completado</option>
                  <option value="failed">Fallido</option>
                </select>
              </div>

              <div className="md:col-span-3 flex justify-end">
                <button
                  onClick={clearFilters}
                  className="px-3 py-1.5 text-xs text-zinc-600 hover:text-zinc-800 underline"
                >
                  Limpiar filtros
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1000px]">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium w-10">
                    <input
                      type="checkbox"
                      checked={adminFiles.length > 0 && selectedFileIds.size === adminFiles.length}
                      onChange={toggleAllFiles}
                      className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Archivo</th>
                  <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Usuario</th>
                  <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Tipo</th>
                  <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Tamano</th>
                  <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Chunks</th>
                  <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Fecha</th>
                  <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Estado</th>
                  <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filesLoading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-zinc-400">
                      <div className="inline-flex items-center gap-2">
                        <Loader2 size={15} className="animate-spin" />
                        Cargando archivos...
                      </div>
                    </td>
                  </tr>
                ) : adminFiles.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-zinc-400">No hay archivos</td>
                  </tr>
                ) : (
                  adminFiles.map((item) => (
                    <tr key={item.id} className="border-b border-zinc-100 hover:bg-zinc-50/50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedFileIds.has(item.id)}
                          onChange={() => toggleFileSelection(item.id)}
                          className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-[320px]">
                          <p className="text-zinc-700 font-medium truncate">{item.filename}</p>
                          <p className="text-[11px] text-zinc-400 truncate">{item.storage_path}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 text-xs">{item.user_name || item.user_id}</td>
                      <td className="px-4 py-3 text-zinc-500 text-xs">{item.mime || 'application/octet-stream'}</td>
                      <td className="px-4 py-3 text-zinc-500 text-xs">{formatBytes(item.size || 0)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                          (item.chunk_count || 0) > 0
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-zinc-100 text-zinc-500'
                        }`}>
                          {item.chunk_count || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-400 text-xs">{new Date(item.created_at).toLocaleString('es-ES')}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                          item.ingest_status === 'done'
                            ? 'bg-emerald-50 text-emerald-600'
                            : item.ingest_status === 'failed'
                              ? 'bg-red-50 text-red-600'
                              : item.ingest_status === 'processing'
                                ? 'bg-blue-50 text-blue-600'
                                : 'bg-zinc-100 text-zinc-500'
                        }`}>
                          {item.ingest_status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openAdminFilePreview(item)}
                            className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-500"
                            title="Vista previa"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            onClick={() => deleteAdminFile(item)}
                            className="p-1.5 hover:bg-red-50 rounded-lg text-zinc-500 hover:text-red-600"
                            title="Eliminar archivo"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {file && (
          <div className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
            <div className="w-full max-w-4xl max-h-[95vh] sm:max-h-[92vh] overflow-hidden rounded-xl sm:rounded-2xl border border-white/60 bg-white/75 backdrop-blur-xl shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
              <div className="px-4 py-3 border-b border-white/55 bg-white/30 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-800 truncate">{file.filename}</p>
                  <p className="text-xs text-zinc-500">{file.user_name || file.user_id}  -  {formatBytes(file.size || 0)}</p>
                </div>
                <button onClick={() => setSelectedAdminFile(null)} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-500">
                  <X size={16} />
                </button>
              </div>

              <div className="p-4 max-h-[72vh] overflow-auto bg-white/25">
                {fileModalLoading && (
                  <div className="h-60 flex items-center justify-center text-zinc-500">
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                )}

                {!fileModalLoading && !previewUrl && (
                  <div className="h-60 flex items-center justify-center text-zinc-500 text-sm">
                    No se pudo generar vista previa para este archivo.
                  </div>
                )}

                {!fileModalLoading && previewUrl && isImage && (
                  <img src={previewUrl} alt={file.filename} className="max-h-[68vh] mx-auto rounded-xl border border-zinc-200" />
                )}

                {!fileModalLoading && previewUrl && isVideo && (
                  <video src={previewUrl} controls className="w-full max-h-[68vh] rounded-xl border border-zinc-200 bg-black" />
                )}

                {!fileModalLoading && previewUrl && isAudio && (
                  <div className="max-w-xl mx-auto">
                    <audio src={previewUrl} controls className="w-full" />
                  </div>
                )}

                {!fileModalLoading && previewUrl && isPdf && (
                  <iframe src={previewUrl} className="w-full h-[68vh] rounded-xl border border-zinc-200 bg-white" title={file.filename} />
                )}

                {!fileModalLoading && (isDocx || isXlsx) && convertedHtml && (
                  <div className="bg-white rounded-xl border border-zinc-200 p-6 max-h-[68vh] overflow-auto">
                    <div
                      dangerouslySetInnerHTML={{ __html: convertedHtml }}
                      className="prose prose-sm max-w-none"
                      style={{
                        fontSize: '14px',
                      }}
                    />
                  </div>
                )}

                {!fileModalLoading && (isDocx || isXlsx) && conversionError && (
                  <div className="h-60 flex flex-col items-center justify-center gap-2 text-sm text-zinc-500">
                    <FileText size={26} className="text-red-400" />
                    <p className="text-red-600">{conversionError}</p>
                    {previewUrl && (
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 text-xs"
                      >
                        Descargar archivo
                      </a>
                    )}
                  </div>
                )}

                {!fileModalLoading && previewUrl && !isImage && !isVideo && !isAudio && !isPdf && !isDocx && !isXlsx && (
                  <div className="h-60 flex flex-col items-center justify-center gap-2 text-sm text-zinc-500">
                    <FileText size={26} className="text-zinc-400" />
                    <p>Vista previa no disponible para este tipo.</p>
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 text-xs"
                    >
                      Abrir archivo
                    </a>
                  </div>
                )}
              </div>

              <div className="px-4 py-3 border-t border-white/55 bg-white/30 flex items-center justify-between gap-2">
                <div className="text-xs text-zinc-500 truncate">{file.mime || 'application/octet-stream'}</div>
                <div className="flex items-center gap-2">
                  {previewUrl && (
                    <a
                      href={previewUrl}
                      download={file.filename}
                      className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs"
                    >
                      Descargar
                    </a>
                  )}
                  <button
                    onClick={() => deleteAdminFile(file)}
                    className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ======= DOCUMENT ANALYSIS TAB =======
  function renderDocumentAnalysisTab() {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-800">Análisis de Documentos</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Configuración del sistema RAG y extracción de documentos</p>
          </div>
          <button
            onClick={saveDocAnalysisConfig}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-500 transition-colors"
          >
            <Save size={14} /> Guardar configuración
          </button>
        </div>

        <div className="space-y-4">
          {/* Extraction Engine Section */}
          <div className="liquid-glass-card rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <FileText size={16} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-800">Motor de Extracción</h3>
                <p className="text-xs text-zinc-500">Selecciona cómo extraer texto de los documentos</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-600 font-medium mb-1.5 block">Estrategia de extracción</label>
                <select
                  value={docAnalysisConfig.extractionEngine}
                  onChange={(e) => setDocAnalysisConfig({ ...docAnalysisConfig, extractionEngine: e.target.value as any })}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="pdf-parse">PDF-Parse + Mammoth + XLSX (Rápido, solo formatos básicos)</option>
                  <option value="tika">Apache Tika (Lento, 1500+ formatos)</option>
                  <option value="hybrid">Híbrido (Rápido para básicos, Tika para complejos) ⭐ Recomendado</option>
                </select>
              </div>

              {(docAnalysisConfig.extractionEngine === 'tika' || docAnalysisConfig.extractionEngine === 'hybrid') && (
                <>
                  <div>
                    <label className="text-xs text-zinc-600 font-medium mb-1.5 block">URL del servidor Tika</label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={docAnalysisConfig.tikaServerUrl}
                        onChange={(e) => setDocAnalysisConfig({ ...docAnalysisConfig, tikaServerUrl: e.target.value })}
                        placeholder="https://tika.fgarola.es/"
                        className="flex-1 px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={testTikaConnection}
                        disabled={testingTika}
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50 flex items-center gap-2"
                      >
                        {testingTika ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        Probar
                      </button>
                    </div>
                    {tikaTestResult && (
                      <p className={`text-xs mt-1.5 ${tikaTestResult.success ? 'text-emerald-600' : 'text-red-600'}`}>
                        {tikaTestResult.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs text-zinc-600 font-medium mb-1.5 block">Timeout (ms)</label>
                    <input
                      type="number"
                      value={docAnalysisConfig.tikaTimeout}
                      onChange={(e) => setDocAnalysisConfig({ ...docAnalysisConfig, tikaTimeout: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Embedding Model Section */}
          <div className="liquid-glass-card rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <Sparkles size={16} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-800">Modelo de Embeddings</h3>
                <p className="text-xs text-zinc-500">Configuración del modelo para vectorización</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-zinc-600 font-medium mb-1.5 block">Modelo</label>
                <select
                  value={docAnalysisConfig.embeddingModel}
                  onChange={(e) => setDocAnalysisConfig({ ...docAnalysisConfig, embeddingModel: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="text-embedding-3-small">text-embedding-3-small (512 dims, $0.02/1M)</option>
                  <option value="text-embedding-3-large">text-embedding-3-large (1536 dims, $0.13/1M) ⭐</option>
                  <option value="text-embedding-ada-002">text-embedding-ada-002 (1536 dims, $0.10/1M)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-zinc-600 font-medium mb-1.5 block">Dimensiones</label>
                <input
                  type="number"
                  value={docAnalysisConfig.embeddingDimensions}
                  onChange={(e) => setDocAnalysisConfig({ ...docAnalysisConfig, embeddingDimensions: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  disabled={docAnalysisConfig.embeddingModel === 'text-embedding-ada-002'}
                />
                <p className="text-[10px] text-zinc-400 mt-1">Máx 2000 (límite HNSW)</p>
              </div>

              <div>
                <label className="text-xs text-zinc-600 font-medium mb-1.5 block">Batch size</label>
                <input
                  type="number"
                  value={docAnalysisConfig.embeddingBatchSize}
                  onChange={(e) => setDocAnalysisConfig({ ...docAnalysisConfig, embeddingBatchSize: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
          </div>

          {/* Chunking Section */}
          <div className="liquid-glass-card rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
                <FileText size={16} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-800">Chunking (División de Texto)</h3>
                <p className="text-xs text-zinc-500">Cómo dividir documentos en fragmentos</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-zinc-600 font-medium mb-1.5 block">Estrategia</label>
                <select
                  value={docAnalysisConfig.chunkingStrategy}
                  onChange={(e) => setDocAnalysisConfig({ ...docAnalysisConfig, chunkingStrategy: e.target.value as any })}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="fixed">Fijo (simple, rápido)</option>
                  <option value="semantic">Semántico (LangChain, respeta estructura) ⭐</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-zinc-600 font-medium mb-1.5 block">Tamaño de chunk</label>
                <input
                  type="number"
                  value={docAnalysisConfig.chunkSize}
                  onChange={(e) => setDocAnalysisConfig({ ...docAnalysisConfig, chunkSize: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <p className="text-[10px] text-zinc-400 mt-1">Caracteres por chunk</p>
              </div>

              <div>
                <label className="text-xs text-zinc-600 font-medium mb-1.5 block">Overlap</label>
                <input
                  type="number"
                  value={docAnalysisConfig.chunkOverlap}
                  onChange={(e) => setDocAnalysisConfig({ ...docAnalysisConfig, chunkOverlap: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <p className="text-[10px] text-zinc-400 mt-1">Caracteres de solapamiento</p>
              </div>
            </div>
          </div>

          {/* OCR Section */}
          <div className="liquid-glass-card rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Eye size={16} />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-zinc-800">OCR (Reconocimiento Á“ptico)</h3>
                <p className="text-xs text-zinc-500">Extracción de texto de PDFs escaneados e imágenes</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={docAnalysisConfig.ocrEnabled}
                  onChange={(e) => setDocAnalysisConfig({ ...docAnalysisConfig, ocrEnabled: e.target.checked })}
                  className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs text-zinc-600">Habilitado</span>
              </label>
            </div>

            {docAnalysisConfig.ocrEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-600 font-medium mb-1.5 block">Idiomas</label>
                  <input
                    type="text"
                    value={docAnalysisConfig.ocrLanguages}
                    onChange={(e) => setDocAnalysisConfig({ ...docAnalysisConfig, ocrLanguages: e.target.value })}
                    placeholder="spa+eng"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-[10px] text-zinc-400 mt-1">Formato: spa+eng+cat</p>
                </div>

                <div>
                  <label className="text-xs text-zinc-600 font-medium mb-1.5 block">Trigger automático (min chars)</label>
                  <input
                    type="number"
                    value={docAnalysisConfig.ocrMinTextLength}
                    onChange={(e) => setDocAnalysisConfig({ ...docAnalysisConfig, ocrMinTextLength: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-[10px] text-zinc-400 mt-1">Si texto extraído &lt; X chars, aplicar OCR</p>
                </div>
              </div>
            )}
          </div>

          {/* LLM Analysis Section */}
          <div className="liquid-glass-card rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Bot size={16} />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-zinc-800">Análisis LLM de Documentos</h3>
                <p className="text-xs text-zinc-500">Extracción de metadata semántica con IA</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={docAnalysisConfig.llmAnalysisEnabled}
                  onChange={(e) => setDocAnalysisConfig({ ...docAnalysisConfig, llmAnalysisEnabled: e.target.checked })}
                  className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs text-zinc-600">Habilitado</span>
              </label>
            </div>

            {docAnalysisConfig.llmAnalysisEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-600 font-medium mb-1.5 block">Modelo LLM</label>
                  <select
                    value={docAnalysisConfig.llmAnalysisModel}
                    onChange={(e) => setDocAnalysisConfig({ ...docAnalysisConfig, llmAnalysisModel: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="gpt-4o-mini">gpt-4o-mini (rápido, barato) ⭐</option>
                    <option value="gpt-4o">gpt-4o (mejor calidad, más caro)</option>
                    <option value="gpt-3.5-turbo">gpt-3.5-turbo (muy barato)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-zinc-600 font-medium mb-1.5 block">Temperatura</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={docAnalysisConfig.llmAnalysisTemperature}
                    onChange={(e) => setDocAnalysisConfig({ ...docAnalysisConfig, llmAnalysisTemperature: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-zinc-400 mt-1">0 = determinista, 1 = creativo</p>
                </div>
              </div>
            )}

            {docAnalysisConfig.llmAnalysisEnabled && (
              <div className="mt-3 p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg">
                <p className="text-xs text-indigo-700 font-medium mb-1">Metadata extraída:</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-indigo-600">
                  <span>• Tipo de documento</span>
                  <span>• Resumen ejecutivo</span>
                  <span>• Entidades clave</span>
                  <span>• Fechas importantes</span>
                  <span>• Departamento</span>
                  <span>• Idioma</span>
                  <span>• Nivel de importancia</span>
                  <span>• Timestamp análisis</span>
                </div>
              </div>
            )}
          </div>

          {/* Cache & Retry Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Embedding Cache */}
            <div className="liquid-glass-card rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center">
                  <Database size={16} />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-zinc-800">Caché de Embeddings</h3>
                  <p className="text-xs text-zinc-500">Evita regenerar embeddings</p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={docAnalysisConfig.embeddingCacheEnabled}
                    onChange={(e) => setDocAnalysisConfig({ ...docAnalysisConfig, embeddingCacheEnabled: e.target.checked })}
                    className="w-4 h-4 rounded border-zinc-300 text-cyan-600 focus:ring-cyan-500"
                  />
                  <span className="text-xs text-zinc-600">Habilitado</span>
                </label>
              </div>

              {docAnalysisConfig.embeddingCacheEnabled && (
                <div className="p-3 bg-cyan-50/50 border border-cyan-100 rounded-lg">
                  <p className="text-xs text-cyan-700 font-medium mb-1">Beneficios:</p>
                  <ul className="text-[10px] text-cyan-600 space-y-0.5">
                    <li>• 10x más rápido en re-indexaciones</li>
                    <li>• Ahorro de costos (no regenerar)</li>
                    <li>• Consistencia (mismo texto = mismo embedding)</li>
                    <li>• Hash SHA-256 para lookup</li>
                  </ul>
                </div>
              )}
            </div>

            {/* Retry Logic */}
            <div className="liquid-glass-card rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                  <RefreshCw size={16} />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-zinc-800">Retry con Backoff</h3>
                  <p className="text-xs text-zinc-500">Reintentos en caso de error</p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={docAnalysisConfig.retryEnabled}
                    onChange={(e) => setDocAnalysisConfig({ ...docAnalysisConfig, retryEnabled: e.target.checked })}
                    className="w-4 h-4 rounded border-zinc-300 text-rose-600 focus:ring-rose-500"
                  />
                  <span className="text-xs text-zinc-600">Habilitado</span>
                </label>
              </div>

              {docAnalysisConfig.retryEnabled && (
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-zinc-600 font-medium mb-1.5 block">Intentos máximos</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={docAnalysisConfig.retryAttempts}
                      onChange={(e) => setDocAnalysisConfig({ ...docAnalysisConfig, retryAttempts: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-zinc-600 font-medium mb-1.5 block">Backoff inicial (ms)</label>
                    <input
                      type="number"
                      value={docAnalysisConfig.retryBackoffMs}
                      onChange={(e) => setDocAnalysisConfig({ ...docAnalysisConfig, retryBackoffMs: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                    <p className="text-[10px] text-zinc-400 mt-1">Exponencial: {docAnalysisConfig.retryBackoffMs}ms â†’ {docAnalysisConfig.retryBackoffMs * 2}ms â†’ {docAnalysisConfig.retryBackoffMs * 4}ms</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Stats & Info Section */}
          <div className="liquid-glass-card rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Estado del Sistema</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-white/50 rounded-lg border border-zinc-100">
                <p className="text-2xl font-bold text-zinc-800">{stats.files.toLocaleString()}</p>
                <p className="text-xs text-zinc-500 mt-1">Archivos totales</p>
              </div>
              <div className="text-center p-3 bg-white/50 rounded-lg border border-zinc-100">
                <p className="text-2xl font-bold text-zinc-800">{stats.chunks.toLocaleString()}</p>
                <p className="text-xs text-zinc-500 mt-1">Chunks indexados</p>
              </div>
              <div className="text-center p-3 bg-white/50 rounded-lg border border-zinc-100">
                <p className="text-2xl font-bold text-emerald-600">
                  {docAnalysisConfig.extractionEngine === 'tika' ? '1500+' : docAnalysisConfig.extractionEngine === 'hybrid' ? '1500+' : '3'}
                </p>
                <p className="text-xs text-zinc-500 mt-1">Formatos soportados</p>
              </div>
              <div className="text-center p-3 bg-white/50 rounded-lg border border-zinc-100">
                <p className="text-2xl font-bold text-purple-600">{docAnalysisConfig.embeddingDimensions}</p>
                <p className="text-xs text-zinc-500 mt-1">Dimensiones vector</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ======= AGENTS TAB =======
  function renderAgentsTab() {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-800">Agentes IA</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Gestión de agentes autónomos</p>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setAgentSubTab('list')}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              agentSubTab === 'list'
                ? 'bg-purple-500 text-white'
                : 'bg-white text-zinc-600 hover:bg-zinc-50 border border-zinc-200'
            }`}
          >
            Mis Agentes
          </button>
          <button
            onClick={() => {
              setSelectedAgent(null)
              setAgentForm({
                name: '',
                description: '',
                goal: '',
                tools: [],
                schedule_type: 'manual',
                schedule_config: {},
              })
              setAgentSubTab('create')
            }}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              agentSubTab === 'create'
                ? 'bg-purple-500 text-white'
                : 'bg-white text-zinc-600 hover:bg-zinc-50 border border-zinc-200'
            }`}
          >
            <Plus size={14} className="inline mr-1" />
            Crear Agente
          </button>
          <button
            onClick={() => {
              setAgentSubTab('history')
              loadAgentExecutions()
            }}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              agentSubTab === 'history'
                ? 'bg-purple-500 text-white'
                : 'bg-white text-zinc-600 hover:bg-zinc-50 border border-zinc-200'
            }`}
          >
            <ClockIcon size={14} className="inline mr-1" />
            Historial
          </button>
        </div>

        {/* Content based on sub-tab */}
        {agentSubTab === 'list' && (
          <div>
            {agentsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="animate-spin text-zinc-400" size={28} />
              </div>
            ) : agents.length === 0 ? (
              <div className="text-center py-12 bg-white border border-zinc-200 rounded-xl">
                <Bot size={32} className="mx-auto mb-3 text-zinc-300" />
                <p className="text-sm text-zinc-500 mb-1">No hay agentes creados</p>
                <p className="text-xs text-zinc-400">Crea tu primer agente autónomo</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {agents.map((agent) => (
                  <div key={agent.id} className="liquid-glass-card rounded-xl p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                          <Bot size={20} />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-zinc-800">{agent.name}</h3>
                          <p className="text-xs text-zinc-500">{agent.schedule_type}</p>
                        </div>
                      </div>
                      <div className={`w-2 h-2 rounded-full ${agent.is_active ? 'bg-green-500' : 'bg-zinc-300'}`} />
                    </div>
                    <p className="text-xs text-zinc-600 mb-3 line-clamp-2">{agent.description}</p>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {agent.tools?.map((tool: string) => (
                        <span key={tool} className="px-2 py-0.5 bg-purple-50 text-purple-600 text-[10px] rounded">
                          {tool}
                        </span>
                      ))}
                    </div>
                    <div className="text-[10px] text-zinc-400 mb-3">
                      <div>Ejecuciones: {agent.run_count || 0}</div>
                      {agent.last_run_at && (
                        <div>Ášltima: {new Date(agent.last_run_at).toLocaleString('es-ES')}</div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => executeAgent(agent.id)}
                        disabled={executingAgentId === agent.id}
                        className="flex-1 px-3 py-1.5 text-xs font-medium bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        {executingAgentId === agent.id ? (
                          <><Loader2 size={12} className="animate-spin" /> Ejecutando...</>
                        ) : (
                          <><Play size={12} /> Ejecutar</>
                        )}
                      </button>
                      <button
                        onClick={() => editAgent(agent)}
                        className="px-3 py-1.5 text-xs font-medium bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200 transition-colors"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => deleteAgent(agent.id)}
                        className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {agentSubTab === 'create' && renderAgentForm()}
        {agentSubTab === 'history' && renderAgentHistory()}
      </div>
    )
  }

  function renderAgentForm() {
    const toolOptions = [
      { id: 'web_search', label: 'Búsqueda Web', icon: <Globe size={14} /> },
      { id: 'database', label: 'Base de Datos', icon: <Database size={14} /> },
      { id: 'code_interpreter', label: 'Intérprete de Código', icon: <Code2 size={14} /> },
    ]

    return (
      <div className="liquid-glass-card rounded-xl p-6">
        <h3 className="text-md font-semibold text-zinc-800 mb-4">
          {selectedAgent ? 'Editar Agente' : 'Crear Nuevo Agente'}
        </h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Nombre</label>
            <input
              value={agentForm.name}
              onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm"
              placeholder="Ej: Asistente de Ventas"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Descripción</label>
            <input
              value={agentForm.description}
              onChange={(e) => setAgentForm({ ...agentForm, description: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm"
              placeholder="Breve descripción del agente"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Objetivo</label>
            <textarea
              value={agentForm.goal}
              onChange={(e) => setAgentForm({ ...agentForm, goal: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm"
              rows={3}
              placeholder="Describe qué debe hacer el agente..."
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-2 block">Herramientas</label>
            <div className="flex flex-wrap gap-2">
              {toolOptions.map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => {
                    const tools = agentForm.tools.includes(tool.id)
                      ? agentForm.tools.filter((t) => t !== tool.id)
                      : [...agentForm.tools, tool.id]
                    setAgentForm({ ...agentForm, tools })
                  }}
                  className={`px-3 py-2 text-xs rounded-lg border transition-colors flex items-center gap-1.5 ${
                    agentForm.tools.includes(tool.id)
                      ? 'bg-purple-50 border-purple-300 text-purple-700'
                      : 'bg-white border-zinc-300 text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  {tool.icon}
                  {tool.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Tipo de Programación</label>
            <select
              value={agentForm.schedule_type}
              onChange={(e) =>
                setAgentForm({
                  ...agentForm,
                  schedule_type: e.target.value as 'manual' | 'interval' | 'daily' | 'cron',
                })
              }
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm"
            >
              <option value="manual">Manual</option>
              <option value="interval">Intervalo</option>
              <option value="daily">Diario</option>
              <option value="cron">Cron</option>
            </select>
          </div>
          {agentForm.schedule_type === 'interval' && (
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Intervalo (minutos)</label>
              <input
                type="number"
                value={(agentForm.schedule_config as any).interval_minutes || ''}
                onChange={(e) =>
                  setAgentForm({
                    ...agentForm,
                    schedule_config: { interval_minutes: parseInt(e.target.value) || 0 },
                  })
                }
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm"
                placeholder="60"
              />
            </div>
          )}
          {agentForm.schedule_type === 'daily' && (
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Hora (HH:MM)</label>
              <input
                type="time"
                value={(agentForm.schedule_config as any).time || ''}
                onChange={(e) =>
                  setAgentForm({
                    ...agentForm,
                    schedule_config: { time: e.target.value },
                  })
                }
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm"
              />
            </div>
          )}
          {agentForm.schedule_type === 'cron' && (
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Expresión Cron</label>
              <input
                value={(agentForm.schedule_config as any).cron_expression || ''}
                onChange={(e) =>
                  setAgentForm({
                    ...agentForm,
                    schedule_config: { cron_expression: e.target.value },
                  })
                }
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm"
                placeholder="0 9 * * *"
              />
            </div>
          )}

          {/* Roles selector */}
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">👥 Roles con acceso a este agente</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAgentRolesDropdown(!showAgentRolesDropdown)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm text-left flex items-center justify-between bg-white hover:bg-zinc-50 transition-colors"
              >
                <span className="text-zinc-700">
                  {selectedAgentRoles.length === 0
                    ? 'Seleccionar roles...'
                    : `${selectedAgentRoles.length} rol(es) seleccionado(s)`}
                </span>
                <ChevronRight size={16} className={`text-zinc-400 transition-transform ${showAgentRolesDropdown ? 'rotate-90' : ''}`} />
              </button>

              {showAgentRolesDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-300 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                  {availableRoles.map(role => (
                    <label key={role.id} className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 cursor-pointer transition-colors border-b border-zinc-100 last:border-b-0">
                      <input
                        type="checkbox"
                        checked={selectedAgentRoles.includes(role.id)}
                        onChange={() => {
                          setSelectedAgentRoles(prev =>
                            prev.includes(role.id)
                              ? prev.filter(id => id !== role.id)
                              : [...prev, role.id]
                          )
                        }}
                        className="w-4 h-4 text-blue-600 rounded border-zinc-300 focus:ring-blue-500"
                      />
                      <span className="text-sm text-zinc-700">{role.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              💡 Si no seleccionas ningún rol, todos los usuarios podrán ver este agente
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={saveAgent}
              className="flex-1 px-4 py-2 bg-purple-500 text-white text-sm font-medium rounded-lg hover:bg-purple-600 transition-colors"
            >
              {selectedAgent ? 'Actualizar Agente' : 'Crear Agente'}
            </button>
            <button
              onClick={() => {
                setAgentSubTab('list')
                setSelectedAgent(null)
              }}
              className="px-4 py-2 bg-zinc-100 text-zinc-700 text-sm font-medium rounded-lg hover:bg-zinc-200 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    )
  }

  function renderAgentHistory() {
    return (
      <div>
        {agentExecutions.length === 0 ? (
          <div className="text-center py-12 bg-white border border-zinc-200 rounded-xl">
            <ClockIcon size={32} className="mx-auto mb-3 text-zinc-300" />
            <p className="text-sm text-zinc-500 mb-1">No hay ejecuciones registradas</p>
            <p className="text-xs text-zinc-400">Las ejecuciones aparecerán aquí</p>
          </div>
        ) : (
          <div className="space-y-3">
            {agentExecutions.map((execution) => {
              const agent = agents.find((a) => a.id === execution.agent_id)
              return (
                <div key={execution.id} className="liquid-glass-card rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="text-sm font-semibold text-zinc-800">{agent?.name || 'Agente desconocido'}</h4>
                      <p className="text-xs text-zinc-500">
                        {new Date(execution.created_at).toLocaleString('es-ES')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {execution.status === 'completed' && (
                        <span className="px-2 py-1 bg-green-50 text-green-600 text-xs rounded flex items-center gap-1">
                          <CheckCircle2 size={12} /> Completado
                        </span>
                      )}
                      {execution.status === 'failed' && (
                        <span className="px-2 py-1 bg-red-50 text-red-600 text-xs rounded flex items-center gap-1">
                          <XCircle size={12} /> Error
                        </span>
                      )}
                      {execution.status === 'running' && (
                        <span className="px-2 py-1 bg-blue-50 text-blue-600 text-xs rounded flex items-center gap-1">
                          <Loader2 size={12} className="animate-spin" /> Ejecutando
                        </span>
                      )}
                    </div>
                  </div>
                  {execution.result && (
                    <div className="mb-2">
                      <p className="text-xs font-semibold text-zinc-700 mb-2 flex items-center gap-1.5">
                        <MessageCircle size={12} />
                        Respuesta del Agente:
                      </p>
                      <div className="text-sm text-zinc-700 bg-white/60 p-4 rounded-lg border border-zinc-200 prose prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {execution.result}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                  {execution.error && (
                    <div className="mb-2">
                      <p className="text-xs text-red-600 mb-1">Error:</p>
                      <pre className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200 whitespace-pre-wrap">
                        {execution.error}
                      </pre>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs">
                    {execution.tools_used && execution.tools_used.length > 0 && (
                      <div className="flex items-center gap-1.5 text-zinc-500">
                        <Zap size={12} className="text-purple-500" />
                        <span className="font-medium">Herramientas:</span>
                        <div className="flex gap-1">
                          {execution.tools_used.map((tool: string) => (
                            <span key={tool} className="px-1.5 py-0.5 bg-purple-50 text-purple-600 text-[10px] rounded">
                              {tool}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {execution.execution_time_ms && (
                      <div className="flex items-center gap-1 text-zinc-500">
                        <ClockIcon size={12} className="text-blue-500" />
                        <span>{(execution.execution_time_ms / 1000).toFixed(2)}s</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ======= BANNERS TAB =======
  function renderBannersTab() {
    const saveBanner = async () => {
      const body = {
        ...bannerForm,
        priority: Number.isFinite(Number(bannerForm.priority)) ? Number(bannerForm.priority) : 0,
        cta_label: bannerForm.cta_label.trim() || null,
        cta_url: bannerForm.cta_url.trim() || null,
        image_url: bannerForm.image_url.trim() || null,
        accent_color: bannerForm.accent_color.trim() || null,
        start_date: bannerForm.start_date || null,
        end_date: bannerForm.end_date || null,
      }

      if (editingBanner) {
        await fetch('/api/admin/banners', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingBanner.id, ...body }),
        })
      } else {
        await fetch('/api/admin/banners', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }

      setShowBannerForm(false)
      setEditingBanner(null)
      setBannerForm(createEmptyBannerForm())
      await loadBanners()
    }

    const deleteBanner = async (id: string) => {
      await fetch('/api/admin/banners', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setBanners((prev) => prev.filter((banner) => banner.id !== id))
    }

    const toggleBanner = async (banner: Banner) => {
      await fetch('/api/admin/banners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: banner.id, is_active: !banner.is_active }),
      })
      setBanners((prev) => prev.map((item) => (item.id === banner.id ? { ...item, is_active: !item.is_active } : item)))
    }

    const editBanner = (banner: Banner) => {
      setEditingBanner(banner)
      setBannerForm({
        title: banner.title,
        message: banner.message,
        type: banner.type,
        display_mode: banner.display_mode || 'banner',
        priority: Number.isFinite(Number(banner.priority)) ? Number(banner.priority) : 0,
        is_active: banner.is_active,
        dismissible: banner.dismissible ?? true,
        show_once: banner.show_once ?? true,
        cta_label: banner.cta_label || '',
        cta_url: banner.cta_url || '',
        image_url: banner.image_url || '',
        accent_color: banner.accent_color || '',
        start_date: banner.start_date ? banner.start_date.slice(0, 16) : '',
        end_date: banner.end_date ? banner.end_date.slice(0, 16) : '',
      })
      setShowBannerForm(true)
    }

    const typeColors: Record<Banner['type'], string> = {
      info: 'bg-blue-50 border-blue-200 text-blue-800',
      warning: 'bg-amber-50 border-amber-200 text-amber-800',
      error: 'bg-rose-50 border-rose-200 text-rose-800',
      success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    }

    const typeLabels: Record<Banner['type'], string> = {
      info: 'Info',
      warning: 'Aviso',
      error: 'Critico',
      success: 'Exito',
    }

    const typeIcons: Record<Banner['type'], React.ReactNode> = {
      info: <Megaphone size={14} />,
      warning: <Sparkles size={14} />,
      error: <Shield size={14} />,
      success: <Check size={14} />,
    }

    const modeLabel: Record<Banner['display_mode'], string> = {
      banner: 'Banner',
      popup: 'Popup',
      both: 'Banner + Popup',
    }

    const previewAccent = bannerForm.accent_color.trim() || '#6366f1'

    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-800">Banners y Popups globales</h2>
            <p className="text-xs text-zinc-400">Comunicaciones avanzadas para todos los usuarios con modo, prioridad y CTA.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { void loadBanners() }}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/80 border border-zinc-200 text-zinc-600 text-sm rounded-lg hover:bg-white transition-colors"
            >
              <RefreshCw size={14} /> Recargar
            </button>
            <button
              onClick={() => {
                setEditingBanner(null)
                setBannerForm(createEmptyBannerForm())
                setShowBannerForm(!showBannerForm)
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-500 transition-colors"
            >
              <Plus size={14} /> Nuevo aviso
            </button>
          </div>
        </div>

        {showBannerForm && (
          <div className="bg-white/86 border border-zinc-200 rounded-2xl p-4 mb-4 space-y-3 shadow-[0_10px_28px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-700">{editingBanner ? 'Editar configuracion' : 'Nuevo aviso global'}</p>
              <span className="text-[11px] text-zinc-400">Modo: {modeLabel[bannerForm.display_mode]}</span>
            </div>

            <input
              value={bannerForm.title}
              onChange={(e) => setBannerForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Titulo principal"
              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
            <textarea
              value={bannerForm.message}
              onChange={(e) => setBannerForm((f) => ({ ...f, message: e.target.value }))}
              placeholder="Mensaje secundario (descripcion o instrucciones)"
              rows={3}
              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
            />

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Tipo</label>
                <select
                  value={bannerForm.type}
                  onChange={(e) => setBannerForm((f) => ({ ...f, type: e.target.value as Banner['type'] }))}
                  className="px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white"
                >
                  <option value="info">Info</option>
                  <option value="warning">Aviso</option>
                  <option value="error">Critico</option>
                  <option value="success">Exito</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Modo</label>
                <select
                  value={bannerForm.display_mode}
                  onChange={(e) => setBannerForm((f) => ({ ...f, display_mode: e.target.value as Banner['display_mode'] }))}
                  className="px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white"
                >
                  <option value="banner">Banner</option>
                  <option value="popup">Popup</option>
                  <option value="both">Banner + Popup</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Prioridad</label>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={bannerForm.priority}
                  onChange={(e) => setBannerForm((f) => ({ ...f, priority: Number.parseInt(e.target.value, 10) || 0 }))}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Desde</label>
                <input
                  type="datetime-local"
                  value={bannerForm.start_date}
                  onChange={(e) => setBannerForm((f) => ({ ...f, start_date: e.target.value }))}
                  className="px-3 py-2 border border-zinc-200 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Hasta</label>
                <input
                  type="datetime-local"
                  value={bannerForm.end_date}
                  onChange={(e) => setBannerForm((f) => ({ ...f, end_date: e.target.value }))}
                  className="px-3 py-2 border border-zinc-200 rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">CTA texto</label>
                <input
                  value={bannerForm.cta_label}
                  onChange={(e) => setBannerForm((f) => ({ ...f, cta_label: e.target.value }))}
                  placeholder="Ver mas"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">CTA URL</label>
                <input
                  value={bannerForm.cta_url}
                  onChange={(e) => setBannerForm((f) => ({ ...f, cta_url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Imagen URL (popup)</label>
                <input
                  value={bannerForm.image_url}
                  onChange={(e) => setBannerForm((f) => ({ ...f, image_url: e.target.value }))}
                  placeholder="https://.../cover.png"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Color acento</label>
                <input
                  value={bannerForm.accent_color}
                  onChange={(e) => setBannerForm((f) => ({ ...f, accent_color: e.target.value }))}
                  placeholder="#6366f1"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap pt-1">
              <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
                <input type="checkbox" checked={bannerForm.is_active} onChange={(e) => setBannerForm((f) => ({ ...f, is_active: e.target.checked }))} className="rounded" />
                Activo
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
                <input type="checkbox" checked={bannerForm.dismissible} onChange={(e) => setBannerForm((f) => ({ ...f, dismissible: e.target.checked }))} className="rounded" />
                Dismissible
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
                <input type="checkbox" checked={bannerForm.show_once} onChange={(e) => setBannerForm((f) => ({ ...f, show_once: e.target.checked }))} className="rounded" />
                Mostrar una vez
              </label>
            </div>

            {bannerForm.title && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-1">
                <div className={`border rounded-xl p-3 ${typeColors[bannerForm.type]} relative overflow-hidden`}>
                  <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: previewAccent }} />
                  <p className="text-[11px] font-semibold uppercase tracking-wide ml-2 flex items-center gap-1.5">
                    <PanelsTopLeft size={12} /> Preview banner
                  </p>
                  <p className="text-sm font-medium mt-1 ml-2">{bannerForm.title}</p>
                  {bannerForm.message && <p className="text-xs mt-1 opacity-80 ml-2">{bannerForm.message}</p>}
                </div>

                <div className="border rounded-xl bg-zinc-900/90 text-white p-3 relative overflow-hidden">
                  <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: previewAccent }} />
                  <p className="text-[11px] uppercase tracking-wide opacity-70 flex items-center gap-1.5"><MonitorSmartphone size={12} /> Preview popup</p>
                  <p className="text-sm font-semibold mt-1">{bannerForm.title}</p>
                  {bannerForm.message && <p className="text-xs mt-1 text-zinc-200">{bannerForm.message}</p>}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[10px] text-zinc-400">{modeLabel[bannerForm.display_mode]}</span>
                    {bannerForm.cta_label && (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-white/15 border border-white/20">
                        <MousePointerClick size={11} /> {bannerForm.cta_label}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowBannerForm(false)
                  setEditingBanner(null)
                }}
                className="px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={() => { void saveBanner() }}
                disabled={!bannerForm.title.trim()}
                className="px-4 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-500 disabled:opacity-50"
              >
                {editingBanner ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </div>
        )}

        {bannersLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-zinc-400" size={24} /></div>
        ) : banners.length === 0 ? (
          <div className="text-center py-12 bg-white border border-zinc-200 rounded-xl">
            <Megaphone size={36} className="mx-auto text-zinc-300 mb-2" />
            <p className="text-sm text-zinc-400">No hay avisos configurados</p>
          </div>
        ) : (
          <div className="space-y-2">
            {banners.map((banner) => {
              const mode = (banner.display_mode || 'banner') as Banner['display_mode']
              const priority = Number.isFinite(Number(banner.priority)) ? Number(banner.priority) : 0
              return (
                <div key={banner.id} className={`border rounded-xl p-4 flex items-start gap-3 ${banner.is_active ? typeColors[banner.type] : 'bg-zinc-50 border-zinc-200 text-zinc-400'}`}>
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-white/70 border border-white/70 flex items-center justify-center">
                    {typeIcons[banner.type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{banner.title}</p>
                    {banner.message && <p className="text-xs mt-0.5 opacity-80">{banner.message}</p>}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/70 border border-white/70">{typeLabels[banner.type]}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/70 border border-white/70">{modeLabel[mode]}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/70 border border-white/70">Prioridad {priority}</span>
                      {(banner.cta_label || banner.cta_url) && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/70 border border-white/70 inline-flex items-center gap-1">
                          <MousePointerClick size={10} /> CTA
                        </span>
                      )}
                      {banner.image_url && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/70 border border-white/70 inline-flex items-center gap-1">
                          <ImageIcon size={10} /> Imagen
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] mt-2 opacity-70">
                      {banner.start_date ? `Desde: ${new Date(banner.start_date).toLocaleString()}` : 'Sin inicio'}
                      {' · '}
                      {banner.end_date ? `Hasta: ${new Date(banner.end_date).toLocaleString()}` : 'Sin fin'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => { void toggleBanner(banner) }} className="p-1.5 hover:bg-white/50 rounded" title={banner.is_active ? 'Desactivar' : 'Activar'}>
                      {banner.is_active ? <ToggleRight size={18} className="text-emerald-600" /> : <ToggleLeft size={18} className="text-zinc-400" />}
                    </button>
                    <button onClick={() => editBanner(banner)} className="p-1.5 hover:bg-white/50 rounded"><Edit3 size={14} /></button>
                    <button onClick={() => { void deleteBanner(banner.id) }} className="p-1.5 hover:bg-red-100 rounded text-red-500"><Trash2 size={14} /></button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ======= THEMES TAB =======
  function renderThemesTab() {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-zinc-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-zinc-800 mb-4 flex items-center gap-2">
            <Palette size={20} className="text-blue-600" />
            Seleccionar Tema
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">Tema Activo (se aplica a TODOS los usuarios)</label>
              <select
                value={currentTheme.slug}
                onChange={(e) => void changeTheme(e.target.value)}
                className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {Object.values(availableThemes).map((theme) => (
                  <option key={theme.id} value={theme.slug}>
                    {theme.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>Tema actual:</strong> {currentTheme.name}
              </p>
              <p className="text-xs text-blue-600 mt-1">
                {currentTheme.description}
              </p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-xs text-green-700">
                ✅ Los temas ahora son locales y se guardan en tu navegador
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ======= NOTIFICATION SOUND TAB =======
  function renderNotificationSoundTab() {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-zinc-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-zinc-800 mb-4 flex items-center gap-2">
            <Volume2 size={20} className="text-blue-600" />
            Configuración de Sonido de Notificaciones (Global)
          </h3>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-amber-800 font-medium">
              🌍 Esta configuración se aplica a TODOS los usuarios de la aplicación
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">Subir Archivo MP3</label>
              <input
                type="file"
                accept="audio/mp3,audio/mpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void uploadNotificationSound(file)
                }}
                disabled={uploadingSoundFile}
                className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {uploadingSoundFile && (
                <p className="text-sm text-blue-600 mt-2 flex items-center gap-2">
                  <Loader2 className="animate-spin" size={16} />
                  Procesando y guardando para todos los usuarios...
                </p>
              )}
              <p className="text-xs text-zinc-500 mt-2">
                El sonido se guardará en la base de datos y se aplicará a todos los usuarios.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">Duración de la Notificación (segundos)</label>
              <input
                type="number"
                min="1"
                max="30"
                value={notificationSettings.duration_seconds}
                onChange={(e) => {
                  const newSettings = { ...notificationSettings, duration_seconds: parseInt(e.target.value) || 5 }
                  setNotificationSettings(newSettings)
                }}
                className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Tiempo que la notificación permanecerá visible (1-30 segundos)
              </p>
            </div>

            {notificationSettings.sound_url && notificationSettings.sound_url !== null && notificationSettings.sound_url.trim() !== '' && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">Vista Previa del Sonido</label>
                <audio controls src={notificationSettings.sound_url} className="w-full" />
                <p className="text-xs text-green-600 mt-2">
                  ✅ Sonido configurado correctamente
                </p>
              </div>
            )}

            {(!notificationSettings.sound_url || notificationSettings.sound_url === null || notificationSettings.sound_url.trim() === '') && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-xs text-amber-700">
                  ℹ️ No hay sonido configurado. Sube un archivo MP3 para activar las notificaciones sonoras.
                </p>
              </div>
            )}

            <button
              onClick={saveNotificationSettings}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 flex items-center gap-2"
            >
              <Save size={16} />
              Guardar Configuración
            </button>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-xs text-green-700">
                ✅ La configuración se guarda en la base de datos y se aplica automáticamente a todos los usuarios cuando recarguen la página.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }



  return (
    <>
      {renderMainContent()}

      {/* Create User Modal */}
      {showCreateUserModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 max-w-md w-full max-h-[95vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-zinc-800 mb-4">Crear Nuevo Usuario</h3>

            {!createdUserCredentials ? (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Email *</label>
                    <input
                      type="email"
                      value={createUserForm.email}
                      onChange={(e) => setCreateUserForm({ ...createUserForm, email: e.target.value })}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm"
                      placeholder="usuario@ejemplo.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Nombre *</label>
                    <input
                      type="text"
                      value={createUserForm.name}
                      onChange={(e) => setCreateUserForm({ ...createUserForm, name: e.target.value })}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm"
                      placeholder="Nombre completo"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Rol *</label>
                    <select
                      value={createUserForm.role}
                      onChange={(e) => setCreateUserForm({ ...createUserForm, role: e.target.value })}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm"
                    >
                      {allRoles.map(role => (
                        <option key={role.id} value={role.name}>{role.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Contraseña</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={createUserForm.password}
                        onChange={(e) => setCreateUserForm({ ...createUserForm, password: e.target.value })}
                        className="w-full px-3 py-2 pr-10 border border-zinc-300 rounded-lg text-sm"
                        placeholder="Dejar vacío para generar automáticamente"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-700 transition-colors"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                      Si no se especifica, se generará una contraseña temporal automáticamente
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-6">
                  <button
                    onClick={createNewUser}
                    disabled={creatingUser || !createUserForm.email || !createUserForm.name}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {creatingUser && <Loader2 size={16} className="animate-spin" />}
                    Crear Usuario
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateUserModal(false)
                      setCreateUserForm({ email: '', name: '', role: 'user', password: '' })
                    }}
                    className="px-4 py-2 bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-green-800 font-medium mb-2">✅ Usuario creado correctamente</p>
                  {createdUserCredentials.emailSent ? (
                    <p className="text-xs text-green-700">📧 Se ha enviado un email al usuario con sus credenciales de acceso.</p>
                  ) : (
                    <p className="text-xs text-green-700">⚠️ No se pudo enviar el email automáticamente. Envía estas credenciales al usuario de forma segura:</p>
                  )}
                </div>
                <div className="space-y-3 bg-zinc-50 rounded-lg p-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 mb-1">Email</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={createdUserCredentials.email}
                        readOnly
                        className="flex-1 px-3 py-2 bg-white border border-zinc-300 rounded-lg text-sm"
                      />
                      <button
                        onClick={() => navigator.clipboard.writeText(createdUserCredentials.email)}
                        className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
                      >
                        <Check size={16} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 mb-1">Contraseña Temporal</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={createdUserCredentials.temporaryPassword}
                        readOnly
                        className="flex-1 px-3 py-2 bg-white border border-zinc-300 rounded-lg text-sm font-mono"
                      />
                      <button
                        onClick={() => navigator.clipboard.writeText(createdUserCredentials.temporaryPassword)}
                        className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
                      >
                        <Check size={16} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 mb-1">Enlace para Cambiar Contraseña</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={createdUserCredentials.resetLink}
                        readOnly
                        className="flex-1 px-3 py-2 bg-white border border-zinc-300 rounded-lg text-sm text-xs"
                      />
                      <button
                        onClick={() => navigator.clipboard.writeText(createdUserCredentials.resetLink)}
                        className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
                      >
                        <Check size={16} />
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowCreateUserModal(false)
                    setCreatedUserCredentials(null)
                    setCreateUserForm({ email: '', name: '', role: 'user', password: '' })
                  }}
                  className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
                >
                  Cerrar
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
