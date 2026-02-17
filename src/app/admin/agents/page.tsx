'use client'

import { useState, useEffect } from 'react'
import { Bot, Plus, Play, Trash2, Edit2, Clock, CheckCircle2, XCircle, Calendar, Loader2, X, History, Search, Database, Globe, Code2 } from 'lucide-react'

interface Agent {
  id: string
  name: string
  description: string
  goal: string
  tools: string[]
  schedule_type: 'manual' | 'interval' | 'daily' | 'cron'
  schedule_config: Record<string, unknown> | null
  is_active: boolean
  last_run_at: string | null
  next_run_at: string | null
  run_count: number
  created_at: string
  updated_at: string
}

interface AgentExecution {
  id: string
  agent_id: string
  status: 'running' | 'completed' | 'failed'
  result: string | null
  error: string | null
  tools_used: string[] | null
  execution_time_ms: number | null
  created_at: string
  completed_at: string | null
}

type TabType = 'agents' | 'create' | 'history'

export default function AgentsAdminPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('agents')
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [executions, setExecutions] = useState<AgentExecution[]>([])
  const [executingAgentId, setExecutingAgentId] = useState<string | null>(null)
  const [loadingExecutions, setLoadingExecutions] = useState(false)

  useEffect(() => {
    loadAgents()
  }, [])

  const loadAgents = async () => {
    try {
      const res = await fetch('/api/agents')
      if (res.ok) {
        const data = await res.json()
        setAgents(data.agents || [])
      }
    } catch (error) {
      console.error('Error loading agents:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadExecutions = async () => {
    setLoadingExecutions(true)
    try {
      // TODO: Crear endpoint /api/agents/executions para obtener todas las ejecuciones
      // Por ahora, dejamos el array vacío
      setExecutions([])
    } catch (error) {
      console.error('Error loading executions:', error)
    } finally {
      setLoadingExecutions(false)
    }
  }

  const handleExecuteAgent = async (agentId: string) => {
    setExecutingAgentId(agentId)
    try {
      const res = await fetch('/api/agents/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId }),
      })
      if (res.ok) {
        const data = await res.json()
        alert(`Agente ejecutado exitosamente!\n\nResultado:\n${data.result}`)
        loadAgents()
      } else {
        const error = await res.json()
        alert(`Error: ${error.error}`)
      }
    } catch (error) {
      console.error('Error executing agent:', error)
      alert('Error al ejecutar el agente')
    } finally {
      setExecutingAgentId(null)
    }
  }

  const handleDeleteAgent = async (agentId: string) => {
    if (!confirm('¿Estás seguro de eliminar este agente?')) return
    
    try {
      const res = await fetch(`/api/agents?id=${agentId}`, { method: 'DELETE' })
      if (res.ok) {
        loadAgents()
      }
    } catch (error) {
      console.error('Error deleting agent:', error)
    }
  }

  const handleToggleActive = async (agent: Agent) => {
    try {
      const res = await fetch('/api/agents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: agent.id, is_active: !agent.is_active }),
      })
      if (res.ok) {
        loadAgents()
      }
    } catch (error) {
      console.error('Error toggling agent:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-zinc-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl shadow-lg">
              <Bot className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-zinc-800">Agentes Autónomos</h1>
              <p className="text-sm text-zinc-500">Gestiona tus agentes de IA</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-zinc-200">
          <button
            onClick={() => setActiveTab('agents')}
            className={`px-4 py-2.5 font-medium transition-all ${
              activeTab === 'agents'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Bot size={18} />
              Mis Agentes
            </div>
          </button>
          <button
            onClick={() => {
              setActiveTab('create')
              setSelectedAgent(null)
            }}
            className={`px-4 py-2.5 font-medium transition-all ${
              activeTab === 'create'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Plus size={18} />
              Crear Agente
            </div>
          </button>
          <button
            onClick={() => {
              setActiveTab('history')
              loadExecutions()
            }}
            className={`px-4 py-2.5 font-medium transition-all ${
              activeTab === 'history'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <History size={18} />
              Historial
            </div>
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'agents' && (
          agents.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-zinc-200">
              <Bot className="mx-auto text-zinc-300 mb-4" size={64} />
              <h3 className="text-xl font-semibold text-zinc-700 mb-2">No hay agentes creados</h3>
              <p className="text-zinc-500 mb-6">Crea tu primer agente autónomo para automatizar tareas</p>
              <button
                onClick={() => setActiveTab('create')}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Crear Agente
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onExecute={handleExecuteAgent}
                  onDelete={handleDeleteAgent}
                  onToggleActive={handleToggleActive}
                  onEdit={(agent) => {
                    setSelectedAgent(agent)
                    setActiveTab('create')
                  }}
                  isExecuting={executingAgentId === agent.id}
                />
              ))}
            </div>
          )
        )}

        {activeTab === 'create' && (
          <CreateAgentForm
            agent={selectedAgent}
            onSave={() => {
              loadAgents()
              setActiveTab('agents')
              setSelectedAgent(null)
            }}
            onCancel={() => {
              setActiveTab('agents')
              setSelectedAgent(null)
            }}
          />
        )}

        {activeTab === 'history' && (
          <ExecutionHistory
            executions={executions}
            loading={loadingExecutions}
            agents={agents}
          />
        )}
      </div>
    </div>
  )
}

interface AgentCardProps {
  agent: Agent
  onExecute: (agentId: string) => void
  onDelete: (agentId: string) => void
  onToggleActive: (agent: Agent) => void
  onEdit: (agent: Agent) => void
  isExecuting: boolean
}

function AgentCard({ agent, onExecute, onDelete, onToggleActive, onEdit, isExecuting }: AgentCardProps) {
  const getScheduleLabel = () => {
    if (agent.schedule_type === 'manual') return 'Manual'
    if (agent.schedule_type === 'interval') {
      const minutes = agent.schedule_config?.minutes as number
      return `Cada ${minutes} min`
    }
    if (agent.schedule_type === 'daily') {
      const time = agent.schedule_config?.time as string
      return `Diario ${time}`
    }
    if (agent.schedule_type === 'cron') {
      return 'Cron personalizado'
    }
    return 'Desconocido'
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca'
    const date = new Date(dateStr)
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5 hover:shadow-md transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg ${agent.is_active ? 'bg-green-100' : 'bg-zinc-100'}`}>
            <Bot className={agent.is_active ? 'text-green-600' : 'text-zinc-400'} size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-zinc-800">{agent.name}</h3>
            <p className="text-xs text-zinc-500">{getScheduleLabel()}</p>
          </div>
        </div>
        <button
          onClick={() => onToggleActive(agent)}
          className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
            agent.is_active
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          {agent.is_active ? 'Activo' : 'Inactivo'}
        </button>
      </div>

      {/* Description */}
      <p className="text-sm text-zinc-600 mb-3 line-clamp-2">{agent.description}</p>

      {/* Goal */}
      <div className="mb-3 p-2 bg-blue-50 rounded-lg border border-blue-100">
        <p className="text-xs font-medium text-blue-700 mb-1">Objetivo:</p>
        <p className="text-xs text-blue-600 line-clamp-2">{agent.goal}</p>
      </div>

      {/* Tools */}
      <div className="flex flex-wrap gap-1 mb-3">
        {agent.tools.map((tool) => (
          <span
            key={tool}
            className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium"
          >
            {tool}
          </span>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div className="flex items-center gap-1 text-zinc-500">
          <Clock size={12} />
          <span>Última: {formatDate(agent.last_run_at)}</span>
        </div>
        <div className="flex items-center gap-1 text-zinc-500">
          <Calendar size={12} />
          <span>Ejecuciones: {agent.run_count}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onExecute(agent.id)}
          disabled={isExecuting}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-lg hover:from-blue-600 hover:to-indigo-600 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isExecuting ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Ejecutando...
            </>
          ) : (
            <>
              <Play size={14} />
              Ejecutar
            </>
          )}
        </button>
        <button
          onClick={() => onEdit(agent)}
          className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
          title="Editar agente"
        >
          <Edit2 size={16} />
        </button>
        <button
          onClick={() => onDelete(agent.id)}
          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          title="Eliminar agente"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}

// Componente para crear/editar agentes
interface CreateAgentFormProps {
  agent: Agent | null
  onSave: () => void
  onCancel: () => void
}

function CreateAgentForm({ agent, onSave, onCancel }: CreateAgentFormProps) {
  const [formData, setFormData] = useState({
    name: agent?.name || '',
    description: agent?.description || '',
    goal: agent?.goal || '',
    tools: agent?.tools || [],
    schedule_type: agent?.schedule_type || 'manual' as const,
    schedule_config: agent?.schedule_config || {},
  })
  const [saving, setSaving] = useState(false)

  const availableTools = [
    { id: 'web_search', label: 'Búsqueda Web', icon: Globe },
    { id: 'database', label: 'Base de Datos', icon: Database },
    { id: 'code_interpreter', label: 'Intérprete de Código', icon: Code2 },
  ]

  const toggleTool = (toolId: string) => {
    setFormData(prev => ({
      ...prev,
      tools: prev.tools.includes(toolId)
        ? prev.tools.filter(t => t !== toolId)
        : [...prev.tools, toolId]
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const method = agent ? 'PATCH' : 'POST'
      const body = agent
        ? { id: agent.id, ...formData }
        : formData

      const res = await fetch('/api/agents', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        onSave()
      } else {
        const error = await res.json()
        alert(`Error: ${error.error}`)
      }
    } catch (error) {
      console.error('Error saving agent:', error)
      alert('Error al guardar el agente')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
      <h2 className="text-2xl font-bold text-zinc-800 mb-6">
        {agent ? 'Editar Agente' : 'Crear Nuevo Agente'}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Nombre */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-2">
            Nombre del Agente
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className="w-full px-4 py-2.5 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Ej: Asistente de Investigación"
            required
          />
        </div>

        {/* Descripción */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-2">
            Descripción
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            className="w-full px-4 py-2.5 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            placeholder="Describe brevemente qué hace este agente"
            rows={3}
            required
          />
        </div>

        {/* Objetivo */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-2">
            Objetivo Principal
          </label>
          <textarea
            value={formData.goal}
            onChange={(e) => setFormData(prev => ({ ...prev, goal: e.target.value }))}
            className="w-full px-4 py-2.5 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            placeholder="Ej: Buscar noticias diarias sobre IA y resumirlas"
            rows={3}
            required
          />
        </div>

        {/* Herramientas */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-3">
            Herramientas Disponibles
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {availableTools.map((tool) => {
              const Icon = tool.icon
              const isSelected = formData.tools.includes(tool.id)
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => toggleTool(tool.id)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-zinc-200 hover:border-zinc-300'
                  }`}
                >
                  <Icon className={`mx-auto mb-2 ${isSelected ? 'text-blue-600' : 'text-zinc-400'}`} size={24} />
                  <p className={`text-sm font-medium ${isSelected ? 'text-blue-700' : 'text-zinc-600'}`}>
                    {tool.label}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Tipo de Programación */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-3">
            Programación
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { value: 'manual', label: 'Manual' },
              { value: 'interval', label: 'Intervalo' },
              { value: 'daily', label: 'Diario' },
              { value: 'cron', label: 'Cron' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, schedule_type: option.value as Agent['schedule_type'] }))}
                className={`px-4 py-2.5 rounded-lg border-2 font-medium transition-all ${
                  formData.schedule_type === option.value
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Configuración de Programación */}
        {formData.schedule_type === 'interval' && (
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-2">
              Intervalo (minutos)
            </label>
            <input
              type="number"
              min="1"
              value={(formData.schedule_config as { minutes?: number }).minutes || 60}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                schedule_config: { minutes: parseInt(e.target.value) }
              }))}
              className="w-full px-4 py-2.5 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        )}

        {formData.schedule_type === 'daily' && (
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-2">
              Hora del día
            </label>
            <input
              type="time"
              value={(formData.schedule_config as { time?: string }).time || '09:00'}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                schedule_config: { time: e.target.value }
              }))}
              className="w-full px-4 py-2.5 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        )}

        {formData.schedule_type === 'cron' && (
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-2">
              Expresión Cron
            </label>
            <input
              type="text"
              value={(formData.schedule_config as { expression?: string }).expression || '0 9 * * *'}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                schedule_config: { expression: e.target.value }
              }))}
              className="w-full px-4 py-2.5 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="0 9 * * *"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Formato: minuto hora día mes día-semana
            </p>
          </div>
        )}

        {/* Botones */}
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-zinc-300 text-zinc-700 rounded-lg hover:bg-zinc-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !formData.name || !formData.description || !formData.goal || formData.tools.length === 0}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-lg hover:from-blue-600 hover:to-indigo-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {agent ? 'Actualizar Agente' : 'Crear Agente'}
          </button>
        </div>
      </form>
    </div>
  )
}

// Componente para mostrar historial de ejecuciones
interface ExecutionHistoryProps {
  executions: AgentExecution[]
  loading: boolean
  agents: Agent[]
}

function ExecutionHistory({ executions, loading, agents }: ExecutionHistoryProps) {
  const getAgentName = (agentId: string) => {
    const agent = agents.find(a => a.id === agentId)
    return agent?.name || 'Agente desconocido'
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusColor = (status: AgentExecution['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-700 border-green-200'
      case 'failed':
        return 'bg-red-100 text-red-700 border-red-200'
      case 'running':
        return 'bg-blue-100 text-blue-700 border-blue-200'
      default:
        return 'bg-zinc-100 text-zinc-700 border-zinc-200'
    }
  }

  const getStatusLabel = (status: AgentExecution['status']) => {
    switch (status) {
      case 'completed':
        return 'Completado'
      case 'failed':
        return 'Fallido'
      case 'running':
        return 'Ejecutando'
      default:
        return status
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    )
  }

  if (executions.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-zinc-200">
        <History className="mx-auto text-zinc-300 mb-4" size={64} />
        <h3 className="text-xl font-semibold text-zinc-700 mb-2">No hay ejecuciones registradas</h3>
        <p className="text-zinc-500">Las ejecuciones de agentes aparecerán aquí</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {executions.map((execution) => (
        <div
          key={execution.id}
          className="bg-white rounded-xl shadow-sm border border-zinc-200 p-5 hover:shadow-md transition-all"
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-semibold text-zinc-800">{getAgentName(execution.agent_id)}</h3>
              <p className="text-xs text-zinc-500">{formatDate(execution.created_at)}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(execution.status)}`}>
              {getStatusLabel(execution.status)}
            </span>
          </div>

          {execution.tools_used && execution.tools_used.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {execution.tools_used.map((tool, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium"
                >
                  {tool}
                </span>
              ))}
            </div>
          )}

          {execution.result && (
            <div className="mb-3 p-3 bg-green-50 rounded-lg border border-green-100">
              <p className="text-xs font-medium text-green-700 mb-1">Resultado:</p>
              <p className="text-sm text-green-600">{execution.result}</p>
            </div>
          )}

          {execution.error && (
            <div className="mb-3 p-3 bg-red-50 rounded-lg border border-red-100">
              <p className="text-xs font-medium text-red-700 mb-1">Error:</p>
              <p className="text-sm text-red-600">{execution.error}</p>
            </div>
          )}

          {execution.execution_time_ms && (
            <div className="flex items-center gap-1 text-xs text-zinc-500">
              <Clock size={12} />
              <span>Tiempo de ejecución: {execution.execution_time_ms}ms</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

