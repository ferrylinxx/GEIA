import { NextRequest } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const { conversation_id, input, model = 'gpt-4o-mini', rag_mode = 'off', cite_mode = false, attachments = [], regenerate_message_id, skip_user_save = false } = body

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
  const { data: messages } = await serviceClient.from('messages').select('role, content')
    .eq('conversation_id', conversation_id).order('created_at').limit(50)

  // Load profile for custom instructions
  const { data: profile } = await serviceClient.from('profiles').select('*').eq('id', user.id).single()

  // Load user memories
  const { data: userMemories } = await serviceClient.from('memories').select('content')
    .eq('user_id', user.id).eq('scope', 'user').eq('enabled', true)

  // Build system prompt
  let systemPrompt = 'Eres GIA (Gestor de Inteligencia Artificial), un asistente de IA inteligente, útil y preciso. Responde siempre en español usando formato Markdown bien estructurado: usa encabezados (##, ###), listas numeradas y con viñetas, **negritas** para conceptos clave, bloques de código con el lenguaje especificado, y tablas cuando sea apropiado. Organiza tu respuesta con claridad y orden.'

  if (profile?.custom_instructions_enabled) {
    if (profile.custom_instructions_what) systemPrompt += `\n\nSobre el usuario: ${profile.custom_instructions_what}`
    if (profile.custom_instructions_how) systemPrompt += `\n\nCómo responder: ${profile.custom_instructions_how}`
  }

  if (userMemories && userMemories.length > 0) {
    systemPrompt += '\n\nRecuerdos del usuario:\n' + userMemories.map((m: { content: string }) => `- ${m.content}`).join('\n')
  }

  // RAG context
  let ragSources: Array<{ chunk_id: string; file_id: string; filename: string; page?: number; chunk_index: number; snippet: string; similarity: number }> = []
  if (rag_mode !== 'off' && input) {
    const { data: conv } = await serviceClient.from('conversations').select('project_id').eq('id', conversation_id).single()
    if (conv?.project_id) {
      try {
        // Generate embedding for the query
        const embRes = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ input, model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small' }),
        })
        const embData = await embRes.json()
        const queryEmbedding = embData.data?.[0]?.embedding

        if (queryEmbedding) {
          const { data: chunks } = await serviceClient.rpc('match_file_chunks', {
            p_project_id: conv.project_id,
            p_query_embedding: queryEmbedding,
            p_match_count: 8,
            p_similarity_threshold: 0.7,
          })

          if (chunks && chunks.length > 0) {
            // Get filenames
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
        }
      } catch (e) {
        console.error('RAG error:', e)
      }
    }
  }

  // Build messages for API
  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...(messages || []).slice(-40).map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
  ]
  if (input && !regenerate_message_id) {
    // Already added via the history
  }

  // Call OpenAI with streaming
  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: apiMessages, stream: true, max_tokens: 4096 }),
  })

  if (!openaiRes.ok || !openaiRes.body) {
    const err = await openaiRes.text()
    return new Response(`OpenAI error: ${err}`, { status: 500 })
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
        // Save AI message to DB
        const msgData: Record<string, unknown> = {
          conversation_id, user_id: user.id, role: 'assistant',
          content: fullContent, sources_json: ragSources,
        }

        if (regenerate_message_id) {
          // Create version for regeneration
          const { data: existingVersions } = await serviceClient.from('message_versions')
            .select('version_index').eq('message_id', regenerate_message_id).order('version_index', { ascending: false }).limit(1)
          const nextVersion = (existingVersions?.[0]?.version_index || 0) + 1
          await serviceClient.from('message_versions').insert({
            message_id: regenerate_message_id, version_index: nextVersion,
            content: fullContent, model, sources_json: ragSources,
          })
          await serviceClient.from('messages').update({ content: fullContent, sources_json: ragSources }).eq('id', regenerate_message_id)
        } else {
          const { data: newMsg } = await serviceClient.from('messages').insert(msgData).select().single()
          if (newMsg) {
            // Save first version
            await serviceClient.from('message_versions').insert({
              message_id: newMsg.id, version_index: 1, content: fullContent, model, sources_json: ragSources,
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
              await serviceClient.from('conversations').update({ title: newTitle }).eq('id', conversation_id)
            }
          } catch { /* ignore title gen errors */ }
        }

        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'Transfer-Encoding': 'chunked' },
  })
}

