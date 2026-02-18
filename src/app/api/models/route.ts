import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

// Cache models for 5 minutes
let cachedModels: { id: string; name: string; owned_by: string }[] | null = null
let cacheTime = 0
const CACHE_DURATION = 5 * 60 * 1000

// Friendly names for known models
const FRIENDLY_NAMES: Record<string, string> = {
  'gpt-5.3-codex': 'GPT-5.3 Codex',
  'gpt-5.2': 'GPT-5.2',
  'gpt-5.2-codex': 'GPT-5.2 Codex',
  'gpt-5.1': 'GPT-5.1',
  'gpt-5': 'GPT-5',
  'gpt-5-mini': 'GPT-5 Mini',
  'gpt-5-turbo': 'GPT-5 Turbo',
  'gpt-4.5-preview': 'GPT-4.5 Preview',
  'gpt-4.5': 'GPT-4.5',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-4-turbo': 'GPT-4 Turbo',
  'gpt-4-turbo-preview': 'GPT-4 Turbo Preview',
  'gpt-4': 'GPT-4',
  'gpt-3.5-turbo': 'GPT-3.5 Turbo',
  'o1': 'o1',
  'o1-mini': 'o1 Mini',
  'o1-preview': 'o1 Preview',
  'o3': 'o3',
  'o3-mini': 'o3 Mini',
  'o3-pro': 'o3 Pro',
  'o4-mini': 'o4 Mini',
  'gpt-4.1': 'GPT-4.1',
  'gpt-4.1-mini': 'GPT-4.1 Mini',
  'gpt-4.1-nano': 'GPT-4.1 Nano',
  'gpt-4o-2024-11-20': 'GPT-4o (Nov 2024)',
  'gpt-4o-2024-08-06': 'GPT-4o (Aug 2024)',
  'gpt-4o-mini-2024-07-18': 'GPT-4o Mini (Jul 2024)',
}

// Models we care about (chat-capable) - include gpt-5+ for future models
const CHAT_MODEL_PREFIXES = ['gpt-5', 'gpt-4.5', 'gpt-4', 'gpt-3.5', 'o1', 'o3', 'o4']

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check if admin has configured models in DB (always takes priority)
  try {
    const service = createServiceRoleClient()

    // Get user's role
    const { data: profile } = await service
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const userRole = profile?.role || 'user'

    // Get user's role ID (case-insensitive comparison)
    const { data: roleData } = await service
      .from('roles')
      .select('id, name')
      .ilike('name', userRole)
      .single()

    const { data: dbModels } = await service
      .from('model_configs')
      .select('id, model_id, display_name, icon_url, description, is_visible, sort_order, ai_providers(name, type)')
      .eq('is_visible', true)
      .order('sort_order', { ascending: true })

    if (dbModels && dbModels.length > 0) {
      // Filter models based on permissions
      let filteredModels = dbModels

      if (userRole !== 'admin' && roleData) {
        // Get permissions for this role
        const { data: permissions } = await service
          .from('role_permissions')
          .select('resource_id')
          .eq('role_id', roleData.id)
          .eq('resource_type', 'model')
          .eq('can_view', true)

        // Check if ANY permissions exist for ANY role for models
        const { data: anyPermissions } = await service
          .from('role_permissions')
          .select('id')
          .eq('resource_type', 'model')
          .limit(1)

        if (anyPermissions && anyPermissions.length > 0) {
          // Permissions system is active - only show models this role has access to
          if (permissions && permissions.length > 0) {
            const allowedModelIds = permissions.map((p: { resource_id: string | null }) => p.resource_id).filter(Boolean)
            filteredModels = dbModels.filter((m: Record<string, unknown>) =>
              allowedModelIds.includes(m.id as string)
            )
          } else {
            // This role has no permissions configured, show nothing
            filteredModels = []
          }
        }
        // If no permissions exist at all, show all models (default behavior before permissions are configured)
      }

      const adminModels = filteredModels.map((m: Record<string, unknown>) => {
        const provider = m.ai_providers as { name: string; type: string } | null
        return {
          id: m.model_id as string,
          name: m.display_name as string,
          owned_by: provider?.name || provider?.type || 'openai',
          icon_url: (m.icon_url as string) || '',
          description: (m.description as string) || '',
        }
      })
      return NextResponse.json({ models: adminModels })
    }

    // If no models in DB, return empty array instead of falling through to OpenAI API
    // This prevents bypassing permission checks
    return NextResponse.json({ models: [] })
  } catch (error) {
    console.error('Error fetching models from DB:', error)
    // Return empty array on error instead of falling through to OpenAI API
    // This prevents bypassing permission checks
    return NextResponse.json({ models: [] })
  }
}

