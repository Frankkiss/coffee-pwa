import { openSyncDatabase } from '../sync/syncDatabase'

export type OfflineCacheKind = 'beans' | 'brewLogs'

export type OfflineCacheSnapshot<Row> = {
  userId: string
  updatedAt: string
  rows: Row[]
}

const storeName = 'snapshots'

export function buildOfflineCacheSnapshot<Row>(
  rows: Row[],
  userId: string,
  now: Date,
): OfflineCacheSnapshot<Row> {
  return {
    userId,
    updatedAt: now.toISOString(),
    rows,
  }
}

export function isOfflineCacheForUser<Row>(
  snapshot: unknown,
  userId: string,
): snapshot is OfflineCacheSnapshot<Row> {
  if (!snapshot || typeof snapshot !== 'object') {
    return false
  }

  const candidate = snapshot as Partial<OfflineCacheSnapshot<Row>>

  return (
    candidate.userId === userId &&
    typeof candidate.updatedAt === 'string' &&
    candidate.updatedAt.trim().length > 0 &&
    Array.isArray(candidate.rows)
  )
}

export function getOfflineRowsForUser<Row>(
  snapshot: unknown,
  userId: string,
): Row[] | null {
  if (!isOfflineCacheForUser<Row>(snapshot, userId)) {
    return null
  }

  return snapshot.rows
}

export async function writeOfflineCache<Row>(
  kind: OfflineCacheKind,
  snapshot: OfflineCacheSnapshot<Row>,
) {
  try {
    const database = await openOfflineDatabase()
    await writeSnapshot(database, kind, snapshot)
    database.close()
  } catch {
    // IndexedDB can be unavailable in private or restricted browser modes.
  }
}

export async function readOfflineCache<Row>(
  kind: OfflineCacheKind,
  userId: string,
): Promise<Row[] | null> {
  try {
    const database = await openOfflineDatabase()
    const snapshot = await readSnapshot(database, kind)
    database.close()
    return getOfflineRowsForUser<Row>(snapshot, userId)
  } catch {
    return null
  }
}

function openOfflineDatabase(): Promise<IDBDatabase> {
  return openSyncDatabase()
}

function writeSnapshot<Row>(
  database: IDBDatabase,
  kind: OfflineCacheKind,
  snapshot: OfflineCacheSnapshot<Row>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    store.put(snapshot, kind)

    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB write failed'))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB write aborted'))
  })
}

function readSnapshot(
  database: IDBDatabase,
  kind: OfflineCacheKind,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly')
    const store = transaction.objectStore(storeName)
    const request = store.get(kind)

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'))
  })
}
