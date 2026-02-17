import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

interface ActiveBanner {
  id: string
  title: string
  message: string
  type: 'info' | 'warning' | 'error' | 'success'
  display_mode: 'banner' | 'popup' | 'both'
  priority: number
  dismissible: boolean
  show_once: boolean
  cta_label: string | null
  cta_url: string | null
  image_url: string | null
  accent_color: string | null
}

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceRoleClient()
  const now = new Date().toISOString()

  const advancedQuery = await service
    .from('banners')
    .select('id, title, message, type, display_mode, priority, dismissible, show_once, cta_label, cta_url, image_url, accent_color')
    .eq('is_active', true)
    .or(`start_date.is.null,start_date.lte.${now}`)
    .or(`end_date.is.null,end_date.gte.${now}`)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(8)

  if (!advancedQuery.error && advancedQuery.data) {
    return NextResponse.json((advancedQuery.data as ActiveBanner[]).map((item) => ({
      ...item,
      display_mode: item.display_mode || 'banner',
      priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : 0,
      dismissible: item.dismissible ?? true,
      show_once: item.show_once ?? true,
      cta_label: item.cta_label || null,
      cta_url: item.cta_url || null,
      image_url: item.image_url || null,
      accent_color: item.accent_color || null,
    })))
  }

  // Backward-compatible fallback when popup columns are not present yet.
  const legacyQuery = await service
    .from('banners')
    .select('id, title, message, type')
    .eq('is_active', true)
    .or(`start_date.is.null,start_date.lte.${now}`)
    .or(`end_date.is.null,end_date.gte.${now}`)
    .order('created_at', { ascending: false })
    .limit(5)

  if (legacyQuery.error) return NextResponse.json({ error: legacyQuery.error.message }, { status: 500 })
  const mapped = ((legacyQuery.data || []) as Array<{
    id: string
    title: string
    message: string
    type: 'info' | 'warning' | 'error' | 'success'
  }>).map((item) => ({
    ...item,
    display_mode: 'banner' as const,
    priority: 0,
    dismissible: true,
    show_once: true,
    cta_label: null,
    cta_url: null,
    image_url: null,
    accent_color: null,
  }))
  return NextResponse.json(mapped)
}

