import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteTestDatabase } from '../../test/setupIndexedDb'
import { openSyncDatabase, syncDatabaseName, syncStoreNames } from './syncDatabase'
import { createSyncLock, type SyncLockGuard } from './syncLock'

type Scheduled = { id: number; callback: () => void; delay: number; cancelled: boolean }

function scheduler() {
  let nextId = 1
  const entries: Scheduled[] = []
  return {
    entries,
    schedule(callback: () => void, delay: number) {
      const entry = { id: nextId++, callback, delay, cancelled: false }
      entries.push(entry)
      return entry.id
    },
    cancelSchedule(id: number) {
      const entry = entries.find((item) => item.id === id)
      if (entry) entry.cancelled = true
    },
    runNext() {
      const entry = entries.find((item) => !item.cancelled)
      if (!entry) throw new Error('No scheduled callback')
      entry.cancelled = true
      entry.callback()
      return entry
    },
  }
}

async function flushIdb() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

async function until(predicate: () => boolean) {
  for (let attempt = 0; attempt < 20 && !predicate(); attempt += 1) {
    await flushIdb()
  }
  expect(predicate()).toBe(true)
}

async function writeLease(userId: string, ownerId: string, expiresAt: number) {
  const db = await openSyncDatabase()
  const tx = db.transaction(syncStoreNames.syncMeta, 'readwrite')
  tx.objectStore(syncStoreNames.syncMeta).put({ key: `lock:${userId}`, ownerId, expiresAt })
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function writeRawLease(value: unknown) {
  const db = await openSyncDatabase()
  const tx = db.transaction(syncStoreNames.syncMeta, 'readwrite')
  tx.objectStore(syncStoreNames.syncMeta).put(value)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function readLease(userId: string) {
  const db = await openSyncDatabase()
  const tx = db.transaction(syncStoreNames.syncMeta, 'readonly')
  const request = tx.objectStore(syncStoreNames.syncMeta).get(`lock:${userId}`)
  const value = await new Promise<unknown>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  db.close()
  return value
}

describe('cross-tab sync lock', () => {
  beforeEach(async () => {
    vi.stubGlobal('navigator', {})
    await deleteTestDatabase(syncDatabaseName)
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await deleteTestDatabase(syncDatabaseName)
  })

  it('prefers an exclusive navigator lock', async () => {
    const request = vi.fn(async (_name: string, options: unknown, action: () => Promise<string>) => {
      expect(options).toEqual({ mode: 'exclusive' })
      return action()
    })
    vi.stubGlobal('navigator', { locks: { request } })
    const lock = createSyncLock({ ownerId: () => 'owner', now: () => 0,
      schedule: () => 1, cancelSchedule: () => undefined })
    await expect(lock('user-1', async (guard) => {
      expect(guard.signal.aborted).toBe(false)
      await expect(guard.assertHeld()).resolves.toBeUndefined()
      return 'done'
    })).resolves.toBe('done')
    expect(request).toHaveBeenCalledWith('coffee-sync:user-1', { mode: 'exclusive' }, expect.any(Function))
  })

  it('blocks a second lease owner before expiry and lets it enter after expiry', async () => {
    let now = 1_000
    const firstSchedule = scheduler()
    const secondSchedule = scheduler()
    const first = createSyncLock({ ownerId: () => 'owner-1', now: () => now, ...firstSchedule })
    const second = createSyncLock({ ownerId: () => 'owner-2', now: () => now, ...secondSchedule })
    let releaseFirst!: () => void
    let firstGuard!: SyncLockGuard
    const firstDone = first('user-1', (guard) => new Promise<void>((resolve) => {
      firstGuard = guard
      releaseFirst = resolve
    }))
    await until(() => releaseFirst !== undefined)
    let secondEntered = false
    let releaseSecond!: () => void
    const secondDone = second('user-1', () => new Promise<void>((resolve) => {
      secondEntered = true
      releaseSecond = resolve
    }))
    await until(() => secondSchedule.entries.length > 0)
    expect(secondEntered).toBe(false)
    expect(secondSchedule.entries[0].delay).toBe(30_000)

    now = 31_001
    secondSchedule.runNext()
    await until(() => secondEntered)
    expect(secondEntered).toBe(true)
    await expect(firstGuard.assertHeld()).rejects.toMatchObject({ code: 'SYNC_LOCK_LOST' })
    releaseFirst()
    await firstDone
    releaseSecond()
    await secondDone
  })

  it('renews every ten seconds and an old owner never deletes a new lease', async () => {
    let now = 5_000
    const timers = scheduler()
    const lock = createSyncLock({ ownerId: () => 'owner-1', now: () => now, ...timers })
    let release!: () => void
    let guard!: SyncLockGuard
    const running = lock('user-1', (value) => new Promise<void>((resolve) => {
      guard = value
      release = resolve
    }))
    await flushIdb()
    expect((await readLease('user-1') as { expiresAt: number }).expiresAt).toBe(35_000)
    expect(timers.entries[0].delay).toBe(10_000)
    now = 15_000
    timers.runNext()
    await flushIdb()
    expect((await readLease('user-1') as { expiresAt: number }).expiresAt).toBe(45_000)

    await writeLease('user-1', 'owner-2', 80_000)
    timers.runNext()
    await until(() => guard.signal.aborted)
    await expect(guard.assertHeld()).rejects.toMatchObject({ code: 'SYNC_LOCK_LOST' })
    release()
    await running
    expect(await readLease('user-1')).toEqual({ key: 'lock:user-1', ownerId: 'owner-2', expiresAt: 80_000 })
  })

  it('releases its own lease when the action throws', async () => {
    const timers = scheduler()
    const lock = createSyncLock({ ownerId: () => 'owner-1', now: () => 0, ...timers })
    await expect(lock('user-1', async () => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(await readLease('user-1')).toBeUndefined()
  })

  it('aborts the guard and catches a renewal storage failure without an unhandled rejection', async () => {
    let now = 1_000
    const timers = scheduler()
    const lock = createSyncLock({ ownerId: () => 'owner-1', now: () => now, ...timers })
    let release!: () => void
    let guard!: SyncLockGuard
    const running = lock('user-1', (value) => new Promise<void>((resolve) => {
      guard = value
      release = resolve
    }))
    await until(() => guard !== undefined)
    await writeRawLease({
      key: 'lock:user-1', ownerId: 42, expiresAt: 'broken',
    })
    now = 11_000
    timers.runNext()
    await until(() => guard.signal.aborted)
    await expect(guard.assertHeld()).rejects.toMatchObject({ code: 'SYNC_LOCK_LOST' })

    release()
    await expect(running).resolves.toBeUndefined()
    expect(await readLease('user-1')).toEqual({
      key: 'lock:user-1', ownerId: 42, expiresAt: 'broken',
    })
  })
})
