'use client'

import { useState, useEffect } from 'react'
import { Brain, Plus, Tag, Trash2 } from 'lucide-react'

interface Category {
  id: string
  name: string
  description?: string
  color?: string
  icon?: string
  memory_count: number
  created_at: string
}

export default function MemoryCategories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newCategory, setNewCategory] = useState({
    name: '',
    description: '',
    color: '#8B5CF6',
    icon: '🧠'
  })

  useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async () => {
    try {
      const { data } = await fetch('/api/memory/categories').then(r => r.json())
      if (data) {
        setCategories(data)
      }
    } catch (error) {
      console.error('Error loading categories:', error)
    } finally {
      setLoading(false)
    }
  }

  const createCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await fetch('/api/memory/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCategory)
      })
      setNewCategory({ name: '', description: '', color: '#8B5CF6', icon: '🧠' })
      setShowCreate(false)
      loadCategories()
    } catch (error) {
      console.error('Error creating category:', error)
    }
  }

  const ICON_OPTIONS = ['🧠', '💡', '📚', '🎯', '⭐', '🔥', '💼', '🎨', '🔬', '🎓']
  const COLOR_OPTIONS = [
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Orange
    '#EF4444', // Red
    '#06B6D4', // Cyan
    '#8B5CF6', // Violet
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-6 h-6 text-purple-500" />
          <h2 className="text-xl font-bold text-white">Categorías de Memoria</h2>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nueva Categoría
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={createCategory} className="bg-white/5 border border-white/10 rounded-lg p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">Nombre</label>
              <input
                type="text"
                value={newCategory.name}
                onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                required
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-500"
                placeholder="Ej: Preferencias del Usuario"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">Descripción</label>
              <input
                type="text"
                value={newCategory.description}
                onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-500"
                placeholder="Opcional"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">Icono</label>
              <div className="flex gap-2">
                {ICON_OPTIONS.map(icon => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setNewCategory({ ...newCategory, icon })}
                    className={`p-2 rounded-lg text-2xl transition-all ${
                      newCategory.icon === icon
                        ? 'bg-purple-600 scale-110'
                        : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">Color</label>
              <div className="flex gap-2">
                {COLOR_OPTIONS.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewCategory({ ...newCategory, color })}
                    className={`w-8 h-8 rounded-full transition-all ${
                      newCategory.color === color ? 'ring-2 ring-white scale-110' : ''
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-colors"
          >
            Crear Categoría
          </button>
        </form>
      )}

      {/* Categories list */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map(category => (
          <div
            key={category.id}
            className="bg-white/5 border border-white/10 rounded-lg p-4 hover:border-purple-500/50 transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl"
                  style={{ backgroundColor: `${category.color}20`, border: `1px solid ${category.color}40` }}
                >
                  {category.icon || '🧠'}
                </div>
                <div>
                  <h3 className="font-semibold text-white">{category.name}</h3>
                  <p className="text-sm text-white/60">{category.memory_count || 0} memorias</p>
                </div>
              </div>
            </div>
            {category.description && (
              <p className="text-sm text-white/60 line-clamp-2">{category.description}</p>
            )}
          </div>
        ))}
      </div>

      {categories.length === 0 && !showCreate && (
        <div className="text-center text-white/60 p-12 bg-white/5 border border-white/10 rounded-lg">
          No hay categorías creadas. Crea una para empezar.
        </div>
      )}
    </div>
  )
}

