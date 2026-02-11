import { NextRequest } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { searchWeb, enrichSearchResults, WebSearchResult, lastSearchAnswer } from '@/lib/web-search'
import sql from 'mssql'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const { conversation_id, input, model = 'gpt-4o-mini', rag_mode = 'off', cite_mode = false, web_search = false, db_query = false, network_drive_rag = false, image_generation = false, attachments = [], regenerate_message_id, skip_user_save = false } = body

  if (!conversation_id || (!input && !regenerate_message_id)) {
    return new Response('Missing fields', { status: 400 })
  }

  const serviceClient = createServiceRoleClient()

  // Save user message (if not regeneration and not editing)
  if (input && !regenerate_message_id && !skip_user_save) {
    await serviceClient.from('messages').insert({
      conversation_id, user_id: user.id, role: 'user', content: input,
      attachments_json: attachments.map((id: string) => ({ file_id: id })),
    })
  }

  // Load conversation history
  const { data: allMessages } = await serviceClient.from('messages').select('role, content')
    .eq('conversation_id', conversation_id).order('created_at').limit(60)

  // ── Sistema de contexto conversacional ──
  // Si hay muchos mensajes, resumir los antiguos para mantener contexto sin gastar tokens
  let conversationSummary = ''
  let recentMessages = allMessages || []
  if (allMessages && allMessages.length > 16) {
    const oldMessages = allMessages.slice(0, -10)
    recentMessages = allMessages.slice(-10)
    try {
      console.log('[Context] Summarizing', oldMessages.length, 'old messages...')
      const summaryRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini', max_tokens: 400, temperature: 0.2,
          messages: [
            { role: 'system', content: 'Resume brevemente los puntos clave de esta conversación entre un usuario y un asistente de IA. Enfócate en: temas discutidos, decisiones tomadas, información importante compartida, preferencias del usuario, y contexto relevante para continuar la conversación. Sé conciso pero completo. Responde en español.' },
            { role: 'user', content: oldMessages.map((m: { role: string; content: string }) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content.substring(0, 300)}`).join('\n\n') },
          ],
        }),
      })
      const summaryData = await summaryRes.json()
      conversationSummary = summaryData.choices?.[0]?.message?.content?.trim() || ''
      console.log('[Context] Summary generated:', conversationSummary.substring(0, 100) + '...')
    } catch (e) { console.error('[Context] Summary error:', e) }
  }
  const messages = recentMessages

  // Load profile for custom instructions
  const { data: profile } = await serviceClient.from('profiles').select('*').eq('id', user.id).single()

  // Load user memories
  const { data: userMemories } = await serviceClient.from('memories').select('content')
    .eq('user_id', user.id).eq('scope', 'user').eq('enabled', true)

  // Build system prompt
  let systemPrompt = 'Eres GIA (Gestión Inteligente con IA), un asistente de IA empresarial. Responde siempre en español salvo que el usuario pida otro idioma. Sé directo, conciso y útil. Cuando tengas datos concretos de búsquedas web, documentos o bases de datos, úsalos directamente para responder — nunca digas que no puedes acceder a información en tiempo real si se te proporcionan resultados de búsqueda.'

  // Add conversation context summary
  if (conversationSummary) {
    systemPrompt += `\n\n[CONTEXTO DE LA CONVERSACIÓN]\nResumen de lo discutido anteriormente en esta conversación:\n${conversationSummary}\n\nTen en cuenta este contexto al responder. Mantén coherencia con lo ya discutido.`
  }

  if (profile?.custom_instructions_enabled) {
    if (profile.custom_instructions_what) systemPrompt += `Sobre el usuario: ${profile.custom_instructions_what}`
    if (profile.custom_instructions_how) systemPrompt += `${systemPrompt ? '\n\n' : ''}Cómo responder: ${profile.custom_instructions_how}`
  }

  if (userMemories && userMemories.length > 0) {
    systemPrompt += '\n\nRecuerdos del usuario:\n' + userMemories.map((m: { content: string }) => `- ${m.content}`).join('\n')
  }

  // ── Mejora 5: Embedding compartido entre RAG y Network RAG ──
  let sharedEmbedding: number[] | null = null
  const needsEmbedding = (rag_mode !== 'off' || network_drive_rag) && input

  // ── Mejora 6: HyDE - Expandir query con LLM antes de buscar ──
  let searchQuery = input
  if (network_drive_rag && input) {
    try {
      console.log('[HyDE] Expanding query...')
      const hydeRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini', max_tokens: 200, temperature: 0.3,
          messages: [
            { role: 'system', content: 'Eres un asistente que expande preguntas del usuario en un párrafo descriptivo hipotético que podría encontrarse en un documento de empresa. Escribe como si fuera un fragmento real de un documento que responde la pregunta. Solo genera el párrafo, sin explicaciones.' },
            { role: 'user', content: input },
          ],
        }),
      })
      const hydeData = await hydeRes.json()
      const expanded = hydeData.choices?.[0]?.message?.content?.trim()
      if (expanded) {
        searchQuery = expanded
        console.log('[HyDE] Expanded to:', expanded.substring(0, 100) + '...')
      }
    } catch (e) { console.error('[HyDE] Error:', e) }
  }

  if (needsEmbedding) {
    try {
      const embRes = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: searchQuery, model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small' }),
      })
      const embData = await embRes.json()
      sharedEmbedding = embData.data?.[0]?.embedding || null
      console.log('[Embedding] Generated shared embedding, dims:', sharedEmbedding?.length)
    } catch (e) { console.error('[Embedding] Error:', e) }
  }

  // RAG context (archivos del proyecto)
  let ragSources: Array<{ chunk_id: string; file_id: string; filename: string; page?: number; chunk_index: number; snippet: string; similarity: number }> = []
  if (rag_mode !== 'off' && input && sharedEmbedding) {
    const { data: conv } = await serviceClient.from('conversations').select('project_id').eq('id', conversation_id).single()
    if (conv?.project_id) {
      try {
        const { data: chunks } = await serviceClient.rpc('match_file_chunks', {
          p_project_id: conv.project_id,
          p_query_embedding: sharedEmbedding,
          p_match_count: 8,
          p_similarity_threshold: 0.7,
        })

        if (chunks && chunks.length > 0) {
          const fileIds = [...new Set(chunks.map((c: { file_id: string }) => c.file_id))]
          const { data: files } = await serviceClient.from('files').select('id, filename').in('id', fileIds)
          const fileMap = new Map(files?.map((f: { id: string; filename: string }) => [f.id, f.filename]) || [])

          ragSources = chunks.map((c: { id: string; file_id: string; page: number; chunk_index: number; content: string; similarity: number }) => ({
            chunk_id: c.id, file_id: c.file_id,
            filename: fileMap.get(c.file_id) || 'unknown',
            page: c.page, chunk_index: c.chunk_index,
            snippet: c.content.substring(0, 200), similarity: c.similarity,
          }))

          const ragContext = chunks.map((c: { content: string; file_id: string; page: number | null }, i: number) =>
            `[Fuente ${i + 1}: ${fileMap.get(c.file_id) || 'archivo'}${c.page ? ` p.${c.page}` : ''}]\n${c.content}`
          ).join('\n\n')

          if (rag_mode === 'strict') {
            systemPrompt += `\n\nIMPORTANTE: Responde SOLAMENTE usando la información de las siguientes fuentes. Si no hay información suficiente, di "No tengo suficiente información en tus archivos para responder esta pregunta."\n\nFuentes:\n${ragContext}`
          } else {
            systemPrompt += `\n\nPuedes usar estas fuentes de conocimiento del proyecto del usuario cuando sean relevantes:\n${ragContext}`
          }
          if (cite_mode) {
            systemPrompt += '\n\nCita las fuentes que uses en tu respuesta indicando [Fuente N].'
          }
        } else if (rag_mode === 'strict') {
          systemPrompt += '\n\nNo se encontraron fuentes relevantes. Informa al usuario que no tienes información suficiente en sus archivos.'
        }
      } catch (e) {
        console.error('RAG error:', e)
      }
    }
  }

  // ── Mejora 4: Búsqueda híbrida (Vector + Keyword) en Network Drive RAG ──
  console.log('[Chat] network_drive_rag:', network_drive_rag, 'input:', !!input)
  if (network_drive_rag && input && sharedEmbedding) {
    try {
      // Búsqueda híbrida: vector + keywords
      const { data: netChunks, error: rpcError } = await serviceClient.rpc('match_network_chunks', {
        p_query_embedding: JSON.stringify(sharedEmbedding),
        p_match_count: 12,
        p_similarity_threshold: 0.25,
        p_keyword_query: input,  // Keywords originales del usuario (no HyDE)
      })

      console.log('[NetworkRAG] Hybrid search result:', netChunks?.length || 0, 'chunks, error:', rpcError?.message || 'none')

      if (netChunks && netChunks.length > 0) {
        // ── Mejora 7: Re-ranking con LLM ──
        let rankedChunks = netChunks
        if (netChunks.length > 3) {
          try {
            console.log('[Rerank] Scoring', netChunks.length, 'chunks...')
            const chunkSummaries = netChunks.map((c: { content: string; filename: string; combined_score: number }, i: number) =>
              `[${i}] (archivo: ${c.filename}, score: ${c.combined_score?.toFixed(3)})\n${c.content.substring(0, 300)}`
            ).join('\n\n')

            const rerankRes = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: 'gpt-4o-mini', max_tokens: 200, temperature: 0,
                messages: [
                  { role: 'system', content: `Eres un evaluador de relevancia. El usuario preguntó: "${input}"\nPuntúa cada fragmento del 0 al 10 según su relevancia para responder la pregunta.\nResponde SOLO con un JSON array de objetos: [{"idx": 0, "score": 8}, {"idx": 1, "score": 3}, ...]\nNo añadas explicaciones.` },
                  { role: 'user', content: chunkSummaries },
                ],
              }),
            })
            const rerankData = await rerankRes.json()
            let scoresRaw = rerankData.choices?.[0]?.message?.content?.trim() || '[]'
            // Strip markdown code fences if present (e.g. ```json ... ```)
            scoresRaw = scoresRaw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
            const scores: { idx: number; score: number }[] = JSON.parse(scoresRaw)

            if (scores.length > 0) {
              // Filtrar chunks con score >= 4 y reordenar por score LLM
              const filtered = scores
                .filter(s => s.score >= 4)
                .sort((a, b) => b.score - a.score)
                .slice(0, 8)
                .map(s => netChunks[s.idx])
                .filter(Boolean)

              if (filtered.length > 0) {
                rankedChunks = filtered
                console.log('[Rerank] Kept', filtered.length, 'of', netChunks.length, 'chunks')
              }
            }
          } catch (e) { console.error('[Rerank] Error (using original order):', e) }
        }

        const netContext = rankedChunks.map((c: { content: string; filename: string; file_path: string; similarity: number; combined_score: number }, i: number) =>
          `[Red ${i + 1}: ${c.filename} (${c.file_path}) - score: ${(c.combined_score || c.similarity)?.toFixed(3)}]\n${c.content}`
        ).join('\n\n')

        systemPrompt += `\n\nDocumentos encontrados en las unidades de red de la empresa:\n${netContext}\n\nUsa esta información de los documentos de red para responder. Cita las fuentes indicando el nombre del archivo cuando sea relevante.`
        console.log('[NetworkRAG] Added', rankedChunks.length, 'chunks to context')
      }
    } catch (e) {
      console.error('[NetworkRAG] Error:', e)
    }
  }

  // Web search context (Tavily advanced with raw_content + fallback enrichment)
  let webSources: WebSearchResult[] = []
  if (web_search && input) {
    try {
      console.log('[WebSearch] Searching for:', input)
      const rawResults = await searchWeb(input, 6)
      console.log('[WebSearch] Found', rawResults.length, 'results,', rawResults.filter(s => s.pageContent).length, 'with raw_content')

      if (rawResults.length > 0) {
        // If Tavily provided raw_content, no need for manual enrichment
        const hasRawContent = rawResults.some(s => s.pageContent)
        if (hasRawContent) {
          webSources = rawResults
        } else {
          // Fallback: manually fetch page content (DuckDuckGo results)
          webSources = await enrichSearchResults(rawResults, 3)
          console.log('[WebSearch] Enriched', webSources.filter(s => s.pageContent).length, 'pages with content')
        }

        // Build context with Tavily answer + sources
        let webContext = ''
        if (lastSearchAnswer) {
          webContext += `[Resumen de búsqueda (IA)]\n${lastSearchAnswer}\n\n---\n\n`
        }
        webContext += webSources.map((s, i) => {
          let entry = `[Web ${i + 1}: ${s.title}${s.score ? ` (relevancia: ${(s.score * 100).toFixed(0)}%)` : ''}]\nURL: ${s.url}\nResumen: ${s.snippet}`
          if (s.pageContent) {
            entry += `\n\nContenido completo de la página:\n${s.pageContent}`
          }
          return entry
        }).join('\n\n---\n\n')

        systemPrompt += `\n\n[BÚSQUEDA WEB REALIZADA — DATOS EN TIEMPO REAL]\nFecha actual: ${new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.\nA continuación tienes datos REALES extraídos de internet AHORA MISMO. OBLIGACIONES:\n1. Usa estos datos directamente para responder con información concreta (números, nombres, tablas, fechas, estadísticas).\n2. NO digas que no puedes acceder a información en tiempo real.\n3. NO ofrezcas enlaces para que el usuario busque por su cuenta.\n4. Presenta los datos de forma clara y estructurada (usa tablas markdown cuando sea apropiado).\n5. Si hay datos tabulares (clasificaciones, rankings, listas), formatea como tabla markdown.\n6. Incluye TODOS los datos relevantes que encuentres, no los resumas excesivamente.\n\n${webContext}\n\nCita las fuentes web relevantes indicando el título y URL al final de tu respuesta.`
      }
    } catch (e) {
      console.error('Web search error:', e)
    }
  }

  // DB Query context
  if (db_query && input) {
    try {
      // Get active DB connections
      const { data: dbConns } = await serviceClient
        .from('db_connections')
        .select('*')
        .eq('is_active', true)
        .limit(1)

      const conn = dbConns?.[0]
      if (conn && conn.schema_cache?.length > 0) {
        const schemaContext = conn.schema_cache.map((t: { schema_name: string; table_name: string; columns: { name: string; type: string; nullable: boolean }[] }) =>
          `Tabla: [${t.schema_name}].[${t.table_name}]\nColumnas: ${t.columns.map((c: { name: string; type: string; nullable: boolean }) => `${c.name} (${c.type})`).join(', ')}`
        ).join('\n\n')

        // Ask AI to generate SQL
        const sqlAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: `Eres un experto en SQL Server. Genera SOLO la consulta SQL SELECT para responder la pregunta del usuario.\nREGLAS:\n- Solo SELECT, nunca INSERT/UPDATE/DELETE/DROP\n- Usa TOP 100 para limitar resultados\n- Usa los nombres exactos de tablas y columnas del esquema\n- Responde SOLO con el SQL, sin explicaciones ni markdown\n- Si la pregunta NO está relacionada con la BD, responde exactamente: SKIP\n- Si no puedes generar una consulta válida, responde: ERROR: seguido de la razón\n\nESQUEMA:\n${schemaContext}` },
              { role: 'user', content: input }
            ],
            temperature: 0, max_tokens: 1000,
          }),
        })
        const sqlAiData = await sqlAiRes.json()
        let generatedSQL = (sqlAiData.choices?.[0]?.message?.content?.trim() || '').replace(/```sql\n?/gi, '').replace(/```\n?/g, '').trim()

        if (generatedSQL && generatedSQL !== 'SKIP' && !generatedSQL.startsWith('ERROR:')) {
          // Validate SQL
          const upper = generatedSQL.toUpperCase().trim()
          const forbidden = ['INSERT ', 'UPDATE ', 'DELETE ', 'DROP ', 'ALTER ', 'CREATE ', 'TRUNCATE ', 'EXEC ', 'EXECUTE ']
          const isSafe = upper.startsWith('SELECT') && !forbidden.some(kw => upper.includes(kw))

          if (isSafe) {
            try {
              const pool = await sql.connect({
                server: conn.host, port: conn.port || 1433,
                database: conn.database_name || undefined,
                user: conn.username, password: conn.password,
                options: { encrypt: false, trustServerCertificate: true },
                connectionTimeout: 10000, requestTimeout: 15000,
              })
              const result = await pool.request().query(generatedSQL)
              await pool.close()

              const rows = (result.recordset || []).slice(0, 50)
              if (rows.length > 0) {
                // Format as markdown table
                const cols = Object.keys(rows[0])
                const header = `| ${cols.join(' | ')} |`
                const separator = `| ${cols.map(() => '---').join(' | ')} |`
                const dataRows = rows.map((r: Record<string, unknown>) => `| ${cols.map(c => String(r[c] ?? '')).join(' | ')} |`).join('\n')
                const tableStr = `${header}\n${separator}\n${dataRows}`

                systemPrompt += `\n\nRESULTADOS DE LA BASE DE DATOS (${conn.name}):\nConsulta SQL ejecutada: ${generatedSQL}\nResultados (${rows.length} filas):\n${tableStr}\n\nUsa estos datos para responder la pregunta del usuario. Presenta los resultados de forma clara y útil. Si se muestran datos numéricos, puedes calcular totales o promedios si es relevante.`
              } else {
                systemPrompt += `\n\nSe ejecutó una consulta en la BD (${conn.name}) pero no devolvió resultados.\nSQL: ${generatedSQL}\nInforma al usuario que no se encontraron datos.`
              }

              // Log the query
              await serviceClient.from('db_query_logs').insert({
                connection_id: conn.id, user_id: user.id, user_question: input,
                generated_sql: generatedSQL, row_count: rows.length, success: true,
              }).catch(() => {})
            } catch (dbErr) {
              console.error('DB query execution error:', dbErr)
              systemPrompt += `\n\nSe intentó consultar la BD pero hubo un error de conexión. Informa al usuario que no se pudo conectar a la base de datos.`
            }
          }
        }
      }
    } catch (e) {
      console.error('DB query error:', e)
    }
  }

  // Image generation with DALL-E 3
  let generatedImageUrl = ''
  if (image_generation && input) {
    try {
      console.log('[ImageGen] Generating image for:', input)
      const imgRes = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: input,
          n: 1,
          size: '1024x1024',
          quality: 'standard',
          response_format: 'url',
        }),
      })

      if (imgRes.ok) {
        const imgData = await imgRes.json()
        generatedImageUrl = imgData.data?.[0]?.url || ''
        console.log('[ImageGen] Generated image URL:', generatedImageUrl ? 'success' : 'empty')

        if (generatedImageUrl) {
          systemPrompt += `\n\n[IMAGEN GENERADA]\nSe ha generado una imagen basada en la solicitud del usuario. La imagen se mostrará automáticamente en el chat.\nDescribe brevemente lo que se ha generado e informa al usuario que la imagen está lista.`
        }
      } else {
        const errText = await imgRes.text()
        console.error('[ImageGen] API error:', imgRes.status, errText)
        systemPrompt += `\n\n[ERROR DE GENERACIÓN DE IMAGEN]\nNo se pudo generar la imagen. Informa al usuario del error y sugiere que reformule su solicitud.`
      }
    } catch (e) {
      console.error('[ImageGen] Error:', e)
    }
  }

  // (Messages built after provider lookup below)

  // Look up model config from database to find provider
  let apiUrl = 'https://api.openai.com/v1/chat/completions'
  let apiKey = process.env.OPENAI_API_KEY || ''
  let providerType = 'openai'
  let modelSystemPrompt = ''

  const { data: modelConfig } = await serviceClient
    .from('model_configs')
    .select('*, ai_providers(type, base_url, api_key)')
    .eq('model_id', model)
    .eq('is_visible', true)
    .limit(1)
    .single()

  if (modelConfig) {
    const provider = modelConfig.ai_providers as { type: string; base_url: string; api_key: string } | null
    if (provider) {
      providerType = provider.type
      apiKey = provider.api_key
      apiUrl = `${provider.base_url}/chat/completions`
    }
    if (modelConfig.system_prompt) {
      modelSystemPrompt = modelConfig.system_prompt
    }
  }

  // Prepend model-specific system prompt if configured
  if (modelSystemPrompt) {
    systemPrompt = systemPrompt ? (modelSystemPrompt + '\n\n' + systemPrompt) : modelSystemPrompt
  }

  // Rebuild apiMessages with updated systemPrompt (skip system message if empty)
  const historyMessages: { role: string; content: string }[] = (messages || []).slice(-40).map((m: { role: string; content: string }) => ({ role: m.role, content: m.content }))
  const finalMessages: { role: string; content: string }[] = systemPrompt.trim()
    ? [{ role: 'system', content: systemPrompt }, ...historyMessages]
    : historyMessages

  // Determine if model needs max_completion_tokens (newer models) vs max_tokens (legacy)
  // Only apply token limits if use_max_tokens is enabled in model config
  const useNewTokenParam = model.startsWith('gpt-5') || model.startsWith('gpt-4.5') || model.startsWith('gpt-4.1') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')
  const shouldLimitTokens = modelConfig?.use_max_tokens === true
  const configMaxTokens = modelConfig?.max_tokens || (useNewTokenParam ? 16384 : 4096)
  const tokenParam = shouldLimitTokens
    ? (useNewTokenParam ? { max_completion_tokens: configMaxTokens } : { max_tokens: configMaxTokens })
    : {}

  // Some reasoning models don't support temperature/system messages the same way
  const isReasoningModel = model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')

  // Build request body based on provider type
  let requestBody: Record<string, unknown> = {
    model,
    messages: isReasoningModel
      ? finalMessages.map(m => m.role === 'system' ? { ...m, role: 'developer' } : m)
      : finalMessages,
    stream: true,
    ...tokenParam,
    ...(isReasoningModel ? {} : { temperature: 0.7 }),
  }

  // Adapt for Gemini provider (uses OpenAI-compatible format via their v1beta endpoint)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (providerType === 'gemini') {
    headers['Authorization'] = `Bearer ${apiKey}`
    // Google Gemini OpenAI-compatible endpoint
    apiUrl = `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`
  } else if (providerType === 'anthropic') {
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
    // Anthropic has different API format, use messages endpoint
    apiUrl = `https://api.anthropic.com/v1/messages`
    const systemContent = finalMessages.find(m => m.role === 'system')?.content || ''
    requestBody = {
      model,
      system: systemContent,
      messages: finalMessages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
      stream: true,
      max_tokens: configMaxTokens,
    }
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  // Call AI provider with streaming
  const openaiRes = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  })

  if (!openaiRes.ok || !openaiRes.body) {
    const err = await openaiRes.text()
    return new Response(`AI provider error: ${err}`, { status: 500 })
  }

  // Stream response
  const encoder = new TextEncoder()
  let fullContent = ''

  const stream = new ReadableStream({
    async start(controller) {
      const reader = openaiRes.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                const token = parsed.choices?.[0]?.delta?.content
                if (token) { fullContent += token; controller.enqueue(encoder.encode(token)) }
              } catch { /* ignore parse errors */ }
            }
          }
        }
      } finally {
        // Combine RAG + Web sources for saving
        const webSourcesFormatted = webSources.map((w, i) => ({
          chunk_id: `web-${i}`, file_id: '', filename: w.title,
          chunk_index: 0, snippet: w.snippet, similarity: 0,
          url: w.url, source_type: 'web' as const,
        }))
        const allSources = [...ragSources, ...webSourcesFormatted]

        // Save AI message to DB
        const metaJson: Record<string, unknown> = {}
        if (generatedImageUrl) metaJson.image_url = generatedImageUrl
        const msgData: Record<string, unknown> = {
          conversation_id, user_id: user.id, role: 'assistant',
          content: fullContent, sources_json: allSources, model,
          ...(Object.keys(metaJson).length > 0 ? { meta_json: metaJson } : {}),
        }

        if (regenerate_message_id) {
          // Create version for regeneration
          const { data: existingVersions } = await serviceClient.from('message_versions')
            .select('version_index').eq('message_id', regenerate_message_id).order('version_index', { ascending: false }).limit(1)
          const nextVersion = (existingVersions?.[0]?.version_index || 0) + 1
          await serviceClient.from('message_versions').insert({
            message_id: regenerate_message_id, version_index: nextVersion,
            content: fullContent, model, sources_json: allSources,
          })
          await serviceClient.from('messages').update({ content: fullContent, sources_json: allSources, model }).eq('id', regenerate_message_id)
        } else {
          const { data: newMsg } = await serviceClient.from('messages').insert(msgData).select().single()
          if (newMsg) {
            // Save first version
            await serviceClient.from('message_versions').insert({
              message_id: newMsg.id, version_index: 1, content: fullContent, model, sources_json: allSources,
            })
          }
        }

        // Auto-rename conversation after first exchange
        const { data: msgCount } = await serviceClient.from('messages')
          .select('id', { count: 'exact' }).eq('conversation_id', conversation_id)
        if (msgCount && msgCount.length <= 4) {
          try {
            const titleRes = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: 'gpt-4o-mini', max_tokens: 30,
                messages: [
                  { role: 'system', content: 'Genera un título corto (máx 6 palabras) en español para esta conversación. Solo el título, sin comillas.' },
                  { role: 'user', content: input || fullContent.substring(0, 200) },
                ],
              }),
            })
            const titleData = await titleRes.json()
            const newTitle = titleData.choices?.[0]?.message?.content?.trim()
            if (newTitle) {
              await serviceClient.from('conversations').update({ title: newTitle, updated_at: new Date().toISOString() }).eq('id', conversation_id)
            }
          } catch { /* ignore title gen errors */ }
        }

        // Send a signal that the conversation title may have been updated
        controller.enqueue(encoder.encode('\n__TITLE_UPDATED__'))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'Transfer-Encoding': 'chunked' },
  })
}

