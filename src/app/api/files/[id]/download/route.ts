import { NextRequest } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { requireProjectRole } from '@/lib/project-access'

export const runtime = 'nodejs'
export const maxDuration = 60

function buildContentDisposition(filename: string, inline: boolean): string {
  const safeName = filename.replace(/[\r\n"]/g, '_').trim() || 'archivo'
  const encoded = encodeURIComponent(safeName)
  return `${inline ? 'inline' : 'attachment'}; filename="${safeName}"; filename*=UTF-8''${encoded}`
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id } = await context.params
  if (!id) return new Response('Missing file id', { status: 400 })

  const service = createServiceRoleClient()
  const { data: file } = await service
    .from('files')
    .select('id, user_id, project_id, filename, mime, storage_path')
    .eq('id', id)
    .single()

  if (!file) return new Response('Not found', { status: 404 })
  if (file.user_id !== user.id) {
    if (!file.project_id) return new Response('Not found', { status: 404 })
    const { ok } = await requireProjectRole(service, file.project_id, user.id, 'viewer')
    if (!ok) return new Response('Not found', { status: 404 })
  }

  const { data: blob, error } = await service.storage.from('user-files').download(file.storage_path)
  if (error || !blob) {
    return new Response(error?.message || 'Download failed', { status: 500 })
  }

  const inline = req.nextUrl.searchParams.get('inline') === '1'
  const mime = file.mime || 'application/octet-stream'
  const body = await blob.arrayBuffer()

  return new Response(body, {
    headers: {
      'Content-Type': mime,
      'Content-Disposition': buildContentDisposition(file.filename || 'archivo', inline),
      'Cache-Control': 'private, max-age=60',
    },
  })
}
