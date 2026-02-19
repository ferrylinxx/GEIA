// Service Worker para PWA de GEIA
const CACHE_NAME = 'geia-v1'
const RUNTIME_CACHE = 'geia-runtime-v1'

// Recursos para cachear en instalación
const PRECACHE_URLS = [
  '/',
  '/logo.png',
  '/manifest.json',
]

// Instalación del Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...')
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Precaching resources')
        return cache.addAll(PRECACHE_URLS)
      })
      .then(() => self.skipWaiting())
  )
})

// Activación del Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...')
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name)
            return caches.delete(name)
          })
      )
    }).then(() => self.clients.claim())
  )
})

// Estrategia de caché: Network First con fallback a Cache
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Solo cachear requests GET
  if (request.method !== 'GET') return

  // No cachear API calls (excepto algunas específicas)
  if (url.pathname.startsWith('/api/')) {
    // Cachear solo endpoints de configuración
    if (url.pathname.includes('/api/public/app-settings') || 
        url.pathname.includes('/api/models')) {
      event.respondWith(networkFirstStrategy(request))
    }
    return
  }

  // Cachear assets estáticos
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|woff|woff2|ttf|eot)$/)) {
    event.respondWith(cacheFirstStrategy(request))
    return
  }

  // Para todo lo demás, Network First
  event.respondWith(networkFirstStrategy(request))
})

// Estrategia: Network First (intenta red, fallback a caché)
async function networkFirstStrategy(request) {
  const cache = await caches.open(RUNTIME_CACHE)
  
  try {
    const networkResponse = await fetch(request)
    
    // Cachear respuestas exitosas
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone())
    }
    
    return networkResponse
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url)
    const cachedResponse = await cache.match(request)
    
    if (cachedResponse) {
      return cachedResponse
    }
    
    // Si no hay caché, retornar página offline
    if (request.destination === 'document') {
      return cache.match('/')
    }
    
    throw error
  }
}

// Estrategia: Cache First (intenta caché, fallback a red)
async function cacheFirstStrategy(request) {
  const cache = await caches.open(RUNTIME_CACHE)
  const cachedResponse = await cache.match(request)
  
  if (cachedResponse) {
    return cachedResponse
  }
  
  try {
    const networkResponse = await fetch(request)
    
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone())
    }
    
    return networkResponse
  } catch (error) {
    console.error('[SW] Fetch failed:', error)
    throw error
  }
}

// Push Notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event)
  
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'GEIA'
  const options = {
    body: data.body || 'Tienes una nueva notificación',
    icon: '/logo.png',
    badge: '/logo.png',
    vibrate: [200, 100, 200],
    data: data.data || {},
    actions: data.actions || [
      { action: 'open', title: 'Abrir' },
      { action: 'close', title: 'Cerrar' }
    ]
  }
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  )
})

// Notification Click
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event)
  event.notification.close()
  
  const urlToOpen = event.notification.data?.url || '/'
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Si ya hay una ventana abierta, enfocarla
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus()
          }
        }
        
        // Si no, abrir nueva ventana
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen)
        }
      })
  )
})

// Background Sync (para enviar mensajes offline)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag)
  
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages())
  }
})

async function syncMessages() {
  // Aquí iría la lógica para sincronizar mensajes pendientes
  console.log('[SW] Syncing messages...')
}

