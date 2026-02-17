import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const service = createServiceRoleClient()
  const { data: webhook } = await service
    .from('webhook_configs')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!webhook) return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })

  // Get user profile
  const { data: profile } = await service.from('profiles').select('name').eq('id', user.id).single()
  const userName = profile?.name || 'Usuario'

  try {
    if (webhook.webhook_type === 'discord') {
      const payload = {
        embeds: [{
          title: '🧪 Test — GEIA Webhook',
          description: `Webhook configurado correctamente por **${userName}**`,
          color: 0x5865F2,
          fields: [
            { name: '📡 Tipo', value: 'Discord', inline: true },
            { name: '💬 Min. mensajes', value: String(webhook.min_messages), inline: true },
          ],
          footer: { text: 'GEIA — Gestión Empresarial con IA' },
          timestamp: new Date().toISOString(),
        }],
      }
      const res = await fetch(webhook.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const text = await res.text()
        return NextResponse.json({ error: `Discord error: ${res.status} — ${text}` }, { status: 400 })
      }
    } else {
      // Slack
      const payload = {
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: '🧪 Test — GEIA Webhook', emoji: true } },
          { type: 'section', text: { type: 'mrkdwn', text: `Webhook configurado correctamente por *${userName}*` } },
          { type: 'section', fields: [
            { type: 'mrkdwn', text: `*📡 Tipo:* Slack` },
            { type: 'mrkdwn', text: `*💬 Min. mensajes:* ${webhook.min_messages}` },
          ] },
          { type: 'context', elements: [{ type: 'mrkdwn', text: 'GEIA — Gestión Empresarial con IA' }] },
        ],
      }
      const res = await fetch(webhook.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const text = await res.text()
        return NextResponse.json({ error: `Slack error: ${res.status} — ${text}` }, { status: 400 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: `Error: ${err instanceof Error ? err.message : 'Unknown'}` }, { status: 500 })
  }
}

