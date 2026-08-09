import { openSyncDatabase, syncStoreNames } from './syncDatabase'

const leaseDurationMs = 30_000
const renewalIntervalMs = 10_000

type SyncLockOptions = {
  ownerId: () => string
  now: () => number
  schedule: (callback: () => void, delayMs: number) => number
  cancelSchedule: (id: number) => void
}

type LockLease = {
  key: string
  ownerId: string
  expiresAt: number
}

const defaultOptions: SyncLockOptions = {
  ownerId: () => crypto.randomUUID(),
  now: () => Date.now(),
  schedule: (callback, delayMs) => globalThis.setTimeout(callback, delayMs) as unknown as number,
  cancelSchedule: (id) => globalThis.clearTimeout(id),
}

export function createSyncLock(options: SyncLockOptions = defaultOptions) {
  return async function withConfiguredSyncLock<Result>(
    userId: string,
    action: () => Promise<Result>,
  ): Promise<Result> {
    const webLocks = readWebLocks()
    if (webLocks) {
      return webLocks.request(
        `coffee-sync:${userId}`,
        { mode: 'exclusive' },
        action,
      )
    }

    const ownerId = options.ownerId()
    await waitForLease(userId, ownerId, options)
    let active = true
    let renewalTimer: number | null = null

    const scheduleRenewal = () => {
      renewalTimer = options.schedule(() => {
        void (async () => {
          if (!active) return
          const retained = await renewLease(userId, ownerId, options.now())
          if (active && retained) scheduleRenewal()
        })()
      }, renewalIntervalMs)
    }
    scheduleRenewal()

    try {
      return await action()
    } finally {
      active = false
      if (renewalTimer !== null) options.cancelSchedule(renewalTimer)
      await releaseLease(userId, ownerId)
    }
  }
}

export const withSyncLock = createSyncLock()

type WebLocks = {
  request<Result>(
    name: string,
    options: { mode: 'exclusive' },
    action: () => Promise<Result>,
  ): Promise<Result>
}

function readWebLocks(): WebLocks | null {
  const candidate = (globalThis.navigator as Navigator | undefined)?.locks
  return candidate && typeof candidate.request === 'function'
    ? candidate as unknown as WebLocks
    : null
}

async function waitForLease(
  userId: string,
  ownerId: string,
  options: SyncLockOptions,
): Promise<void> {
  while (true) {
    const result = await tryAcquireLease(userId, ownerId, options.now())
    if (result.acquired) return
    await new Promise<void>((resolve) => {
      options.schedule(resolve, Math.max(1, result.retryAt - options.now()))
    })
  }
}

async function tryAcquireLease(userId: string, ownerId: string, now: number) {
  const key = `lock:${userId}`
  return withLeaseTransaction<{ acquired: boolean; retryAt: number }>(
    'readwrite',
    (store, finish, fail) => {
      const request = store.get(key)
      request.onsuccess = () => {
        try {
          const existing = parseLease(request.result, key)
          if (!existing || existing.ownerId === ownerId || existing.expiresAt <= now) {
            store.put({ key, ownerId, expiresAt: now + leaseDurationMs } satisfies LockLease)
            finish({ acquired: true, retryAt: now })
          } else {
            finish({ acquired: false, retryAt: existing.expiresAt })
          }
        } catch (error) { fail(error) }
      }
    },
  )
}

async function renewLease(userId: string, ownerId: string, now: number) {
  const key = `lock:${userId}`
  return withLeaseTransaction<boolean>('readwrite', (store, finish, fail) => {
    const request = store.get(key)
    request.onsuccess = () => {
      try {
        const existing = parseLease(request.result, key)
        if (existing?.ownerId !== ownerId) {
          finish(false)
          return
        }
        store.put({ key, ownerId, expiresAt: now + leaseDurationMs } satisfies LockLease)
        finish(true)
      } catch (error) { fail(error) }
    }
  })
}

async function releaseLease(userId: string, ownerId: string) {
  const key = `lock:${userId}`
  await withLeaseTransaction<void>('readwrite', (store, finish, fail) => {
    const request = store.get(key)
    request.onsuccess = () => {
      try {
        const existing = parseLease(request.result, key)
        if (existing?.ownerId === ownerId) store.delete(key)
        finish()
      } catch (error) { fail(error) }
    }
  })
}

async function withLeaseTransaction<Result>(
  mode: IDBTransactionMode,
  work: (
    store: IDBObjectStore,
    finish: (value: Result) => void,
    fail: (error: unknown) => void,
  ) => void,
): Promise<Result> {
  const database = await openSyncDatabase()
  return new Promise<Result>((resolve, reject) => {
    const transaction = database.transaction(syncStoreNames.syncMeta, mode)
    const store = transaction.objectStore(syncStoreNames.syncMeta)
    let result: Result
    let failure: unknown = null
    const finish = (value: Result) => { result = value }
    const fail = (error: unknown) => {
      failure = error
      try { transaction.abort() } catch { /* already inactive */ }
    }
    transaction.oncomplete = () => {
      database.close()
      resolve(result)
    }
    transaction.onabort = transaction.onerror = () => {
      database.close()
      reject(failure ?? transaction.error ?? new Error('Sync lease transaction failed'))
    }
    try { work(store, finish, fail) } catch (error) { fail(error) }
  })
}

function parseLease(value: unknown, expectedKey: string): LockLease | null {
  if (value === undefined) return null
  if (typeof value !== 'object' || value === null) throw new Error('Invalid sync lease')
  const row = value as Record<string, unknown>
  if (row.key !== expectedKey || typeof row.ownerId !== 'string' || !row.ownerId || typeof row.expiresAt !== 'number' || !Number.isFinite(row.expiresAt)) {
    throw new Error('Invalid sync lease')
  }
  return { key: expectedKey, ownerId: row.ownerId, expiresAt: row.expiresAt }
}
