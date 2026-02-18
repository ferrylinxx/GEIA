'use client'

import { useState, useEffect } from 'react'
import { Globe, Database, HardDrive, ImagePlus, FlaskConical, FileText, BarChart3, Code2, Loader2, ChevronDown, Chrome } from 'lucide-react'

interface Role {
  id: string
  name: string
}

interface ToolDefinition {
  id: string
  name: string
  description: string
  icon: typeof Globe
  color: string
}

const TOOLS: ToolDefinition[] = [
  { id: 'web_search', name: 'Búsqueda Web', description: 'Buscar información en internet', icon: Globe, color: 'text-blue-500' },
  { id: 'db_query', name: 'Consulta BD', description: 'Consultar bases de datos', icon: Database, color: 'text-indigo-500' },
  { id: 'network_drive_rag', name: 'Unidad de Red', description: 'Acceder a archivos de red', icon: HardDrive, color: 'text-emerald-500' },
  { id: 'image_generation', name: 'Generar Imagen', description: 'Crear imágenes con IA', icon: ImagePlus, color: 'text-purple-500' },
  { id: 'deep_research', name: 'Investigación Profunda', description: 'Análisis detallado de temas', icon: FlaskConical, color: 'text-amber-500' },
  { id: 'browser_agent', name: 'Navegador Autónomo', description: 'Control de navegador con IA', icon: Chrome, color: 'text-violet-500' },
  { id: 'document_generation', name: 'Generar Documento', description: 'Crear documentos automáticamente', icon: FileText, color: 'text-sky-500' },
  { id: 'spreadsheet_analysis', name: 'Análisis de Hojas', description: 'Analizar hojas de cálculo', icon: BarChart3, color: 'text-cyan-500' },
  { id: 'code_interpreter', name: 'Intérprete de Código', description: 'Ejecutar código Python', icon: Code2, color: 'text-rose-500' },
]

export default function ToolsManagement() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTool, setSelectedTool] = useState<ToolDefinition | null>(null)
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void loadRoles()
  }, [])

  const loadRoles = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/roles')
      if (res.ok) {
        const data = await res.json()
        setRoles(data.roles || [])
      }
    } catch (error) {
      console.error('Error loading roles:', error)
    }
    setLoading(false)
  }

  const openToolForm = async (tool: ToolDefinition) => {
    setSelectedTool(tool)
    setDropdownOpen(false)

    // Load existing permissions for this tool
    try {
      const res = await fetch(`/api/admin/roles/permissions?resource_type=tool&tool_id=${tool.id}`)
      if (res.ok) {
        const data = await res.json()
        const roleIds = data.permissions.map((p: { role_id: string }) => p.role_id)
        setSelectedRoles(roleIds)
      }
    } catch (error) {
      console.error('Error loading tool permissions:', error)
    }
  }

  const saveToolPermissions = async () => {
    if (!selectedTool) return
    setSaving(true)
    try {
      // Delete existing permissions for this specific tool
      await fetch('/api/admin/roles/permissions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_type: 'tool', tool_id: selectedTool.id }),
      })

      // Insert new permissions
      if (selectedRoles.length > 0) {
        const permissions = selectedRoles.map(roleId => ({
          role_id: roleId,
          resource_type: 'tool',
          resource_id: null, // NULL for tools, we use meta_json instead
          can_view: true,
          meta_json: { tool_id: selectedTool.id }, // Store tool ID in meta_json
        }))

        await fetch('/api/admin/roles/permissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissions }),
        })
      }

      alert('Permisos guardados correctamente')
      setSelectedTool(null)
      setSelectedRoles([])
    } catch (error) {
      console.error('Error saving permissions:', error)
      alert('Error al guardar permisos')
    }
    setSaving(false)
  }

  const toggleRole = (roleId: string) => {
    setSelectedRoles(prev =>
      prev.includes(roleId) ? prev.filter(id => id !== roleId) : [...prev, roleId]
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-zinc-800 mb-1">Herramientas y Funciones ({TOOLS.length})</h2>
        <p className="text-sm text-zinc-500">Asigna qué roles pueden usar cada herramienta</p>
      </div>

      {/* Tool Form Modal */}
      {selectedTool && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center`}>
                <selectedTool.icon size={24} className={selectedTool.color} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-zinc-800">{selectedTool.name}</h3>
                <p className="text-sm text-zinc-500">{selectedTool.description}</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-zinc-700 mb-2">Roles con acceso</label>
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm text-left flex items-center justify-between hover:border-zinc-400 transition-colors"
                >
                  <span className="text-zinc-700">
                    {selectedRoles.length === 0 ? 'Seleccionar roles...' : `${selectedRoles.length} rol(es) seleccionado(s)`}
                  </span>
                  <ChevronDown size={16} className={`text-zinc-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {dropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                    {roles.map(role => (
                      <label key={role.id} className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedRoles.includes(role.id)}
                          onChange={() => toggleRole(role.id)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span className="text-sm text-zinc-700">{role.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                💡 Solo los roles seleccionados podrán usar esta herramienta. Los admins siempre tienen acceso a todas.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={saveToolPermissions}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                Guardar
              </button>
              <button
                onClick={() => setSelectedTool(null)}
                className="px-4 py-2 bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tools Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon
          return (
            <div
              key={tool.id}
              onClick={() => openToolForm(tool)}
              className="flex items-center gap-3 px-4 py-3 bg-white border border-zinc-200 rounded-xl transition-all hover:border-blue-300 hover:shadow-md cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Icon size={24} className={tool.color} />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-zinc-800">{tool.name}</h3>
                <p className="text-sm text-zinc-500">{tool.description}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

