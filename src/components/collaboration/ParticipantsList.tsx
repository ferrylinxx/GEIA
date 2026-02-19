'use client'

import { useState, useEffect } from 'react'
import { Users, UserPlus, Crown, Edit, Eye, X } from 'lucide-react'

interface Participant {
  id: string
  user_id: string
  role: string
  can_read: boolean
  can_write: boolean
  can_invite: boolean
  is_active: boolean
  user?: {
    id: string
    name: string
    email: string
    avatar_url?: string
  }
}

interface ParticipantsListProps {
  conversationId: string
  currentUserId?: string
  canInvite?: boolean
}

export default function ParticipantsList({ conversationId, currentUserId, canInvite }: ParticipantsListProps) {
  const [participants, setParticipants] = useState<Participant[]>([])
  const [showInvite, setShowInvite] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadParticipants()
  }, [conversationId])

  const loadParticipants = async () => {
    try {
      const { data } = await fetch(`/api/conversations/${conversationId}/participants`).then(r => r.json())
      if (data) {
        setParticipants(data)
      }
    } catch (error) {
      console.error('Error loading participants:', error)
    } finally {
      setLoading(false)
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <Crown className="w-4 h-4 text-yellow-500" />
      case 'editor':
        return <Edit className="w-4 h-4 text-blue-500" />
      default:
        return <Eye className="w-4 h-4 text-gray-500" />
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner':
        return 'Propietario'
      case 'editor':
        return 'Editor'
      default:
        return 'Visualizador'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-purple-500" />
          <h3 className="font-semibold text-white">
            Participantes ({participants.length})
          </h3>
        </div>
        {canInvite && (
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors text-sm"
          >
            <UserPlus className="w-4 h-4" />
            Invitar
          </button>
        )}
      </div>

      {/* Participants list */}
      <div className="space-y-2">
        {participants.map(participant => (
          <div
            key={participant.id}
            className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
          >
            <div className="flex items-center gap-3">
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold">
                {participant.user?.name?.[0]?.toUpperCase() || 'U'}
              </div>

              {/* Info */}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white">
                    {participant.user?.name || 'Usuario'}
                  </span>
                  {participant.user_id === currentUserId && (
                    <span className="text-xs text-purple-400">(Tú)</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-white/60">
                  {getRoleIcon(participant.role)}
                  <span>{getRoleLabel(participant.role)}</span>
                </div>
              </div>
            </div>

            {/* Permissions badges */}
            <div className="flex items-center gap-2">
              {participant.can_write && (
                <span className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded">
                  Escribir
                </span>
              )}
              {participant.can_invite && (
                <span className="px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded">
                  Invitar
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Invite modal (placeholder) */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-white/10 rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Invitar participante</h3>
              <button onClick={() => setShowInvite(false)}>
                <X className="w-5 h-5 text-white/60 hover:text-white" />
              </button>
            </div>
            <p className="text-white/60 text-sm">
              Funcionalidad de invitación en desarrollo...
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

