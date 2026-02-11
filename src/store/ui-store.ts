import { create } from 'zustand'

interface UIState {
  theme: 'light' | 'dark'
  searchOpen: boolean
  settingsOpen: boolean
  filePreviewOpen: boolean
  filePreviewId: string | null
  memoryPanelOpen: boolean
  fileLibraryOpen: boolean

  setTheme: (theme: 'light' | 'dark') => void
  toggleTheme: () => void
  setSearchOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  openFilePreview: (fileId: string) => void
  closeFilePreview: () => void
  setMemoryPanelOpen: (open: boolean) => void
  setFileLibraryOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  theme: 'light',
  searchOpen: false,
  settingsOpen: false,
  filePreviewOpen: false,
  filePreviewId: null,
  memoryPanelOpen: false,
  fileLibraryOpen: false,

  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  openFilePreview: (fileId) => set({ filePreviewOpen: true, filePreviewId: fileId }),
  closeFilePreview: () => set({ filePreviewOpen: false, filePreviewId: null }),
  setMemoryPanelOpen: (open) => set({ memoryPanelOpen: open }),
  setFileLibraryOpen: (open) => set({ fileLibraryOpen: open }),
}))

