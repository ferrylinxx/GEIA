'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AIProvider, ModelConfig, DbConnection, NetworkDrive, Banner } from '@/lib/types'
import ModernAdminLayout from './ModernAdminLayout'
import ModernDashboard from './ModernDashboard'
import ModernSectionWrapper from './ModernSectionWrapper'
import RolesManagement from './RolesManagement'
import ToolsManagement from './ToolsManagement'
import {
  Users, Shield, Wrench, Cpu, Plug, Database, HardDrive, FileText, Megaphone, Sparkles, Zap,
  Plus, Edit3, Trash2, RefreshCw, Loader2, Eye, EyeOff, ArrowUp, ArrowDown, GripVertical,
  Check, X, Save, MessageCircle, Crown, Upload, Search, ToggleLeft, ToggleRight
} from 'lucide-react'

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

interface UserRow {
  id: string
  name: string | null
  email: string
  role: string
  avatar_url: string | null
  created_at: string
  activity_status?: 'online' | 'idle' | 'offline'
  activity_last_seen_at?: string | null
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

const PROVIDER_TYPES = [
  { value: 'openai', label: 'OpenAI', url: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic', url: 'https://api.anthropic.com/v1' },
  { value: 'gemini', label: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta' },
  { value: 'ollama', label: 'Ollama', url: 'http://localhost:11434' },
  { value: 'custom', label: 'Custom', url: '' },
]

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
      
      case 'users':
        return (
          <ModernSectionWrapper
            title="Usuarios"
            subtitle="Gestiona usuarios de la plataforma"
            icon={Users}
            gradient="purple"
          >
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-6">
              <p className="text-center text-slate-500 dark:text-slate-400">
                Sección de usuarios en desarrollo...
              </p>
            </div>
          </ModernSectionWrapper>
        )

      case 'roles':
        return (
          <ModernSectionWrapper
            title="Roles & Permisos"
            subtitle="Gestiona roles de usuario y permisos de acceso"
            icon={Shield}
            gradient="green"
          >
            <RolesManagement />
          </ModernSectionWrapper>
        )

      case 'tools':
        return (
          <ModernSectionWrapper
            title="Herramientas"
            subtitle="Configura permisos de herramientas por rol"
            icon={Wrench}
            gradient="orange"
          >
            <ToolsManagement />
          </ModernSectionWrapper>
        )

      case 'models':
        return (
          <ModernSectionWrapper
            title="Modelos IA"
            subtitle="Configura y gestiona modelos de inteligencia artificial"
            icon={Cpu}
            gradient="pink"
          >
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-6">
              <p className="text-center text-slate-500 dark:text-slate-400">
                Sección de modelos en desarrollo...
              </p>
            </div>
          </ModernSectionWrapper>
        )

      case 'providers':
        return (
          <ModernSectionWrapper
            title="Proveedores IA"
            subtitle="Gestiona proveedores de servicios de inteligencia artificial"
            icon={Plug}
            gradient="indigo"
          >
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-6">
              <p className="text-center text-slate-500 dark:text-slate-400">
                Sección de proveedores en desarrollo...
              </p>
            </div>
          </ModernSectionWrapper>
        )

      case 'connections':
        return (
          <ModernSectionWrapper
            title="Conexiones de Base de Datos"
            subtitle="Administra conexiones a bases de datos externas"
            icon={Database}
            gradient="cyan"
          >
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-6">
              <p className="text-center text-slate-500 dark:text-slate-400">
                Sección de conexiones en desarrollo...
              </p>
            </div>
          </ModernSectionWrapper>
        )

      case 'network-drives':
        return (
          <ModernSectionWrapper
            title="Unidades de Red"
            subtitle="Gestiona unidades de red SFTP y SMB"
            icon={HardDrive}
            gradient="teal"
          >
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-6">
              <p className="text-center text-slate-500 dark:text-slate-400">
                Sección de unidades de red en desarrollo...
              </p>
            </div>
          </ModernSectionWrapper>
        )

      case 'files':
        return (
          <ModernSectionWrapper
            title="Archivos Globales"
            subtitle="Administra archivos y documentos del sistema"
            icon={FileText}
            gradient="yellow"
          >
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-6">
              <p className="text-center text-slate-500 dark:text-slate-400">
                Sección de archivos en desarrollo...
              </p>
            </div>
          </ModernSectionWrapper>
        )

      case 'banners':
        return (
          <ModernSectionWrapper
            title="Banners"
            subtitle="Gestiona anuncios y notificaciones del sistema"
            icon={Megaphone}
            gradient="red"
          >
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-6">
              <p className="text-center text-slate-500 dark:text-slate-400">
                Sección de banners en desarrollo...
              </p>
            </div>
          </ModernSectionWrapper>
        )

      case 'document-analysis':
        return (
          <ModernSectionWrapper
            title="Análisis de Documentos"
            subtitle="Configura el análisis automático de documentos"
            icon={Sparkles}
            gradient="purple"
          >
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-6">
              <p className="text-center text-slate-500 dark:text-slate-400">
                Sección de análisis de documentos en desarrollo...
              </p>
            </div>
          </ModernSectionWrapper>
        )

      case 'agents':
        return (
          <ModernSectionWrapper
            title="Agentes IA"
            subtitle="Administra agentes de inteligencia artificial"
            icon={Zap}
            gradient="blue"
          >
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-6">
              <p className="text-center text-slate-500 dark:text-slate-400">
                Sección de agentes en desarrollo...
              </p>
            </div>
          </ModernSectionWrapper>
        )

      default:
        return (
          <ModernSectionWrapper
            title="Sección en Desarrollo"
            subtitle="Esta sección estará disponible próximamente"
            gradient="blue"
          >
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-12 text-center">
              <p className="text-slate-600 dark:text-slate-400">
                Contenido próximamente...
              </p>
            </div>
          </ModernSectionWrapper>
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

