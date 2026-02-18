'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import ModernAdminLayout from './ModernAdminLayout'
import ModernDashboard from './ModernDashboard'
import RolesManagement from './RolesManagement'
import ToolsManagement from './ToolsManagement'

type AdminTab = 'dashboard' | 'users' | 'roles' | 'tools' | 'models' | 'providers' | 'connections' | 'network-drives' | 'files' | 'banners' | 'document-analysis' | 'agents'

interface Props {
  stats: { users: number; conversations: number; messages: number; files: number; chunks: number }
  currentUserId: string
}

interface UserProfile {
  id: string
  name: string | null
  email: string
  avatar_url: string | null
  role: string
}

export default function ModernAdminPageClient({ stats, currentUserId }: Props) {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard')
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadUserProfile()
  }, [currentUserId])

  async function loadUserProfile() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, avatar_url, role')
        .eq('id', currentUserId)
        .single()

      if (error) throw error
      setUserProfile(data)
    } catch (error) {
      console.error('Error loading user profile:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-600 dark:text-slate-400">Cargando panel de administración...</p>
        </div>
      </div>
    )
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <ModernDashboard stats={stats} />
      
      case 'roles':
        return (
          <div className="p-8">
            <div className="max-w-7xl mx-auto">
              <div className="mb-8">
                <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-green-900 to-emerald-900 dark:from-white dark:via-green-100 dark:to-emerald-100 bg-clip-text text-transparent">
                  Roles & Permisos
                </h1>
                <p className="text-slate-600 dark:text-slate-400 mt-2">
                  Gestiona roles de usuario y permisos de acceso
                </p>
              </div>
              <RolesManagement />
            </div>
          </div>
        )
      
      case 'tools':
        return (
          <div className="p-8">
            <div className="max-w-7xl mx-auto">
              <div className="mb-8">
                <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-orange-900 to-amber-900 dark:from-white dark:via-orange-100 dark:to-amber-100 bg-clip-text text-transparent">
                  Herramientas
                </h1>
                <p className="text-slate-600 dark:text-slate-400 mt-2">
                  Configura permisos de herramientas por rol
                </p>
              </div>
              <ToolsManagement />
            </div>
          </div>
        )
      
      case 'users':
        return (
          <div className="p-8">
            <div className="max-w-7xl mx-auto">
              <div className="mb-8">
                <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-purple-900 to-pink-900 dark:from-white dark:via-purple-100 dark:to-pink-100 bg-clip-text text-transparent">
                  Usuarios
                </h1>
                <p className="text-slate-600 dark:text-slate-400 mt-2">
                  Gestiona usuarios de la plataforma
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-6">
                <p className="text-center text-slate-500 dark:text-slate-400">
                  Sección de usuarios en desarrollo...
                </p>
              </div>
            </div>
          </div>
        )
      
      default:
        return (
          <div className="p-8">
            <div className="max-w-7xl mx-auto">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-12 text-center">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                  Sección en Desarrollo
                </h2>
                <p className="text-slate-600 dark:text-slate-400">
                  Esta sección estará disponible próximamente
                </p>
              </div>
            </div>
          </div>
        )
    }
  }

  return (
    <ModernAdminLayout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      userName={userProfile?.name || 'Admin'}
      userEmail={userProfile?.email || 'admin@geia.com'}
      userAvatar={userProfile?.avatar_url || undefined}
    >
      {renderContent()}
    </ModernAdminLayout>
  )
}

