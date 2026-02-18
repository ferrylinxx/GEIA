import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const service = createServiceRoleClient()

    // Get user's role
    const { data: profile } = await service
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const userRole = profile?.role || 'user'

    // Admin can use all tools
    if (userRole === 'admin') {
      return NextResponse.json({
        tools: {
          webSearch: true,
          dbQuery: true,
          networkDriveRag: true,
          imageGeneration: true,
          deepResearch: true,
          documentGeneration: true,
          spreadsheetAnalysis: true,
          codeInterpreter: true,
        }
      })
    }

    // Get user's role ID (case-insensitive comparison)
    const { data: roleData } = await service
      .from('roles')
      .select('id, name')
      .ilike('name', userRole)
      .single()

    if (!roleData) {
      // If role not found, deny all tools
      return NextResponse.json({
        tools: {
          webSearch: false,
          dbQuery: false,
          networkDriveRag: false,
          imageGeneration: false,
          deepResearch: false,
          documentGeneration: false,
          spreadsheetAnalysis: false,
          codeInterpreter: false,
        }
      })
    }

    // Check if ANY tool permissions exist for ANY role
    const { data: anyPermissions } = await service
      .from('role_permissions')
      .select('id')
      .eq('resource_type', 'tool')
      .limit(1)

    // If no tool permissions configured, deny all tools for non-admins
    // This ensures that permissions must be explicitly configured
    if (!anyPermissions || anyPermissions.length === 0) {
      // Only admins see tools when no permissions are configured
      return NextResponse.json({
        tools: {
          webSearch: false,
          dbQuery: false,
          networkDriveRag: false,
          imageGeneration: false,
          deepResearch: false,
          documentGeneration: false,
          spreadsheetAnalysis: false,
          codeInterpreter: false,
        }
      })
    }

    // Get permissions for this specific role
    const { data: permissions } = await service
      .from('role_permissions')
      .select('meta_json')
      .eq('role_id', roleData.id)
      .eq('resource_type', 'tool')
      .eq('can_view', true)

    // If permissions exist but this role has none, deny all tools
    if (!permissions || permissions.length === 0) {
      return NextResponse.json({
        tools: {
          webSearch: false,
          dbQuery: false,
          networkDriveRag: false,
          imageGeneration: false,
          deepResearch: false,
          documentGeneration: false,
          spreadsheetAnalysis: false,
          codeInterpreter: false,
        }
      })
    }

    // Build allowed tools map from meta_json
    const allowedTools = new Set(
      permissions
        .map(p => (p.meta_json as { tool_id?: string })?.tool_id)
        .filter(Boolean)
    )

    return NextResponse.json({
      tools: {
        webSearch: allowedTools.has('web_search'),
        dbQuery: allowedTools.has('db_query'),
        networkDriveRag: allowedTools.has('network_drive_rag'),
        imageGeneration: allowedTools.has('image_generation'),
        deepResearch: allowedTools.has('deep_research'),
        documentGeneration: allowedTools.has('document_generation'),
        spreadsheetAnalysis: allowedTools.has('spreadsheet_analysis'),
        codeInterpreter: allowedTools.has('code_interpreter'),
      }
    })
  } catch (error) {
    console.error('Error fetching tool permissions:', error)
    // On error, deny all tools for security
    return NextResponse.json({
      tools: {
        webSearch: false,
        dbQuery: false,
        networkDriveRag: false,
        imageGeneration: false,
        deepResearch: false,
        documentGeneration: false,
        spreadsheetAnalysis: false,
        codeInterpreter: false,
      }
    })
  }
}

