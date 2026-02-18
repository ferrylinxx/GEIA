'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Minimize2, Maximize2, Search, Brain, BarChart3, CheckCircle2, Loader2, GripVertical, Globe, FileText, Sparkles, Link2, Camera, Chrome } from 'lucide-react'

interface ResearchEvent {
  type: 'search' | 'planning' | 'followup' | 'ranking' | 'images' | 'complete' | 'web_access' | 'analyzing' | 'extracting' | 'browser_init' | 'browser_close' | 'browser_error' | 'screenshot'
  message: string
  data?: unknown
  timestamp: number
  url?: string
  progress?: number
  screenshot?: string
}

interface DeepResearchFloatingWindowProps {
  isActive: boolean
  onClose: () => void
}

export default function DeepResearchFloatingWindow({ isActive, onClose }: DeepResearchFloatingWindowProps) {
  const [position, setPosition] = useState({ x: window.innerWidth - 420, y: 100 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isMinimized, setIsMinimized] = useState(false)
  const [events, setEvents] = useState<ResearchEvent[]>([])
  const eventsEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (!isMinimized) {
      eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [events, isMinimized])

  // Listen for research events from SSE
  useEffect(() => {
    const handleResearchEvent = (event: CustomEvent) => {
      const { type, message, data, url, progress, screenshot } = event.detail
      setEvents(prev => [...prev, {
        type,
        message,
        data,
        url,
        progress,
        screenshot,
        timestamp: Date.now()
      }])
    }

    window.addEventListener('research-event' as any, handleResearchEvent)
    return () => {
      window.removeEventListener('research-event' as any, handleResearchEvent)
    }
  }, [])

  // Reset events when research starts
  useEffect(() => {
    if (isActive) {
      setEvents([])
      setIsMinimized(false)
    }
  }, [isActive])

  // Dragging logic
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.no-drag')) return
    setIsDragging(true)
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    })
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: Math.max(0, Math.min(window.innerWidth - 400, e.clientX - dragOffset.x)),
          y: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.y))
        })
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragOffset])

  if (!isActive) return null

  const getEventIcon = (type: ResearchEvent['type']) => {
    switch (type) {
      case 'search': return <Search size={14} className="text-blue-500" />
      case 'planning': return <Brain size={14} className="text-purple-500" />
      case 'followup': return <Search size={14} className="text-indigo-500" />
      case 'ranking': return <BarChart3 size={14} className="text-orange-500" />
      case 'images': return <Search size={14} className="text-pink-500" />
      case 'complete': return <CheckCircle2 size={14} className="text-emerald-500" />
      case 'web_access': return <Globe size={14} className="text-cyan-500" />
      case 'analyzing': return <Sparkles size={14} className="text-violet-500 animate-pulse" />
      case 'extracting': return <FileText size={14} className="text-amber-500" />
      case 'browser_init': return <Chrome size={14} className="text-blue-600" />
      case 'browser_close': return <Chrome size={14} className="text-zinc-500" />
      case 'browser_error': return <X size={14} className="text-red-500" />
      case 'screenshot': return <Camera size={14} className="text-green-500" />
      default: return <Loader2 size={14} className="text-zinc-400 animate-spin" />
    }
  }

  const getEventColor = (type: ResearchEvent['type']) => {
    switch (type) {
      case 'search': return 'bg-blue-50 border-blue-200 text-blue-700'
      case 'planning': return 'bg-purple-50 border-purple-200 text-purple-700'
      case 'followup': return 'bg-indigo-50 border-indigo-200 text-indigo-700'
      case 'ranking': return 'bg-orange-50 border-orange-200 text-orange-700'
      case 'images': return 'bg-pink-50 border-pink-200 text-pink-700'
      case 'complete': return 'bg-emerald-50 border-emerald-200 text-emerald-700'
      case 'web_access': return 'bg-cyan-50 border-cyan-200 text-cyan-700'
      case 'analyzing': return 'bg-violet-50 border-violet-200 text-violet-700'
      case 'extracting': return 'bg-amber-50 border-amber-200 text-amber-700'
      case 'browser_init': return 'bg-blue-50 border-blue-200 text-blue-700'
      case 'browser_close': return 'bg-zinc-50 border-zinc-200 text-zinc-700'
      case 'browser_error': return 'bg-red-50 border-red-200 text-red-700'
      case 'screenshot': return 'bg-green-50 border-green-200 text-green-700'
      default: return 'bg-zinc-50 border-zinc-200 text-zinc-700'
    }
  }

  return (
    <div
      className="fixed z-50 bg-white rounded-xl shadow-2xl border border-zinc-200 overflow-hidden"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: '400px',
        maxHeight: isMinimized ? '60px' : '500px',
        transition: isDragging ? 'none' : 'max-height 0.3s ease'
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white cursor-move select-none"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <GripVertical size={16} className="text-white/60" />
          <Brain size={16} />
          <span className="text-sm font-semibold">Deep Research</span>
          {events.length > 0 && !isMinimized && (
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{events.length}</span>
          )}
        </div>
        <div className="flex items-center gap-1 no-drag">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:bg-white/20 rounded transition-colors"
          >
            {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/20 rounded transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      {!isMinimized && (
        <div className="p-4 max-h-[440px] overflow-y-auto">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-zinc-400">
              <Loader2 size={32} className="animate-spin mb-2" />
              <p className="text-sm">Iniciando investigación...</p>
            </div>
          ) : (
            <div className="space-y-2">
              {events.map((event, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border ${getEventColor(event.type)} text-xs animate-in fade-in slide-in-from-left-2 duration-200`}
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5">{getEventIcon(event.type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{event.message}</p>

                      {/* Show URL if present */}
                      {event.url ? (
                        <a
                          href={event.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 mt-1 text-[10px] opacity-70 hover:opacity-100 hover:underline"
                        >
                          <Link2 size={10} />
                          <span className="truncate">{event.url}</span>
                        </a>
                      ) : null}

                      {/* Show progress bar if present */}
                      {typeof event.progress === 'number' ? (
                        <div className="mt-2">
                          <div className="w-full bg-white/50 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full bg-current transition-all duration-300"
                              style={{ width: `${event.progress}%` }}
                            />
                          </div>
                          <p className="text-[10px] opacity-50 mt-0.5">{event.progress}%</p>
                        </div>
                      ) : null}

                      {/* Show screenshot if present */}
                      {event.screenshot ? (
                        <div className="mt-2">
                          <img
                            src={`data:image/png;base64,${event.screenshot}`}
                            alt="Screenshot"
                            className="w-full rounded border border-current/20 cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => window.open(`data:image/png;base64,${event.screenshot}`, '_blank')}
                          />
                        </div>
                      ) : null}

                      {event.data && !event.url && !event.progress && !event.screenshot ? (
                        <pre className="mt-1 text-[10px] opacity-70 overflow-x-auto">
                          {JSON.stringify(event.data, null, 2)}
                        </pre>
                      ) : null}
                      <p className="text-[10px] opacity-50 mt-1">
                        {new Date(event.timestamp).toLocaleTimeString('es-ES')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={eventsEndRef} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

