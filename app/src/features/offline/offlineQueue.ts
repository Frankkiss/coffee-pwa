export type OfflineMutationEntity = 'bean' | 'brewLog'
export type OfflineMutationAction = 'create' | 'update' | 'delete'

export type OfflinePendingMutation = {
  id: string
  userId: string
  entity: OfflineMutationEntity
  action: OfflineMutationAction
  entityId?: string
  payload?: unknown
  createdAt: string
  attempts: number
  lastError: string | null
}

export type OfflinePendingMutationInput = {
  id?: string
  userId: string
  entity: OfflineMutationEntity
  action: OfflineMutationAction
  entityId?: string
  payload?: unknown
  createdAt?: Date
}

const databaseName = 'kaday-offline-cache'
const databaseVersion = 2
const storeName = 'pendingMutations'

export function createOfflinePendingMutation(
  input: OfflinePendingMutationInput,
): OfflinePendingMutation {
  return {
    id: input.id ?? createMutationId(),
    userId: input.userId,
    entity: input.entity,
    action: input.action,
    ...(input.entityId ? { entityId: input.entityId } : {}),
    ...(input.payload === undefined ? {} : { payload: input.payload }),
    createdAt: (input.createdAt ?? new Date()).toISOString(),
    attempts: 0,
    lastError: null,
  }
}

export function getPendingMutationsForUser(
  mutations: OfflinePendingMutation[],
  userId: string,
  entity?: OfflineMutationEntity,
) {
  return mutations
    .filter((mutation) => mutation.userId === userId)
    .filter((mutation) => (entity ? mutation.entity === entity : true))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export function isOfflineWriteFailure(error: unknown) {
  if (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    navigator.onLine === false
  ) {
    return true
  }

  const message = error instanceof Error ? error.message : String(error ?? '')
  return /failed to fetch|networkerror|network request failed|load failed/i.test(message)
}

export async function enqueueOfflineMutation(mutation: OfflinePendingMutation) {
  const database = await openQueueDatabase()
  await writeMutation(database, mutation)
  database.close()
}

export async function readOfflineMutations(userId: string, entity?: OfflineMutationEntity) {
  const database = await openQueueDatabase()
  const mutations = await readAllMutations(database)
  database.close()
  return getPendingMutationsForUser(mutations, userId, entity)
}

export async function removeOfflineMutation(id: string) {
  const database = await openQueueDatabase()
  await deleteMutation(database, id)
  database.close()
}

export async function markOfflineMutationFailed(id: string, error: unknown) {
  const database = await openQueueDatabase()
  const mutation = await readMutation(database, id)

  if (mutation) {
    await writeMutation(database, {
      ...mutation,
      attempts: mutation.attempts + 1,
      lastError: error instanceof Error ? error.message : String(error ?? 'Sync failed'),
    })
  }

  database.close()
}

function createMutationId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function openQueueDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('IndexedDB unavailable'))
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, databaseVersion)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains('snapshots')) {
        database.createObjectStore('snapshots')
      }

      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
    request.onblocked = () => reject(new Error('IndexedDB open blocked'))
  })
}

function writeMutation(
  database: IDBDatabase,
  mutation: OfflinePendingMutation,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).put(mutation)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB write failed'))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB write aborted'))
  })
}

function readAllMutations(database: IDBDatabase): Promise<OfflinePendingMutation[]> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly')
    const request = transaction.objectStore(storeName).getAll()
    request.onsuccess = () => resolve(request.result as OfflinePendingMutation[])
    request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'))
  })
}

function readMutation(
  database: IDBDatabase,
  id: string,
): Promise<OfflinePendingMutation | null> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly')
    const request = transaction.objectStore(storeName).get(id)
    request.onsuccess = () => resolve((request.result as OfflinePendingMutation) ?? null)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'))
  })
}

function deleteMutation(database: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).delete(id)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB delete failed'))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB delete aborted'))
  })
}
