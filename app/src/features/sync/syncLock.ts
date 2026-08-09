import { openSyncDatabase, syncStoreNames } from './syncDatabase'

const leaseDurationMs = 30_000
const renewalIntervalMs = 10_000

type SyncLockOptions = {
  ownerId: () => string
  now: () => number
  schedule: (callback: () => void, delayMs: number) => number
  cancelSchedule: (id: number) => void
}

export type SyncLockGuard = {
  signal: AbortSignal
  assertHeld(): Promise<void>
}

export class SyncLockLostError extends Error {
  readonly code = 'SYNC_LOCK_LOST'

  constructor(message = 'Sync lock is no longer held') {
    super(message)
    this.name = 'SyncLockLostError'
  }
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
    action: (guard: SyncLockGuard) => Promise<Result>,
  ): Promise<Result> {
    const webLocks = readWebLocks()
    if (webLocks) {
      return webLocks.request(
        `coffee-sync:${userId}`,
        { mode: 'exclusive' },
        async () => {
          const controller = new AbortController()
          let held = true
          const guard: SyncLockGuard = {
            signal: controller.signal,
            async assertHeld() {
              if (!held || controller.signal.aborted) {
                throw new SyncLockLostError()
              }
            },
          }
          try {
            return await action(guard)
          } finally {
            held = false
            controller.abort()
          }
        },
      )
    }

    const ownerId = options.ownerId()
    await waitForLease(userId, ownerId, options)
    let active = true
    let renewalTimer: number | null = null
    const controller = new AbortController()
    const loseLease = () => {
      if (!controller.signal.aborted) controller.abort()
    }
    const guard: SyncLockGuard = {
      signal: controller.signal,
      async assertHeld() {
        if (controller.signal.aborted) throw new SyncLockLostError()
        let held: boolean
        try {
          held = await assertLeaseHeld(
            userId,
            ownerId,
            options.now(),
          )
        } catch (error) {
          loseLease()
          throw new SyncLockLostError(
            error instanceof Error ? error.message : undefined,
          )
        }
        if (!held || controller.signal.aborted) {
          loseLease()
          throw new SyncLockLostError()
        }
      },
    }

    const scheduleRenewal = () => {
      renewalTimer = options.schedule(() => {
        if (!active) return
        void renewLease(userId, ownerId, options.now()).then(
          (retained) => {
            if (!active) return
            if (!retained) {
              loseLease()
              return
            }
            scheduleRenewal()
          },
          () => loseLease(),
        )
      }, renewalIntervalMs)
    }
    scheduleRenewal()

    let outcome:
      | { status: 'fulfilled'; value: Result }
      | { status: 'rejected'; reason: unknown }
    try {
      outcome = { status: 'fulfilled', value: await action(guard) }
    } catch (reason) {
      outcome = { status: 'rejected', reason }
    }

    active = false
    if (renewalTimer !== null) options.cancelSchedule(renewalTimer)
    let releaseError: unknown
    try {
      await releaseLease(userId, ownerId)
    } catch (error) {
      if (!controller.signal.aborted) releaseError = error
    }
    loseLease()

    if (outcome.status === 'rejected') throw outcome.reason
    if (releaseError !== undefined) throw releaseError
    return outcome.value
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
        if (existing?.ownerId !== ownerId || existing.expiresAt <= now) {
          finish(false)
          return
        }
        store.put({ key, ownerId, expiresAt: now + leaseDurationMs } satisfies LockLease)
        finish(true)
      } catch (error) { fail(error) }
    }
  })
}

async function assertLeaseHeld(
  userId: string,
  ownerId: string,
  now: number,
) {
  const key = `lock:${userId}`
  return withLeaseTransaction<boolean>('readonly', (store, finish, fail) => {
    const request = store.get(key)
    request.onsuccess = () => {
      try {
        const existing = parseLease(request.result, key)
        finish(
          existing?.ownerId === ownerId && existing.expiresAt > now,
        )
      } catch (error) {
        fail(error)
      }
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
