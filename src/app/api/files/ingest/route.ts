import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { requireProjectRole } from '@/lib/project-access'
import { ingestFileForRag } from '@/lib/project-file-ingest'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { file_id } = await req.json()
  if (!file_id) return NextResponse.json({ error: 'file_id required' }, { status: 400 })

  const serviceClient = createServiceRoleClient()

  // Get file record
  const { data: file } = await serviceClient.from('files').select('*').eq('id', file_id).single()
  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  // Owner can ingest always. Project editors/admin/owner can also ingest project files.
  if (file.user_id !== user.id) {
    if (!file.project_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { ok } = await requireProjectRole(serviceClient, file.project_id, user.id, 'editor')
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const result = await ingestFileForRag(serviceClient, file)
    return NextResponse.json({ success: true, ...result })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await serviceClient.from('files').update({ ingest_status: 'failed', ingest_error: msg }).eq('id', file_id)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
