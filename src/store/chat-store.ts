import { create } from 'zustand'
import { Conversation, Message, RagMode } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

interface ChatState {
  conversations: Conversation[]
  activeConversationId: string | null
  projectContextId: string | null
  messages: Message[]
  isStreaming: boolean
  streamAbortController: AbortController | null
  streamingConversationId: string | null
  streamingContent: string
  sidebarOpen: boolean
  focusMode: boolean
  selectedModel: string
  selectedAgent: string | null
  ragMode: RagMode
  citeMode: boolean
  webSearch: boolean
  dbQuery: boolean
  networkDriveRag: boolean
  imageGeneration: boolean
  deepResearch: boolean
  researchMode: 'standard' | 'exhaustive'
  documentGeneration: boolean
  ocrMode: boolean
  spreadsheetAnalysis: boolean
  youtubeSummary: boolean
  codeInterpreter: boolean
  isLoading: boolean
  assistantVersionOverrides: Record<string, number>

  setSidebarOpen: (open: boolean) => void
  setFocusMode: (focus: boolean) => void
  setSelectedModel: (model: string) => void
  setSelectedAgent: (agentId: string | null) => void
  setRagMode: (mode: RagMode) => void
  setCiteMode: (cite: boolean) => void
  setWebSearch: (enabled: boolean) => void
  setDbQuery: (enabled: boolean) => void
  setNetworkDriveRag: (enabled: boolean) => void
  setImageGeneration: (enabled: boolean) => void
  setDeepResearch: (enabled: boolean) => void
  setResearchMode: (mode: 'standard' | 'exhaustive') => void
  setDocumentGeneration: (enabled: boolean) => void
  setOcrMode: (enabled: boolean) => void
  setSpreadsheetAnalysis: (enabled: boolean) => void
  setYoutubeSummary: (enabled: boolean) => void
  setCodeInterpreter: (enabled: boolean) => void
  setIsStreaming: (streaming: boolean) => void
  setStreamAbortController: (controller: AbortController | null) => void
  abortStreaming: () => void
  setStreamingConversationId: (id: string | null) => void
  setStreamingContent: (content: string) => void
  setProjectContextId: (projectId: string | null) => void
  setAssistantVersionOverride: (messageId: string, versionNumber: number) => void
  clearAssistantVersionOverride: (messageId: string) => void
  clearAssistantVersionOverrides: () => void

  showArchived: boolean
  setShowArchived: (show: boolean) => void
  loadConversations: () => Promise<void>
  setActiveConversation: (id: string | null) => void
  loadMessages: (conversationId: string, options?: { silent?: boolean }) => Promise<void>
  createConversation: (projectId?: string | null) => Promise<string | null>
  deleteConversation: (id: string) => Promise<void>
  updateConversation: (id: string, updates: Partial<Conversation>) => Promise<void>
  archiveConversation: (id: string) => Promise<void>
  unarchiveConversation: (id: string) => Promise<void>
  duplicateConversation: (id: string) => Promise<string | null>
  addMessage: (msg: Partial<Message>) => void
  updateMessage: (id: string, updates: Partial<Message>) => void
  removeMessagesAfter: (messageId: string) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  projectContextId: null,
  messages: [],
  isStreaming: false,
  streamAbortController: null,
  streamingConversationId: null,
  streamingContent: '',
  sidebarOpen: false,
  focusMode: false,
  selectedModel: 'gpt-4o-mini',
  selectedAgent: null,
  ragMode: 'off',
  citeMode: true,
  webSearch: false,
  dbQuery: false,
  networkDriveRag: false,
  imageGeneration: false,
  deepResearch: false,
  researchMode: 'standard',
  documentGeneration: false,
  ocrMode: false,
  spreadsheetAnalysis: false,
  youtubeSummary: false,
  codeInterpreter: false,
  isLoading: false,
  assistantVersionOverrides: {},
  showArchived: false,
  setShowArchived: (show) => set({ showArchived: show }),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setFocusMode: (focus) => set({ focusMode: focus, sidebarOpen: !focus }),
  setSelectedModel: (model) => set({ selectedModel: model, selectedAgent: null }),
  setSelectedAgent: (agentId) => set({ selectedAgent: agentId }),
  setRagMode: (mode) => set({ ragMode: mode }),
  setCiteMode: (cite) => set({ citeMode: cite }),
  setWebSearch: (enabled) => set({ webSearch: enabled }),
  setDbQuery: (enabled) => set({ dbQuery: enabled }),
  setNetworkDriveRag: (enabled) => set({ networkDriveRag: enabled }),
  setImageGeneration: (enabled) => set({ imageGeneration: enabled }),
  setDeepResearch: (enabled) => set({ deepResearch: enabled }),
  setResearchMode: (mode) => set({ researchMode: mode }),
  setDocumentGeneration: (enabled) => set({ documentGeneration: enabled }),
  setOcrMode: (enabled) => set({ ocrMode: enabled }),
  setSpreadsheetAnalysis: (enabled) => set({ spreadsheetAnalysis: enabled }),
  setYoutubeSummary: (enabled) => set({ youtubeSummary: enabled }),
  setCodeInterpreter: (enabled) => set({ codeInterpreter: enabled }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setStreamAbortController: (controller) => set({ streamAbortController: controller }),
  abortStreaming: () => {
    const controller = get().streamAbortController
    try { controller?.abort() } catch { /* ignore */ }
    set({ streamAbortController: null })
  },
  setStreamingConversationId: (id) => set({ streamingConversationId: id }),
  setStreamingContent: (content) => set({ streamingContent: content }),
  setProjectContextId: (projectId) => set({ projectContextId: projectId }),
  setAssistantVersionOverride: (messageId, versionNumber) => set((s) => ({
    assistantVersionOverrides: {
      ...s.assistantVersionOverrides,
      [messageId]: Math.max(1, Math.floor(Number(versionNumber) || 1)),
    },
  })),
  clearAssistantVersionOverride: (messageId) => set((s) => {
    const next = { ...s.assistantVersionOverrides }
    delete next[messageId]
    return { assistantVersionOverrides: next }
  }),
  clearAssistantVersionOverrides: () => set({ assistantVersionOverrides: {} }),

  loadConversations: async () => {
    const supabase = createClient()
    const showArchived = get().showArchived
    let query = supabase
      .from('conversations')
      .select('*')
      .is('deleted_at', null)
    if (!showArchived) {
      query = query.or('is_archived.is.null,is_archived.eq.false')
    } else {
      query = query.eq('is_archived', true)
    }
    const { data } = await query
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
    if (data) set({ conversations: data })
  },

  setActiveConversation: (id) => {
    // Do NOT clear projectContextId on "new chat" (id === null). That enables new chats inside the same project.
    const conv = id ? get().conversations.find((c) => c.id === id) : null
    const next: Partial<ChatState> = { activeConversationId: id, messages: [], assistantVersionOverrides: {}, isLoading: false }
    if (id) next.projectContextId = conv?.project_id || null
    set(next as ChatState)
    if (id && !conv) {
      // Fallback for direct URL opens before conversations are loaded in memory.
      void (async () => {
        try {
          const supabase = createClient()
          const { data } = await supabase
            .from('conversations')
            .select('project_id')
            .eq('id', id)
            .single()
          if (get().activeConversationId === id) {
            set({ projectContextId: data?.project_id || null })
          }
        } catch {
          // ignore
        }
      })()
    }
    if (id) get().loadMessages(id)
  },

  loadMessages: async (conversationId, options) => {
    const silent = options?.silent === true
    if (!silent) set({ isLoading: true })
    const supabase = createClient()
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
    // Guard against race conditions: do not overwrite messages if the user switched chats mid-fetch.
    const stillActive = get().activeConversationId === conversationId
    if (data && stillActive) set({ messages: data })
    if (!silent && stillActive) set({ isLoading: false })
  },

  createConversation: async (projectId = null) => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const model = get().selectedModel
    const { data, error } = await supabase
      .from('conversations')
      .insert({
        user_id: user.id,
        project_id: projectId,
        model_default: model,
        title: 'Nuevo chat',
        rag_mode: get().ragMode || 'assisted',
        cite_mode: get().citeMode ?? true,
      })
      .select()
      .single()
    if (error || !data) return null
    set((s) => ({
      conversations: [data, ...s.conversations],
      activeConversationId: data.id,
      projectContextId: projectId || null,
      messages: [],
    }))
    return data.id
  },

  deleteConversation: async (id) => {
    const supabase = createClient()
    // Hard delete - CASCADE will remove messages, tags, memories, etc.
    const { error } = await supabase.from('conversations').delete().eq('id', id)
    if (error) console.error('Error deleting conversation:', error)
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      activeConversationId: s.activeConversationId === id ? null : s.activeConversationId,
      messages: s.activeConversationId === id ? [] : s.messages,
    }))
  },

  updateConversation: async (id, updates) => {
    const supabase = createClient()
    await supabase.from('conversations').update(updates).eq('id', id)
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    }))
  },

  archiveConversation: async (id) => {
    const supabase = createClient()
    await supabase.from('conversations').update({ is_archived: true }).eq('id', id)
    const wasActive = get().activeConversationId === id
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      activeConversationId: wasActive ? null : s.activeConversationId,
      messages: wasActive ? [] : s.messages,
    }))
  },

  unarchiveConversation: async (id) => {
    const supabase = createClient()
    await supabase.from('conversations').update({ is_archived: false }).eq('id', id)
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
    }))
  },

  duplicateConversation: async (id) => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const conv = get().conversations.find((c) => c.id === id)
    if (!conv) return null
    const { data: newConv } = await supabase
      .from('conversations')
      .insert({
        user_id: user.id,
        project_id: conv.project_id,
        title: `${conv.title} (copia)`,
        model_default: conv.model_default,
        rag_mode: conv.rag_mode || get().ragMode || 'assisted',
        cite_mode: Boolean(conv.cite_mode),
      })
      .select().single()
    if (!newConv) return null
    const { data: msgs } = await supabase.from('messages').select('*').eq('conversation_id', id).order('created_at')
    if (msgs) {
      for (const m of msgs) {
        await supabase.from('messages').insert({
          conversation_id: newConv.id, user_id: user.id, role: m.role, content: m.content,
          attachments_json: m.attachments_json, sources_json: m.sources_json,
        })
      }
    }
    set((s) => ({ conversations: [newConv, ...s.conversations] }))
    return newConv.id
  },

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg as Message] })),
  updateMessage: (id, updates) => set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)) })),
  removeMessagesAfter: (messageId) => set((s) => {
    const idx = s.messages.findIndex((m) => m.id === messageId)
    if (idx < 0) return s
    return { messages: s.messages.slice(0, idx + 1) }
  }),
  clearMessages: () => set({ messages: [], assistantVersionOverrides: {} }),
}))
