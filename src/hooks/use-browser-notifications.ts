import { useEffect, useState, useCallback } from 'react'

interface NotificationSettings {
  sound_url: string | null
  duration_seconds: number
}

const DEFAULT_SETTINGS: NotificationSettings = {
  sound_url: null,
  duration_seconds: 5
}

export function useBrowserNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [enabled, setEnabled] = useState(false)
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS)

  // Load notification settings from Supabase
  const loadSettings = useCallback(async () => {
    try {
      console.log('[Notifications] Loading settings from server...')
      const res = await fetch('/api/public/app-settings', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      })

      if (!res.ok) {
        console.error('[Notifications] Failed to load from server')
        return
      }

      const data = await res.json()
      const notifSettings = data.notification_sound || DEFAULT_SETTINGS

      console.log('[Notifications] Settings loaded from server:', notifSettings)
      setSettings({
        sound_url: notifSettings.sound_url || null,
        duration_seconds: notifSettings.duration_seconds || 5
      })
    } catch (err) {
      console.error('[Notifications] Error loading settings:', err)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return

    // Get current permission
    setPermission(Notification.permission)

    // Get user preference from localStorage
    const savedPreference = localStorage.getItem('geia-browser-notifications')
    setEnabled(savedPreference === 'true')

    // Load settings from Supabase
    void loadSettings()
  }, [loadSettings])

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false
    }

    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      
      if (result === 'granted') {
        setEnabled(true)
        localStorage.setItem('geia-browser-notifications', 'true')
        return true
      }
      
      return false
    } catch (error) {
      console.error('Error requesting notification permission:', error)
      return false
    }
  }, [])

  const toggleNotifications = useCallback(async () => {
    console.log('[Notifications] Toggle clicked. Current state:', { enabled, permission })

    if (!enabled) {
      // User wants to enable notifications
      if (permission === 'granted') {
        console.log('[Notifications] Permission already granted, enabling...')
        setEnabled(true)
        localStorage.setItem('geia-browser-notifications', 'true')

        // Show test notification
        try {
          new Notification('🎉 Notificaciones activadas', {
            body: 'Recibirás notificaciones cuando GEIA termine de responder',
            icon: '/logo.png',
            badge: '/logo.png',
          })
        } catch (e) {
          console.error('[Notifications] Error showing test notification:', e)
        }

        return true
      } else if (permission === 'default') {
        // Request permission
        console.log('[Notifications] Requesting permission...')
        const granted = await requestPermission()

        if (granted) {
          // Show test notification
          try {
            new Notification('🎉 Notificaciones activadas', {
              body: 'Recibirás notificaciones cuando GEIA termine de responder',
              icon: '/logo.png',
              badge: '/logo.png',
            })
          } catch (e) {
            console.error('[Notifications] Error showing test notification:', e)
          }
        }

        return granted
      } else {
        // Permission denied, can't enable
        console.log('[Notifications] Permission denied by user')
        alert('⚠️ Las notificaciones están bloqueadas.\n\nPara activarlas:\n1. Haz clic en el icono de candado/información en la barra de direcciones\n2. Busca "Notificaciones"\n3. Cambia a "Permitir"')
        return false
      }
    } else {
      // User wants to disable notifications
      console.log('[Notifications] Disabling notifications...')
      setEnabled(false)
      localStorage.setItem('geia-browser-notifications', 'false')
      return true
    }
  }, [enabled, permission, requestPermission])

  const showNotification = useCallback((title: string, options?: NotificationOptions) => {
    console.log('[Notifications] showNotification called:', { title, enabled, permission })

    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.log('[Notifications] Notifications not supported in this browser')
      return
    }

    if (!enabled) {
      console.log('[Notifications] Notifications are disabled by user')
      return
    }

    if (permission !== 'granted') {
      console.log('[Notifications] Permission not granted:', permission)
      return
    }

    try {
      console.log('[Notifications] Creating notification...')
      const notification = new Notification(title, {
        icon: '/logo.png',
        badge: '/logo.png',
        ...options,
      })

      console.log('[Notifications] Notification created successfully')

      // Play sound if configured
      if (settings.sound_url && settings.sound_url !== null && settings.sound_url.trim() !== '') {
        try {
          console.log('[Notifications] Playing sound:', settings.sound_url, 'Duration:', settings.duration_seconds, 'seconds')
          const audio = new Audio(settings.sound_url)
          audio.volume = 0.5

          // Play the audio
          audio.play().catch(err => {
            console.error('[Notifications] Error playing sound:', err)
          })

          // Stop the audio after duration_seconds
          const durationMs = (settings.duration_seconds || 5) * 1000
          setTimeout(() => {
            audio.pause()
            audio.currentTime = 0
            console.log('[Notifications] Sound stopped after', settings.duration_seconds, 'seconds')
          }, durationMs)
        } catch (err) {
          console.error('[Notifications] Error creating audio:', err)
        }
      } else {
        console.log('[Notifications] No sound configured, skipping audio playback')
      }

      // Auto-close after configured duration
      const duration = (settings.duration_seconds || 5) * 1000
      setTimeout(() => {
        notification.close()
        console.log('[Notifications] Notification closed')
      }, duration)

      return notification
    } catch (error) {
      console.error('[Notifications] Error showing notification:', error)
    }
  }, [enabled, permission, settings])

  return {
    permission,
    enabled,
    settings,
    requestPermission,
    toggleNotifications,
    showNotification,
    loadSettings,
    isSupported: typeof window !== 'undefined' && 'Notification' in window,
  }
}

