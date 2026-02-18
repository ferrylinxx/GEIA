'use client'

import { ReactNode, useState } from 'react'
import { 
  LayoutDashboard, Users, Shield, Wrench, Cpu, Plug, Database, 
  HardDrive, FileText, Megaphone, Settings, ChevronLeft, ChevronRight,
  Search, Bell, User, LogOut, Menu, X
} from 'lucide-react'
import { useRouter } from 'next/navigation'

type AdminTab = 'dashboard' | 'users' | 'roles' | 'tools' | 'models' | 'providers' | 'connections' | 'network-drives' | 'files' | 'banners' | 'document-analysis' | 'agents'

interface ModernAdminLayoutProps {
  children: ReactNode
  activeTab: AdminTab
  onTabChange: (tab: AdminTab) => void
  userName?: string
  userEmail?: string
  userAvatar?: string
}

const navigationItems = [
  { id: 'dashboard' as AdminTab, label: 'Dashboard', icon: LayoutDashboard, color: 'text-blue-500' },
  { id: 'users' as AdminTab, label: 'Usuarios', icon: Users, color: 'text-purple-500' },
  { id: 'roles' as AdminTab, label: 'Roles & Permisos', icon: Shield, color: 'text-green-500' },
  { id: 'tools' as AdminTab, label: 'Herramientas', icon: Wrench, color: 'text-orange-500' },
  { id: 'models' as AdminTab, label: 'Modelos IA', icon: Cpu, color: 'text-pink-500' },
  { id: 'providers' as AdminTab, label: 'Proveedores', icon: Plug, color: 'text-indigo-500' },
  { id: 'connections' as AdminTab, label: 'Conexiones DB', icon: Database, color: 'text-cyan-500' },
  { id: 'network-drives' as AdminTab, label: 'Unidades de Red', icon: HardDrive, color: 'text-teal-500' },
  { id: 'files' as AdminTab, label: 'Archivos', icon: FileText, color: 'text-yellow-500' },
  { id: 'banners' as AdminTab, label: 'Banners', icon: Megaphone, color: 'text-red-500' },
]

export default function ModernAdminLayout({ 
  children, 
  activeTab, 
  onTabChange,
  userName = 'Admin',
  userEmail = 'admin@geia.com',
  userAvatar
}: ModernAdminLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              GEIA Admin
            </h1>
          </div>
          <button className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-screen bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-r border-slate-200 dark:border-slate-800
        transition-all duration-300 z-40
        ${sidebarCollapsed ? 'w-20' : 'w-72'}
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
            {!sidebarCollapsed && (
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                GEIA Admin
              </h1>
            )}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="hidden lg:block p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              {sidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {navigationItems.map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.id
              
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onTabChange(item.id)
                    setMobileMenuOpen(false)
                  }}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                    ${isActive 
                      ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/30' 
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }
                    ${sidebarCollapsed ? 'justify-center' : ''}
                  `}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-white' : item.color}`} />
                  {!sidebarCollapsed && (
                    <span className="font-medium">{item.label}</span>
                  )}
                  {!sidebarCollapsed && isActive && (
                    <div className="ml-auto w-2 h-2 bg-white rounded-full"></div>
                  )}
                </button>
              )
            })}
          </nav>

          {/* User Profile */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800">
            <div className={`flex items-center gap-3 p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer ${sidebarCollapsed ? 'justify-center' : ''}`}>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white font-semibold">
                {userAvatar ? <img src={userAvatar} alt={userName} className="w-full h-full rounded-full" /> : userName.charAt(0)}
              </div>
              {!sidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{userName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{userEmail}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`
        transition-all duration-300 pt-16 lg:pt-0
        ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-72'}
      `}>
        {children}
      </main>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-30"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </div>
  )
}

