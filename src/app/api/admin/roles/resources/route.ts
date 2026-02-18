import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const service = createServiceRoleClient()
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return { user, service }
}

// GET: Get all available resources for permission configuration
export async function GET(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { searchParams } = new URL(req.url)
    const resourceType = searchParams.get('type')

    // If no type specified, return all resource types
    if (!resourceType) {
      return NextResponse.json({
        resourceTypes: [
          { value: 'network_drive', label: 'Unidades de Red', icon: 'HardDrive' },
          { value: 'model', label: 'Modelos IA', icon: 'Bot' },
          { value: 'provider', label: 'Proveedores IA', icon: 'Plug' },
          { value: 'db_connection', label: 'Conexiones BD', icon: 'Database' },
          { value: 'user_group', label: 'Grupos de Trabajo', icon: 'Users' },
          { value: 'channel', label: 'Canales', icon: 'Hash' },
          { value: 'project', label: 'Proyectos', icon: 'Folder' },
          { value: 'file', label: 'Archivos Globales', icon: 'FileText' },
          { value: 'agent', label: 'Agentes IA', icon: 'Zap' },
          { value: 'admin_panel', label: 'Panel Admin', icon: 'Shield' },
        ],
      })
    }

    // Return specific resources based on type
    let resources: unknown[] = []

    switch (resourceType) {
      case 'network_drive': {
        const { data } = await auth.service
          .from('network_drives')
          .select('id, name, description')
          .order('name')
        resources = data || []
        break
      }

      case 'model': {
        const { data } = await auth.service
          .from('model_configs')
          .select('id, display_name, description')
          .order('display_name')
        resources = (data || []).map((m: { id: string; display_name: string; description: string }) => ({
          id: m.id,
          name: m.display_name,
          description: m.description,
        }))
        break
      }

      case 'provider': {
        const { data } = await auth.service
          .from('ai_providers')
          .select('id, name, description')
          .order('name')
        resources = data || []
        break
      }

      case 'db_connection': {
        const { data } = await auth.service
          .from('db_connections')
          .select('id, name, description')
          .order('name')
        resources = data || []
        break
      }

      case 'user_group': {
        const { data } = await auth.service
          .from('user_groups')
          .select('id, name, description')
          .order('name')
        resources = data || []
        break
      }

      case 'project': {
        const { data } = await auth.service
          .from('projects')
          .select('id, name, description')
          .order('name')
        resources = data || []
        break
      }

      case 'admin_panel': {
        // Admin panel sections
        resources = [
          { id: 'dashboard', name: 'Dashboard', description: 'Panel principal' },
          { id: 'users', name: 'Usuarios', description: 'Gestión de usuarios' },
          { id: 'models', name: 'Modelos', description: 'Configuración de modelos IA' },
          { id: 'providers', name: 'Proveedores', description: 'Proveedores de IA' },
          { id: 'connections', name: 'Conexiones BD', description: 'Conexiones a bases de datos' },
          { id: 'network-drives', name: 'Unidades de Red', description: 'Gestión de unidades de red' },
          { id: 'files', name: 'Archivos', description: 'Archivos globales' },
          { id: 'document-analysis', name: 'Análisis de Documentos', description: 'Configuración de análisis' },
          { id: 'agents', name: 'Agentes IA', description: 'Gestión de agentes' },
          { id: 'banners', name: 'Banners', description: 'Gestión de banners' },
          { id: 'roles', name: 'Roles', description: 'Gestión de roles y permisos' },
        ]
        break
      }

      default:
        return NextResponse.json({ error: 'Invalid resource type' }, { status: 400 })
    }

    return NextResponse.json({ resources })
  } catch (error) {
    console.error('Error fetching resources:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

