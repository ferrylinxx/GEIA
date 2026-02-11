import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import sql from 'mssql'

// Validate SQL is read-only
function validateSQL(query: string): { valid: boolean; reason?: string } {
  const upper = query.toUpperCase().trim()
  const forbidden = ['INSERT ', 'UPDATE ', 'DELETE ', 'DROP ', 'ALTER ', 'CREATE ', 'TRUNCATE ', 'EXEC ', 'EXECUTE ', 'GRANT ', 'REVOKE ', 'MERGE ', 'BULK ', 'OPENROWSET', 'OPENDATASOURCE', 'XP_', 'SP_']
  for (const kw of forbidden) {
    if (upper.includes(kw)) return { valid: false, reason: `Operación no permitida: ${kw.trim()}` }
  }
  if (!upper.startsWith('SELECT')) return { valid: false, reason: 'Solo se permiten consultas SELECT' }
  return { valid: true }
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceRoleClient()
  const { connection_id, question, conversation_id } = await req.json()

  if (!connection_id || !question) {
    return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
  }

  // Get connection
  const { data: conn } = await service
    .from('db_connections')
    .select('*')
    .eq('id', connection_id)
    .eq('is_active', true)
    .single()

  if (!conn) return NextResponse.json({ error: 'Conexión no encontrada o inactiva' }, { status: 404 })

  // Build schema context for the AI
  const schemaContext = (conn.schema_cache || []).map((t: { schema_name: string; table_name: string; columns: { name: string; type: string; nullable: boolean }[] }) =>
    `Tabla: [${t.schema_name}].[${t.table_name}]\nColumnas: ${t.columns.map(c => `${c.name} (${c.type}${c.nullable ? ', nullable' : ''})`).join(', ')}`
  ).join('\n\n')

  if (!schemaContext) {
    return NextResponse.json({ error: 'No hay esquema sincronizado. Sincroniza el esquema desde Admin.' }, { status: 400 })
  }

  const startTime = Date.now()

  try {
    // Ask AI to generate SQL
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Eres un experto en SQL Server. Genera SOLO la consulta SQL para responder la pregunta del usuario. 
REGLAS:
- Solo SELECT, nunca INSERT/UPDATE/DELETE/DROP
- Usa TOP 100 para limitar resultados
- Usa los nombres exactos de tablas y columnas del esquema
- Responde SOLO con el SQL, sin explicaciones ni markdown
- Si no puedes generar una consulta válida, responde exactamente: ERROR: seguido de la razón

ESQUEMA DE LA BASE DE DATOS:
${schemaContext}`
          },
          { role: 'user', content: question }
        ],
        temperature: 0,
        max_tokens: 1000,
      }),
    })

    const aiData = await aiRes.json()
    let generatedSQL = aiData.choices?.[0]?.message?.content?.trim() || ''

    // Clean markdown if AI wraps it
    generatedSQL = generatedSQL.replace(/```sql\n?/gi, '').replace(/```\n?/g, '').trim()

    if (generatedSQL.startsWith('ERROR:')) {
      return NextResponse.json({ error: generatedSQL, sql: null, results: null })
    }

    // Validate SQL
    const validation = validateSQL(generatedSQL)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.reason, sql: generatedSQL, results: null })
    }

    // Execute query
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

    const result = await pool.request().query(generatedSQL)
    await pool.close()

    const executionTime = Date.now() - startTime
    const rows = result.recordset || []

    // Log the query
    await service.from('db_query_logs').insert({
      connection_id: conn.id,
      user_id: user.id,
      user_question: question,
      generated_sql: generatedSQL,
      row_count: rows.length,
      success: true,
      execution_time_ms: executionTime,
    })

    return NextResponse.json({
      sql: generatedSQL,
      results: rows.slice(0, 100),
      row_count: rows.length,
      execution_time_ms: executionTime,
      connection_name: conn.name,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    const executionTime = Date.now() - startTime

    // Log the error
    await service.from('db_query_logs').insert({
      connection_id: conn.id, user_id: user.id, user_question: question,
      generated_sql: '', row_count: 0, success: false,
      error_message: msg, execution_time_ms: executionTime,
    }).catch(() => {})

    return NextResponse.json({ error: msg, sql: null, results: null }, { status: 500 })
  }
}

