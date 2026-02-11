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

export async function GET() {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data } = await auth.service
    .from('db_connections')
    .select('*')
    .order('created_at', { ascending: true })

  // Mask passwords in response
  const masked = (data || []).map((c: Record<string, unknown>) => ({
    ...c,
    password: '••••••••',
  }))

  return NextResponse.json({ connections: masked })
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, description, db_type, host, port, database_name, username, password } = body

  if (!name || !host || !username || !password) {
    return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
  }

  const { data, error } = await auth.service
    .from('db_connections')
    .insert({
      name,
      description: description || '',
      db_type: db_type || 'mssql',
      host,
      port: port || 1433,
      database_name: database_name || '',
      username,
      password,
      is_active: true,
      schema_cache: [],
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ connection: { ...data, password: '••••••••' } })
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { id, ...updates } = body

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // If password is masked, don't update it
  if (updates.password === '••••••••') delete updates.password

  updates.updated_at = new Date().toISOString()

  const { data, error } = await auth.service
    .from('db_connections')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ connection: { ...data, password: '••••••••' } })
}

