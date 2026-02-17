import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { searchWeb } from '@/lib/web-search'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const serviceClient = createServiceRoleClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { agent_id } = body

    if (!agent_id) {
      return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 })
    }

    // Fetch agent
    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('id', agent_id)
      .eq('user_id', user.id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    if (!agent.is_active) {
      return NextResponse.json({ error: 'Agent is not active' }, { status: 400 })
    }

    // Create execution record using serviceClient to bypass RLS
    const { data: execution, error: execError } = await serviceClient
      .from('agent_executions')
      .insert({
        agent_id: agent.id,
        user_id: user.id,
        status: 'running',
      })
      .select()
      .single()

    if (execError || !execution) {
      console.error('[AgentExecution] Failed to create execution record:', execError)
      return NextResponse.json({ error: 'Failed to create execution record' }, { status: 500 })
    }

    console.log('[AgentExecution] Created execution record:', execution.id)

    const startTime = Date.now()

    try {
      // Execute agent logic
      const result = await executeAgent(agent, user.id, serviceClient)

      console.log('[AgentExecution] Execution completed, updating record:', execution.id)

      // Update execution record using serviceClient to bypass RLS
      const { error: updateError } = await serviceClient
        .from('agent_executions')
        .update({
          status: 'completed',
          result: result.output,
          tools_used: result.tools_used,
          execution_time_ms: Date.now() - startTime,
          completed_at: new Date().toISOString(),
        })
        .eq('id', execution.id)

      if (updateError) {
        console.error('[AgentExecution] Failed to update execution record:', updateError)
      } else {
        console.log('[AgentExecution] Successfully updated execution record')
      }

      // Update agent stats using serviceClient
      const { error: agentUpdateError } = await serviceClient
        .from('ai_agents')
        .update({
          last_run_at: new Date().toISOString(),
          run_count: agent.run_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', agent.id)

      if (agentUpdateError) {
        console.error('[AgentExecution] Failed to update agent stats:', agentUpdateError)
      }

      return NextResponse.json({
        success: true,
        execution_id: execution.id,
        result: result.output,
        tools_used: result.tools_used,
      })
    } catch (error) {
      console.error('[AgentExecution] Execution failed:', error)

      // Update execution record with error using serviceClient
      const { error: updateError } = await serviceClient
        .from('agent_executions')
        .update({
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          execution_time_ms: Date.now() - startTime,
          completed_at: new Date().toISOString(),
        })
        .eq('id', execution.id)

      if (updateError) {
        console.error('[AgentExecution] Failed to update execution record with error:', updateError)
      }

      throw error
    }
  } catch (error) {
    console.error('[AgentExecution] Error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 })
  }
}

export async function executeAgent(agent: any, userId: string, serviceClient: any) {
  const tools_used: string[] = []
  let finalOutput = '' // This will store only the final result (tables)
  const availableTools = agent.tools || []

  // Step 1: Use LLM to plan the execution
  const planningPrompt = `Eres un agente autónomo llamado "${agent.name}".

Tu objetivo es: ${agent.goal}

Herramientas disponibles:
${availableTools.includes('web_search') ? '- web_search: Buscar información en internet' : ''}
${availableTools.includes('database') ? '- database: Consultar bases de datos SQL' : ''}
${availableTools.includes('code_interpreter') ? '- code_interpreter: Ejecutar código Python para análisis' : ''}

Genera un plan de acción paso a paso para cumplir tu objetivo. Responde SOLO con un JSON válido con esta estructura:
{
  "steps": [
    {"action": "web_search", "query": "consulta de búsqueda"},
    {"action": "code_interpreter", "code": "código python"},
    {"action": "summary", "text": "resumen final"}
  ]
}

Cada paso debe tener un "action" (web_search, database, code_interpreter, o summary) y los parámetros necesarios.`

  try {
    // Call OpenAI to plan
    const planRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        max_tokens: 800,
        messages: [
          { role: 'system', content: 'Eres un planificador de agentes autónomos. Siempre respondes con JSON válido.' },
          { role: 'user', content: planningPrompt },
        ],
      }),
    })

    if (!planRes.ok) {
      throw new Error(`Planning failed: ${await planRes.text()}`)
    }

    const planData = await planRes.json()
    const planText = planData.choices?.[0]?.message?.content?.trim() || '{}'

    // Extract JSON from markdown if needed
    const jsonMatch = planText.match(/```json\n([\s\S]*?)\n```/) || planText.match(/```\n([\s\S]*?)\n```/)
    const cleanJson = jsonMatch ? jsonMatch[1] : planText
    const plan = JSON.parse(cleanJson)

    // Step 2: Execute each step (silently, without adding to output)
    let searchResults: any[] = []
    if (Array.isArray(plan.steps)) {
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i]

        if (step.action === 'web_search' && availableTools.includes('web_search')) {
          tools_used.push('web_search')
          // Execute search silently
          try {
            console.log('[AgentWebSearch] Searching with Tavily:', step.query)
            const results = await searchWeb(step.query, 5)
            searchResults = results // Store for later processing
            console.log(`[AgentWebSearch] Found ${results.length} results`)
          } catch (error) {
            console.error('[AgentWebSearch] Error:', error)
          }
        } else if (step.action === 'database' && availableTools.includes('database')) {
          tools_used.push('database')
          // In a real implementation, execute SQL query
        } else if (step.action === 'code_interpreter' && availableTools.includes('code_interpreter')) {
          tools_used.push('code_interpreter')
          // In a real implementation, call code interpreter API
        } else if (step.action === 'summary') {
          // Generate final output with AI

          // If we have search results, use AI to analyze them and generate structured output
          if (searchResults.length > 0) {
            try {
              const summaryPrompt = `Analiza estos resultados de búsqueda sobre el FC Barcelona:

${searchResults.map((r, idx) => `
Resultado ${idx + 1}:
Título: ${r.title}
Contenido: ${r.snippet}
${r.content ? `Contenido completo: ${r.content.substring(0, 2000)}` : ''}
`).join('\n')}

Genera SOLO tablas en formato Markdown. NO incluyas texto explicativo, títulos, ni nada más. SOLO las tablas.

Incluye estas tablas (si hay información disponible):

1. Tabla del último partido:
| Marcador Final | Rival | Competición | Fecha |

2. Tabla del próximo partido (si está disponible):
| Rival | Competición | Fecha | Hora |

3. Tabla de posición en LaLiga (si está disponible):
| Posición | Puntos | Partidos Jugados |

IMPORTANTE:
- NO uses variables como result.score, usa datos REALES de los resultados de búsqueda
- NO agregues texto antes o después de las tablas
- NO agregues títulos como "## Último Partido"
- SOLO las tablas en formato Markdown
- Si no hay información para una tabla, omítela completamente`

              console.log('[AgentSummary] Calling OpenAI for summary generation...')
              const summaryRes = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                },
                body: JSON.stringify({
                  model: 'gpt-4o-mini',
                  messages: [
                    { role: 'system', content: 'Eres un asistente que genera SOLO tablas Markdown. NO generas texto explicativo, títulos, ni introducciones. SOLO tablas con datos reales. NUNCA uses variables como result.score.' },
                    { role: 'user', content: summaryPrompt }
                  ],
                  temperature: 0.1,
                  max_tokens: 500,
                }),
              })

              if (summaryRes.ok) {
                const summaryData = await summaryRes.json()
                const aiSummary = summaryData.choices?.[0]?.message?.content || 'No se pudo generar el resumen.'
                console.log('[AgentSummary] AI summary generated successfully')
                finalOutput = aiSummary // Store only the final AI-generated tables
              } else {
                const errorText = await summaryRes.text()
                console.error('[AgentSummary] OpenAI API error:', errorText)
                finalOutput = '⚠️ Error al generar resumen con IA.'
              }
            } catch (error) {
              console.error('[AgentSummary] Error generating AI summary:', error)
              finalOutput = `⚠️ Error al generar resumen: ${error instanceof Error ? error.message : 'Unknown'}`
            }
          } else {
            finalOutput = '⚠️ No hay resultados de búsqueda para generar el resumen.'
          }
        }
      }
    }

    // Return only the final output (tables) without any execution context
    return {
      output: finalOutput || 'No se generó ningún resultado.',
      tools_used: [...new Set(tools_used)],
    }
  } catch (error) {
    console.error('[AgentExecution] Error in executeAgent:', error)
    throw new Error(`Error ejecutando agente: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

