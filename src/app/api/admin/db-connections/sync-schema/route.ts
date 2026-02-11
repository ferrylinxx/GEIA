import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import sql from 'mssql'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const service = createServiceRoleClient()
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return { user, service }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { connection_id } = await req.json()
  if (!connection_id) return NextResponse.json({ error: 'Missing connection_id' }, { status: 400 })

  // Get connection details
  const { data: conn } = await auth.service
    .from('db_connections')
    .select('*')
    .eq('id', connection_id)
    .single()

  if (!conn) return NextResponse.json({ error: 'Conexión no encontrada' }, { status: 404 })

  try {
    const pool = await sql.connect({
      server: conn.host,
      port: conn.port || 1433,
      database: conn.database_name || undefined,
      user: conn.username,
      password: conn.password,
      options: { encrypt: false, trustServerCertificate: true },
      connectionTimeout: 10000,
      requestTimeout: 15000,
    })

    // Get all tables and their columns
    const result = await pool.request().query(`
      SELECT 
        t.TABLE_SCHEMA as schema_name,
        t.TABLE_NAME as table_name,
        c.COLUMN_NAME as column_name,
        c.DATA_TYPE as data_type,
        c.IS_NULLABLE as is_nullable
      FROM INFORMATION_SCHEMA.TABLES t
      JOIN INFORMATION_SCHEMA.COLUMNS c 
        ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
      WHERE t.TABLE_TYPE = 'BASE TABLE'
      ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME, c.ORDINAL_POSITION
    `)

    await pool.close()

    // Group by table
    const tableMap = new Map<string, { table_name: string; schema_name: string; columns: { name: string; type: string; nullable: boolean }[] }>()
    for (const row of result.recordset) {
      const key = `${row.schema_name}.${row.table_name}`
      if (!tableMap.has(key)) {
        tableMap.set(key, { table_name: row.table_name, schema_name: row.schema_name, columns: [] })
      }
      tableMap.get(key)!.columns.push({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
      })
    }

    const schema = Array.from(tableMap.values())

    // Save schema cache
    await auth.service
      .from('db_connections')
      .update({ schema_cache: schema, last_synced_at: new Date().toISOString() })
      .eq('id', connection_id)

    return NextResponse.json({ schema, table_count: schema.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return NextResponse.json({ error: `Error conectando a la BD: ${msg}` }, { status: 500 })
  }
}

