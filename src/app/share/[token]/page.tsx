'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import Image from 'next/image'
import { Eye, Calendar, User, MessageSquare, ExternalLink } from 'lucide-react'

interface SharedMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  model?: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meta_json?: Record<string, any>
  created_at: string
}

interface SharedData {
  conversation: { id: string; title: string; created_at: string }
  messages: SharedMessage[]
  shared_by: string
  shared_at: string
  view_count: number
}

export default function SharedChatPage() {
  const params = useParams()
  const token = params.token as string
  const [data, setData] = useState<SharedData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    fetch(`/api/share?token=${token}`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.json() })
      .then(setData)
      .catch(() => setError('Este enlace no existe o ha expirado.'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-500">
          <div className="w-5 h-5 border-2 border-zinc-300 border-t-blue-500 rounded-full animate-spin" />
          Cargando conversación...
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-5xl">🔗</div>
          <h1 className="text-xl font-semibold text-zinc-800">Enlace no válido</h1>
          <p className="text-zinc-500 text-sm">{error || 'No se encontró la conversación.'}</p>
          <a href="/" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline">
            <ExternalLink size={14} /> Ir a GIA
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-white border border-zinc-200 flex items-center justify-center">
              <Image src="/logo.png" alt="GIA" width={28} height={28} className="object-contain" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-zinc-800 truncate max-w-[300px]">{data.conversation.title}</h1>
              <div className="flex items-center gap-3 text-[11px] text-zinc-400">
                <span className="flex items-center gap-1"><User size={10} /> {data.shared_by}</span>
                <span className="flex items-center gap-1"><Calendar size={10} /> {new Date(data.shared_at).toLocaleDateString('es-ES')}</span>
                <span className="flex items-center gap-1"><Eye size={10} /> {data.view_count}</span>
                <span className="flex items-center gap-1"><MessageSquare size={10} /> {data.messages.length}</span>
              </div>
            </div>
          </div>
          <a href="/" className="text-xs text-blue-600 hover:text-blue-700 font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
            Abrir GIA
          </a>
        </div>
      </header>

      {/* Messages */}
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {data.messages.filter(m => m.role !== 'system').map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 shrink-0 rounded-lg overflow-hidden bg-white border border-zinc-200 flex items-center justify-center mt-0.5">
                <Image src="/logo.png" alt="GIA" width={28} height={28} className="object-contain" />
              </div>
            )}
            <div className={`max-w-[85%] ${msg.role === 'user'
              ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 shadow-md shadow-blue-500/20'
              : 'flex-1'
            }`}>
              {msg.role === 'assistant' && msg.model && (
                <span className="text-xs font-medium text-zinc-400 mb-1 block">{msg.model}</span>
              )}
              <div className={`prose max-w-none leading-relaxed ${msg.role === 'user' ? 'text-sm prose-invert prose-p:my-1' : 'text-base'}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{msg.content}</ReactMarkdown>
              </div>
              {msg.role === 'assistant' && msg.meta_json?.image_url && (
                <div className="mt-3 mb-2">
                  <a href={msg.meta_json.image_url as string} target="_blank" rel="noopener noreferrer" className="block">
                    <img src={msg.meta_json.image_url as string} alt="Imagen generada" className="rounded-xl shadow-lg max-w-full w-auto max-h-[512px] border border-zinc-200" />
                  </a>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Footer */}
        <div className="text-center py-8 border-t border-zinc-200 mt-8">
          <p className="text-xs text-zinc-400">Conversación compartida desde <strong>GIA</strong> — Gestión Empresarial con IA</p>
        </div>
      </main>
    </div>
  )
}

