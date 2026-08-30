const SHELL_CACHE_NAME = 'kaday-shell-v2'
const RUNTIME_CACHE_NAME = 'kaday-runtime-v2'
const ACTIVE_CACHE_NAMES = new Set([SHELL_CACHE_NAME, RUNTIME_CACHE_NAME])
const APP_SHELL = [
  '/coffee-pwa/',
  '/coffee-pwa/manifest.webmanifest',
  '/coffee-pwa/icons/icon.svg',
  '/coffee-pwa/icons/icon-192.png',
  '/coffee-pwa/icons/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => !ACTIVE_CACHE_NAMES.has(key))
          .map((key) => caches.delete(key)),
      )),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request

  if (request.method !== 'GET') return

  const url = new URL(request.url)

  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const copy = response.clone()
            await Promise.all([
              clearRuntimeCache(),
              caches.open(SHELL_CACHE_NAME).then((cache) => cache.put('/coffee-pwa/', copy)),
            ])
          }
          return response
        })
        .catch(() => caches.match('/coffee-pwa/')),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached

      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(RUNTIME_CACHE_NAME).then((cache) => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})

function clearRuntimeCache() {
  return caches.open(RUNTIME_CACHE_NAME).then(async (cache) => {
    const requests = await cache.keys()
    await Promise.all(requests.map((request) => cache.delete(request)))
  })
}
