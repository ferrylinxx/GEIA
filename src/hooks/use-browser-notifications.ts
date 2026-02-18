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
    if (!enabled) {
      // User wants to enable notifications
      if (permission === 'granted') {
        setEnabled(true)
        localStorage.setItem('geia-browser-notifications', 'true')
        return true
      } else if (permission === 'default') {
        // Request permission
        return await requestPermission()
      } else {
        // Permission denied, can't enable
        return false
      }
    } else {
      // User wants to disable notifications
      setEnabled(false)
      localStorage.setItem('geia-browser-notifications', 'false')
      return true
    }
  }, [enabled, permission, requestPermission])

  const showNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (!enabled || permission !== 'granted') return

    try {
      const notification = new Notification(title, {
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        ...options,
      })

      // Auto-close after 5 seconds
      setTimeout(() => {
        notification.close()
      }, 5000)

      return notification
    } catch (error) {
      console.error('Error showing notification:', error)
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

