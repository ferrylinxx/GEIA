import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if agent already exists
    const { data: existingAgents } = await supabase
      .from('ai_agents')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', 'Agente FC Barcelona')
      .limit(1)

    if (existingAgents && existingAgents.length > 0) {
      return NextResponse.json({
        message: 'El agente ya existe',
        agent_id: existingAgents[0].id,
        already_exists: true,
      })
    }

    // Create FC Barcelona agent
    const fcbAgent = {
      name: 'Agente FC Barcelona',
      description: 'Agente especializado en obtener resultados, noticias y estadísticas del FC Barcelona',
      goal: `Buscar en internet los últimos resultados del FC Barcelona. 
Incluir:
- Último partido jugado (resultado, fecha, competición)
- Próximo partido (rival, fecha, hora, competición)
- Posición en la tabla de LaLiga
- Últimas noticias relevantes del equipo

Presentar la información de forma clara y organizada.`,
      tools: ['web_search'],
      schedule_type: 'manual',
      schedule_config: {},
    }

    console.log('[FCB Agent] Creating FC Barcelona agent...')
    const { data: agent, error: createError } = await supabase
      .from('ai_agents')
      .insert({
        user_id: user.id,
        ...fcbAgent,
      })
      .select()
      .single()

    if (createError) {
      console.error('[FCB Agent] Error creating agent:', createError)
      return NextResponse.json({ 
        error: 'Failed to create FC Barcelona agent', 
        details: createError.message 
      }, { status: 500 })
    }

    console.log('[FCB Agent] Agent created:', agent.id)

    return NextResponse.json({
      success: true,
      message: '✅ Agente FC Barcelona creado exitosamente',
      agent: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        goal: agent.goal,
        tools: agent.tools,
      },
    })

  } catch (error) {
    console.error('[FCB Agent] Error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 })
  }
}

