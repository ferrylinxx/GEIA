import { NextRequest, NextResponse } from 'next/server'
import { ensureProjectRole, getProjectApiContext, jsonError } from '@/lib/project-api'

export const runtime = 'nodejs'
export const maxDuration = 120

interface ContradictionResult {
  id: string
  severity: 'low' | 'medium' | 'high'
  topic: string
  statement_a: string
  statement_b: string
  conversations: string[]
  recommendation: string
  confidence: number
}

function safeParseContradictions(raw: string): ContradictionResult[] {
  if (!raw) return []
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fenced?.[1] || trimmed
  try {
    const parsed = JSON.parse(candidate)
    const items = Array.isArray(parsed?.contradictions) ? parsed.contradictions : (Array.isArray(parsed) ? parsed : [])
    return items
      .map((item: Record<string, unknown>, idx: number) => ({
        id: String(item.id || `c-${idx + 1}`),
        severity: (['low', 'medium', 'high'].includes(String(item.severity)) ? String(item.severity) : 'medium') as 'low' | 'medium' | 'high',
        topic: String(item.topic || 'General'),
        statement_a: String(item.statement_a || ''),
        statement_b: String(item.statement_b || ''),
        conversations: Array.isArray(item.conversations) ? item.conversations.map((v) => String(v)) : [],
        recommendation: String(item.recommendation || ''),
        confidence: Math.max(0, Math.min(1, Number(item.confidence || 0.6))),
      }))
      .filter((item: ContradictionResult) => item.statement_a && item.statement_b)
  } catch {
    return []
  }
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const ctx = await getProjectApiContext()
  if (!ctx) return jsonError('Unauthorized', 401)
  const { user, service } = ctx
  const { id: projectId } = await context.params
  if (!projectId) return jsonError('project id required', 400)

  const { ok } = await ensureProjectRole(service, projectId, user.id, 'viewer')
  if (!ok) return jsonError('Forbidden', 403)

  const { data: project } = await service
    .from('projects')
    .select('id, name')
    .eq('id', projectId)
    .single()
  if (!project) return jsonError('Project not found', 404)

  const { data: conversations } = await service
    .from('conversations')
    .select('id, title, updated_at')
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(12)

  const convs = conversations || []
  if (convs.length < 2) {
    return NextResponse.json({ contradictions: [], summary: 'No hay suficiente historial para detectar contradicciones.' })
  }

  const convIds = convs.map((c: { id: string }) => c.id)
  const { data: messages } = await service
    .from('messages')
    .select('conversation_id, role, content, created_at')
    .in('conversation_id', convIds)
    .in('role', ['assistant', 'user'])
    .order('created_at', { ascending: false })
    .limit(600)

  const snippetsByConversation = new Map<string, string[]>()
  for (const row of messages || []) {
    if (!row?.conversation_id || !row?.content) continue
    const current = snippetsByConversation.get(row.conversation_id) || []
    if (current.length >= 10) continue
    const clean = String(row.content).replace(/\s+/g, ' ').trim()
    if (!clean) continue
    const prefix = row.role === 'assistant' ? 'IA' : 'Usuario'
    current.push(`${prefix}: ${clean.slice(0, 360)}`)
    snippetsByConversation.set(row.conversation_id, current)
  }

  const conversationBlocks = convs.map((conv: { id: string; title: string }) => {
    const lines = (snippetsByConversation.get(conv.id) || []).reverse()
    return `Chat ${conv.id} | Titulo: ${conv.title || 'Sin titulo'}\n${lines.join('\n')}`
  }).join('\n\n---\n\n')

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      contradictions: [],
      summary: 'OPENAI_API_KEY no configurada, no se pudo ejecutar analisis semantico.',
    })
  }

  const model = process.env.DEFAULT_CHAT_MODEL || 'gpt-4o-mini'
  const systemPrompt = [
    'Eres un auditor de coherencia entre conversaciones de proyecto.',
    'Detecta contradicciones objetivas entre chats del mismo proyecto.',
    'Devuelve SOLO JSON valido con esta forma:',
    '{ "contradictions": [ { "id": "c-1", "severity": "low|medium|high", "topic": "string", "statement_a": "string", "statement_b": "string", "conversations": ["chat_id_a", "chat_id_b"], "recommendation": "string", "confidence": 0.0 } ] }',
    'No inventes contradicciones. Si no hay, devuelve {"contradictions":[]}.',
  ].join(' ')

  const userPrompt = [
    `Proyecto: ${project.name}`,
    'Analiza estos chats y encuentra contradicciones de hechos, cifras, fechas, decisiones o requisitos:',
    conversationBlocks,
  ].join('\n\n')

  const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
    }),
  })

  if (!aiRes.ok) {
    const errorText = await aiRes.text()
    return jsonError(`No se pudo analizar contradicciones: ${errorText}`, 500)
  }

  const aiData = await aiRes.json()
  const raw = String(aiData?.choices?.[0]?.message?.content || '')
  const contradictions = safeParseContradictions(raw)
  const summary = contradictions.length > 0
    ? `Se detectaron ${contradictions.length} posible(s) contradiccion(es).`
    : 'No se detectaron contradicciones claras en los chats analizados.'

  return NextResponse.json({ contradictions, summary })
}

