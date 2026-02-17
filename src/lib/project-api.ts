import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { ProjectRole, requireProjectRole } from '@/lib/project-access'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function getProjectApiContext() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return { user, service: createServiceRoleClient() }
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function ensureProjectRole(
  service: SupabaseClient,
  projectId: string,
  userId: string,
  minRole: ProjectRole
) {
  const result = await requireProjectRole(service, projectId, userId, minRole)
  return result
}
