import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface Message {
  role: string
  content: string
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { user_message, assistant_message, context = [] } = body

    if (!user_message || !assistant_message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Build context for the AI
    const contextMessages: Message[] = [
      { role: 'system', content: 'Eres un asistente que genera sugerencias de seguimiento para conversaciones. Genera exactamente 3 preguntas o sugerencias breves (máximo 10 palabras cada una) que el usuario podría querer hacer a continuación basándote en el contexto de la conversación. Las sugerencias deben ser relevantes, específicas y útiles. Responde SOLO con un array JSON de strings, sin texto adicional.' },
      ...context.map((m: Message) => ({ role: m.role, content: m.content })),
      { role: 'user', content: user_message },
      { role: 'assistant', content: assistant_message.substring(0, 1000) },
      { role: 'user', content: 'Genera 3 sugerencias de seguimiento breves y relevantes en español.' }
    ]

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: contextMessages,
        temperature: 0.7,
        max_tokens: 150
      })
    })

    if (!response.ok) {
      console.error('OpenAI API error:', await response.text())
      return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 })
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || '[]'
    
    // Parse the JSON response
    let suggestions: string[] = []
    try {
      // Try to extract JSON array from the response
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0])
      } else {
        // Fallback: split by newlines and clean up
        suggestions = content
          .split('\n')
          .map((s: string) => s.trim().replace(/^[-*•]\s*/, '').replace(/^["']|["']$/g, ''))
          .filter((s: string) => s.length > 0 && s.length < 100)
          .slice(0, 3)
      }
    } catch (parseError) {
      console.error('Failed to parse suggestions:', parseError)
      // Fallback suggestions
      suggestions = [
        '¿Puedes explicar más sobre esto?',
        '¿Qué otros aspectos debería considerar?',
        '¿Tienes ejemplos adicionales?'
      ]
    }

    // Ensure we have exactly 3 suggestions
    if (suggestions.length < 3) {
      const fallbacks = [
        '¿Puedes profundizar en este tema?',
        '¿Hay algo más que deba saber?',
        '¿Cómo puedo aplicar esto?'
      ]
      while (suggestions.length < 3) {
        suggestions.push(fallbacks[suggestions.length] || '¿Algo más?')
      }
    }

    return NextResponse.json({ 
      suggestions: suggestions.slice(0, 3)
    })

  } catch (error) {
    console.error('Suggestions API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

