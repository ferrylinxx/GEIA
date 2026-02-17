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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params

  const { data: file, error } = await auth.service
    .from('files')
    .select('id, user_id, storage_path, filename, mime, size, ingest_status, created_at')
    .eq('id', id)
    .single()

  if (error || !file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  const { data: profile } = await auth.service.from('profiles').select('name').eq('id', file.user_id).maybeSingle()

  // Get chunk count
  const { count: chunkCount } = await auth.service
    .from('file_chunks')
    .select('*', { count: 'exact', head: true })
    .eq('file_id', id)

  const { data: signed, error: signError } = await auth.service.storage
    .from('user-files')
    .createSignedUrl(file.storage_path, 3600)

  return NextResponse.json({
    file: {
      ...file,
      size: typeof file.size === 'number' ? file.size : 0,
      user_name: profile?.name || null,
      signed_url: signError ? null : signed?.signedUrl || null,
      chunk_count: chunkCount || 0,
    },
  })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params

  const { data: file } = await auth.service
    .from('files')
    .select('id, storage_path')
    .eq('id', id)
    .maybeSingle()

  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  // Remove chunks first to avoid stale RAG data
  await auth.service.from('file_chunks').delete().eq('file_id', id)

  if (file.storage_path) {
    await auth.service.storage.from('user-files').remove([file.storage_path])
  }

  const { error } = await auth.service.from('files').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
