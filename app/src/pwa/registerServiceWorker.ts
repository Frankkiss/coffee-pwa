export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return
  }

  window.addEventListener('load', () => {
    const serviceWorkerUrl = `${import.meta.env.BASE_URL}sw.js`
    navigator.serviceWorker.register(serviceWorkerUrl).catch(() => {
      // The app remains usable without offline shell caching.
    })
  })
}
