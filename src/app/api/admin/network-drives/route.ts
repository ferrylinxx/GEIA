import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const service = createServiceRoleClient()
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return user
}

export async function GET() {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const service = createServiceRoleClient()
  const { data } = await service.from('network_drives').select('*').order('created_at')
  return NextResponse.json({ drives: data || [] })
}

export async function POST(req: NextRequest) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { name, unc_path, description, file_extensions, max_file_size_mb, connection_type, sftp_host, sftp_port, sftp_username, sftp_password } = body
  if (!name || !unc_path) return NextResponse.json({ error: 'Nombre y ruta son obligatorios' }, { status: 400 })
  const service = createServiceRoleClient()
  const insertData: Record<string, unknown> = { name, unc_path, description: description || '' }
  if (file_extensions) insertData.file_extensions = file_extensions
  if (max_file_size_mb) insertData.max_file_size_mb = max_file_size_mb
  if (connection_type) insertData.connection_type = connection_type
  if (sftp_host) insertData.sftp_host = sftp_host
  if (sftp_port) insertData.sftp_port = sftp_port
  if (sftp_username) insertData.sftp_username = sftp_username
  if (sftp_password) insertData.sftp_password = sftp_password
  const { data, error } = await service.from('network_drives').insert(insertData).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ drive: data })
}

export async function PATCH(req: NextRequest) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  const service = createServiceRoleClient()
  updates.updated_at = new Date().toISOString()
  const { data, error } = await service.from('network_drives').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ drive: data })
}

