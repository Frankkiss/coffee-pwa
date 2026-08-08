export const syncDatabaseName = 'kaday-offline-cache'
export const syncDatabaseVersion = 3

export const syncStoreNames = {
  beans: 'beans',
  brewLogs: 'brewLogs',
  brewTemplates: 'brewTemplates',
  userSettings: 'userSettings',
  aiRecommendations: 'aiRecommendations',
  outbox: 'outbox',
  syncMeta: 'syncMeta',
  migrationMeta: 'migrationMeta',
} as const

export function entityKey(userId: string, entityId: string) {
  return `${userId}:${entityId}`
}

export function openSyncDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'))
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(syncDatabaseName, syncDatabaseVersion)
    let settled = false

    request.onupgradeneeded = () => {
      const database = request.result
      for (const storeName of Object.values(syncStoreNames)) {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: 'key' })
        }
      }
      if (!database.objectStoreNames.contains('snapshots')) {
        database.createObjectStore('snapshots')
      }
      if (!database.objectStoreNames.contains('pendingMutations')) {
        database.createObjectStore('pendingMutations', { keyPath: 'id' })
      }
    }

    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => database.close()
      if (settled) {
        database.close()
        return
      }
      settled = true
      resolve(database)
    }

    request.onerror = () => {
      if (!settled) {
        settled = true
        reject(request.error ?? new Error('IndexedDB open failed'))
      }
    }

    request.onblocked = () => {
      if (!settled) {
        settled = true
        reject(new Error('IndexedDB open blocked'))
      }
    }
  })
}
