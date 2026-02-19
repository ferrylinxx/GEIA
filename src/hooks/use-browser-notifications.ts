import { useEffect, useState, useCallback } from 'react'

export function useBrowserNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    
    // Get current permission
    setPermission(Notification.permission)
    
    // Get user preference from localStorage
    const savedPreference = localStorage.getItem('geia-browser-notifications')
    setEnabled(savedPreference === 'true')
  }, [])

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

      // Auto-close after 8 seconds
      setTimeout(() => {
        notification.close()
        console.log('[Notifications] Notification closed')
      }, 8000)

      return notification
    } catch (error) {
      console.error('[Notifications] Error showing notification:', error)
    }
  }, [enabled, permission])

  return {
    permission,
    enabled,
    requestPermission,
    toggleNotifications,
    showNotification,
    isSupported: typeof window !== 'undefined' && 'Notification' in window,
  }
}

