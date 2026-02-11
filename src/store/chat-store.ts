import { create } from 'zustand'
import { Conversation, Message, RagMode } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

interface ChatState {
  conversations: Conversation[]
  activeConversationId: string | null
  messages: Message[]
  isStreaming: boolean
  streamingContent: string
  sidebarOpen: boolean
  focusMode: boolean
  selectedModel: string
  ragMode: RagMode
  citeMode: boolean
  webSearch: boolean
  dbQuery: boolean
  networkDriveRag: boolean
  imageGeneration: boolean
  isLoading: boolean

  setSidebarOpen: (open: boolean) => void
  setFocusMode: (focus: boolean) => void
  setSelectedModel: (model: string) => void
  setRagMode: (mode: RagMode) => void
  setCiteMode: (cite: boolean) => void
  setWebSearch: (enabled: boolean) => void
  setDbQuery: (enabled: boolean) => void
  setNetworkDriveRag: (enabled: boolean) => void
  setImageGeneration: (enabled: boolean) => void
  setIsStreaming: (streaming: boolean) => void
  setStreamingContent: (content: string) => void

  loadConversations: () => Promise<void>
  setActiveConversation: (id: string | null) => void
  loadMessages: (conversationId: string) => Promise<void>
  createConversation: (projectId?: string | null) => Promise<string | null>
  deleteConversation: (id: string) => Promise<void>
  updateConversation: (id: string, updates: Partial<Conversation>) => Promise<void>
  duplicateConversation: (id: string) => Promise<string | null>
  addMessage: (msg: Partial<Message>) => void
  updateMessage: (id: string, updates: Partial<Message>) => void
  removeMessagesAfter: (messageId: string) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  isStreaming: false,
  streamingContent: '',
  sidebarOpen: true,
  focusMode: false,
  selectedModel: 'gpt-4o-mini',
  ragMode: 'off',
  citeMode: false,
  webSearch: false,
  dbQuery: false,
  networkDriveRag: false,
  imageGeneration: false,
  isLoading: false,

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setFocusMode: (focus) => set({ focusMode: focus, sidebarOpen: !focus }),
  setSelectedModel: (model) => set({ selectedModel: model }),
  setRagMode: (mode) => set({ ragMode: mode }),
  setCiteMode: (cite) => set({ citeMode: cite }),
  setWebSearch: (enabled) => set({ webSearch: enabled }),
  setDbQuery: (enabled) => set({ dbQuery: enabled }),
  setNetworkDriveRag: (enabled) => set({ networkDriveRag: enabled }),
  setImageGeneration: (enabled) => set({ imageGeneration: enabled }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setStreamingContent: (content) => set({ streamingContent: content }),

  loadConversations: async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .is('deleted_at', null)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
    if (data) set({ conversations: data })
  },

  setActiveConversation: (id) => {
    set({ activeConversationId: id, messages: [] })
    if (id) get().loadMessages(id)
    // Sync URL with active conversation
    if (typeof window !== 'undefined') {
      const target = id ? `/chat/${id}` : '/chat'
      if (window.location.pathname !== target) {
        window.history.pushState({}, '', target)
      }
    }
  },

  loadMessages: async (conversationId) => {
    set({ isLoading: true })
    const supabase = createClient()
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
    if (data) set({ messages: data })
    set({ isLoading: false })
  },

  createConversation: async (projectId = null) => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const model = get().selectedModel
    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: user.id, project_id: projectId, model_default: model, title: 'Nuevo chat' })
      .select()
      .single()
    if (error || !data) return null
    set((s) => ({ conversations: [data, ...s.conversations], activeConversationId: data.id, messages: [] }))
    // Sync URL with new conversation
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', `/chat/${data.id}`)
    }
    return data.id
  },

  deleteConversation: async (id) => {
    const supabase = createClient()
    // Hard delete - CASCADE will remove messages, tags, memories, etc.
    const { error } = await supabase.from('conversations').delete().eq('id', id)
    if (error) console.error('Error deleting conversation:', error)
    const wasActive = get().activeConversationId === id
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      activeConversationId: s.activeConversationId === id ? null : s.activeConversationId,
      messages: s.activeConversationId === id ? [] : s.messages,
    }))
    // Navigate back to /chat if we deleted the active conversation
    if (wasActive && typeof window !== 'undefined') {
      window.history.pushState({}, '', '/chat')
    }
  },

  updateConversation: async (id, updates) => {
    const supabase = createClient()
    await supabase.from('conversations').update(updates).eq('id', id)
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === id ? { ...c, ...updates } : c)),
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
      .insert({ user_id: user.id, project_id: conv.project_id, title: `${conv.title} (copia)`, model_default: conv.model_default })
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
  clearMessages: () => set({ messages: [] }),
}))

