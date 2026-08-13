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

type OpenWaiter = {
  resolve: (database: IDBDatabase) => void
  reject: (error: Error | DOMException) => void
}

type InFlightOpen = {
  blockedError: Error | null
  waiters: OpenWaiter[]
}

let inFlightOpen: InFlightOpen | null = null

export function openSyncDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'))
  }

  return new Promise((resolve, reject) => {
    if (inFlightOpen !== null) {
      if (inFlightOpen.blockedError !== null) {
        reject(inFlightOpen.blockedError)
      } else {
        inFlightOpen.waiters.push({ resolve, reject })
      }
      return
    }

    const state: InFlightOpen = {
      blockedError: null,
      waiters: [{ resolve, reject }],
    }
    inFlightOpen = state
    let request: IDBOpenDBRequest

    try {
      request = indexedDB.open(syncDatabaseName, syncDatabaseVersion)
    } catch (error) {
      inFlightOpen = null
      reject(normalizeOpenError(error))
      return
    }

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
      if (state.blockedError !== null) {
        database.close()
        if (inFlightOpen === state) {
          inFlightOpen = null
        }
        return
      }

      const [firstWaiter, ...queuedWaiters] = state.waiters
      state.waiters = []
      if (inFlightOpen === state) {
        inFlightOpen = null
      }
      firstWaiter?.resolve(database)
      for (const waiter of queuedWaiters) {
        openSyncDatabase().then(waiter.resolve, waiter.reject)
      }
    }

    request.onerror = () => {
      const error = request.error ?? new Error('IndexedDB open failed')
      const waiters = state.waiters
      state.waiters = []
      if (inFlightOpen === state) {
        inFlightOpen = null
      }
      for (const waiter of waiters) {
        waiter.reject(error)
      }
    }

    request.onblocked = () => {
      const error = new Error('IndexedDB open blocked')
      state.blockedError = error
      const waiters = state.waiters
      state.waiters = []
      for (const waiter of waiters) {
        waiter.reject(error)
      }
    }
  })
}

export class SyncCacheUnavailableError extends Error {
  readonly code = 'SYNC_CACHE_UNAVAILABLE'

  constructor() {
    super('Existing sync cache is unavailable without changing local storage')
    this.name = 'SyncCacheUnavailableError'
  }
}

export async function openExistingSyncDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') {
    throw new SyncCacheUnavailableError()
  }
  const existing = (await indexedDB.databases()).find(
    ({ name }) => name === syncDatabaseName,
  )
  if (existing?.version !== syncDatabaseVersion) {
    throw new SyncCacheUnavailableError()
  }

  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(syncDatabaseName)
    } catch {
      reject(new SyncCacheUnavailableError())
      return
    }
    request.onupgradeneeded = () => {
      request.transaction?.abort()
    }
    request.onsuccess = () => {
      const database = request.result
      if (database.version !== syncDatabaseVersion) {
        database.close()
        reject(new SyncCacheUnavailableError())
        return
      }
      database.onversionchange = () => database.close()
      resolve(database)
    }
    request.onerror = () => reject(new SyncCacheUnavailableError())
    request.onblocked = () => reject(new SyncCacheUnavailableError())
  })
}

function normalizeOpenError(error: unknown) {
  return error instanceof DOMException || error instanceof Error
    ? error
    : new Error(String(error))
}
