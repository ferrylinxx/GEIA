import { create } from 'zustand'

// ── Toast types ──
export interface Toast {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  message: string
  duration?: number
}

// ── Confirm dialog ──
export interface ConfirmDialog {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'default'
  onConfirm: () => void
}

// ── Tool status ──
export type ToolStatus =
  | 'idle'
  | 'searching_web'
  | 'querying_db'
  | 'searching_network'
  | 'generating_image'
  | 'deep_research'
  | 'creating_document'
  | 'reading_ocr'
  | 'analyzing_spreadsheet'
  | 'summarizing_youtube'
  | 'thinking'

export interface DeepResearchProgress {
  phase: 'warmup' | 'planning' | 'followup' | 'ranking' | 'images' | 'complete'
  message: string
  progress: number // 0-100
}

interface UIState {
  theme: 'light' | 'dark'
  searchOpen: boolean
  settingsOpen: boolean
  filePreviewOpen: boolean
  filePreviewId: string | null
  imagePreviewUrls: string[]
  imagePreviewIndex: number
  imagePreviewPrompt: string | null
  memoryPanelOpen: boolean
  fileLibraryOpen: boolean
  // Toasts
  toasts: Toast[]
  // Confirm dialog
  confirmDialog: ConfirmDialog | null
  // Tool status
  toolStatus: ToolStatus
  // Sound preference
  soundEnabled: boolean
  // Sidebar width
  sidebarWidth: number
  // Channels
  channelsPanelOpen: boolean
  activeChannelId: string | null
  // Deep Research Progress
  deepResearchProgress: DeepResearchProgress | null

  setTheme: (theme: 'light' | 'dark') => void
  toggleTheme: () => void
  setSearchOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  openFilePreview: (fileId: string) => void
  openImagePreview: (urls: string[], index?: number, prompt?: string | null) => void
  setImagePreviewIndex: (index: number) => void
  closeFilePreview: () => void
  setMemoryPanelOpen: (open: boolean) => void
  setFileLibraryOpen: (open: boolean) => void
  // Toasts
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  // Confirm dialog
  showConfirm: (dialog: ConfirmDialog) => void
  hideConfirm: () => void
  // Tool status
  setToolStatus: (status: ToolStatus) => void
  // Sound
  setSoundEnabled: (enabled: boolean) => void
  // Sidebar width
  setSidebarWidth: (width: number) => void
  // Channels
  setChannelsPanelOpen: (open: boolean) => void
  setActiveChannelId: (id: string | null) => void
  // Deep Research Progress
  setDeepResearchProgress: (progress: DeepResearchProgress | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  theme: 'light',
  searchOpen: false,
  settingsOpen: false,
  filePreviewOpen: false,
  filePreviewId: null,
  imagePreviewUrls: [],
  imagePreviewIndex: 0,
  imagePreviewPrompt: null,
  memoryPanelOpen: false,
  fileLibraryOpen: false,
  toasts: [],
  confirmDialog: null,
  toolStatus: 'idle',
  soundEnabled: typeof window !== 'undefined' ? localStorage.getItem('geia-sound') !== 'false' : true,
  sidebarWidth: typeof window !== 'undefined' ? parseInt(localStorage.getItem('geia-sidebar-width') || '256') : 256,
  channelsPanelOpen: false,
  activeChannelId: null,
  deepResearchProgress: null,

  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  openFilePreview: (fileId) => set({
    filePreviewOpen: true,
    filePreviewId: fileId,
    imagePreviewUrls: [],
    imagePreviewIndex: 0,
    imagePreviewPrompt: null,
  }),
  openImagePreview: (urls, index = 0, prompt = null) => {
    const safeUrls = Array.from(new Set((urls || []).filter((url): url is string => typeof url === 'string' && url.trim().length > 0)))
    const safeIndex = safeUrls.length === 0
      ? 0
      : Math.max(0, Math.min(index, safeUrls.length - 1))

    set({
      filePreviewOpen: safeUrls.length > 0,
      filePreviewId: null,
      imagePreviewUrls: safeUrls,
      imagePreviewIndex: safeIndex,
      imagePreviewPrompt: prompt,
    })
  },
  setImagePreviewIndex: (index) => set((state) => {
    if (!state.imagePreviewUrls || state.imagePreviewUrls.length === 0) return { imagePreviewIndex: 0 }
    const safeIndex = Math.max(0, Math.min(index, state.imagePreviewUrls.length - 1))
    return { imagePreviewIndex: safeIndex }
  }),
  closeFilePreview: () => set({
    filePreviewOpen: false,
    filePreviewId: null,
    imagePreviewUrls: [],
    imagePreviewIndex: 0,
    imagePreviewPrompt: null,
  }),
  setMemoryPanelOpen: (open) => set({ memoryPanelOpen: open }),
  setFileLibraryOpen: (open) => set({ fileLibraryOpen: open }),

  addToast: (toast) => {
    const id = crypto.randomUUID()
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, toast.duration || 3500)
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  showConfirm: (dialog) => set({ confirmDialog: dialog }),
  hideConfirm: () => set({ confirmDialog: null }),

  setToolStatus: (status) => set({ toolStatus: status }),

  setSoundEnabled: (enabled) => {
    if (typeof window !== 'undefined') localStorage.setItem('geia-sound', String(enabled))
    set({ soundEnabled: enabled })
  },
  setSidebarWidth: (width) => {
    const clamped = Math.max(200, Math.min(400, width))
    if (typeof window !== 'undefined') localStorage.setItem('geia-sidebar-width', String(clamped))
    set({ sidebarWidth: clamped })
  },
  setChannelsPanelOpen: (open) => set({ channelsPanelOpen: open }),
  setActiveChannelId: (id) => set({ activeChannelId: id }),
  setDeepResearchProgress: (progress) => set({ deepResearchProgress: progress }),
}))
