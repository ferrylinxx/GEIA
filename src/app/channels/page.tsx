'use client'

import { useEffect, useState } from 'react'
import { Channel } from '@/lib/types'
import ChannelList from '@/components/channels/ChannelList'
import ChannelView from '@/components/channels/ChannelView'
import BannerDisplay from '@/components/ui/BannerDisplay'
import { ArrowLeft } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from '@/i18n/LanguageContext'

export default function ChannelsPage() {
  const { t } = useTranslation()
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null)
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const channelIdParam = searchParams.get('channel')

  useEffect(() => {
    if (!channelIdParam) return

    let cancelled = false
    const loadChannelFromParam = async () => {
      try {
        const res = await fetch('/api/channels')
        if (!res.ok) return
        const list = await res.json()
        if (!Array.isArray(list)) return

        const match = list.find((item: Channel) => item.id === channelIdParam)
        if (!match || cancelled) return

        setActiveChannel(match)
        setActiveChannelId(match.id)
      } catch {
        // ignore
      }
    }

    loadChannelFromParam()
    return () => { cancelled = true }
  }, [channelIdParam])

  return (
    <div className="flex h-[100dvh] overflow-hidden relative bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-50/40">
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 hidden md:block">
        <div className="absolute top-[-18%] left-[-12%] w-[750px] h-[750px] rounded-full bg-gradient-to-br from-blue-400/50 to-cyan-300/40 blur-[90px]" style={{ animation: 'welcome-blob-1 12s ease-in-out infinite' }} />
        <div className="absolute top-[5%] right-[-18%] w-[700px] h-[700px] rounded-full bg-gradient-to-br from-violet-400/45 to-fuchsia-300/35 blur-[90px]" style={{ animation: 'welcome-blob-2 15s ease-in-out infinite' }} />
        <div className="absolute bottom-[-12%] left-[12%] w-[680px] h-[680px] rounded-full bg-gradient-to-br from-indigo-400/40 to-purple-300/35 blur-[85px]" style={{ animation: 'welcome-blob-3 13s ease-in-out infinite' }} />
      </div>

      <div className={`liquid-glass-sidebar sidebar-mobile-full flex flex-col h-full shrink-0 z-10 w-full md:w-[300px] ${activeChannel ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-3 flex items-center gap-2 border-b border-zinc-200/50">
          <button onClick={() => router.push('/chat')} className="p-1.5 hover:bg-zinc-200 rounded-lg transition-colors text-zinc-500" title={t.channels.backToChat}>
            <ArrowLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-zinc-700">📡 {t.channels.title}</span>
        </div>
        <ChannelList
          activeChannelId={activeChannelId}
          onSelectChannel={(ch) => { setActiveChannel(ch); setActiveChannelId(ch.id) }}
          onClose={() => router.push('/chat')}
          onChannelDeleted={(channelId) => {
            if (activeChannelId === channelId) {
              setActiveChannel(null)
              setActiveChannelId(null)
            }
          }}
        />
      </div>

      <div className={`flex-1 flex flex-col min-w-0 z-10 ${activeChannel ? 'flex' : 'hidden md:flex'}`}>
        <BannerDisplay />
        {activeChannel ? (
          <ChannelView channel={activeChannel} onBack={() => { setActiveChannel(null); setActiveChannelId(null) }} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <span className="text-6xl block mb-4">📡</span>
              <h2 className="text-xl font-semibold text-zinc-700 mb-2">{t.channels.selectChannel}</h2>
              <p className="text-sm text-zinc-400">{t.channels.chooseOrCreate}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
