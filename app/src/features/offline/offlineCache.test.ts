import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteTestDatabase } from '../../test/setupIndexedDb'
import {
  syncDatabaseName,
  syncDatabaseVersion,
} from '../sync/syncDatabase'
import {
  createOfflinePendingMutation,
  enqueueOfflineMutation,
  readOfflineMutations,
} from './offlineQueue'
import {
  buildOfflineCacheSnapshot,
  getOfflineRowsForUser,
  isOfflineCacheForUser,
  readOfflineCache,
  writeOfflineCache,
} from './offlineCache'

type TestRow = {
  id: string
  name: string
}

describe('offline cache snapshots', () => {
  it('builds a user-scoped cache snapshot', () => {
    const rows: TestRow[] = [{ id: 'bean-1', name: 'Ethiopia' }]

    const snapshot = buildOfflineCacheSnapshot(
      rows,
      'user-1',
      new Date('2026-06-15T00:00:00.000Z'),
    )

    expect(snapshot).toEqual({
      userId: 'user-1',
      updatedAt: '2026-06-15T00:00:00.000Z',
      rows,
    })
  })

  it('only returns rows for the current user', () => {
    const snapshot = buildOfflineCacheSnapshot(
      [{ id: 'bean-1', name: 'Ethiopia' }],
      'user-1',
      new Date('2026-06-15T00:00:00.000Z'),
    )

    expect(isOfflineCacheForUser(snapshot, 'user-1')).toBe(true)
    expect(getOfflineRowsForUser(snapshot, 'user-1')).toEqual([
      { id: 'bean-1', name: 'Ethiopia' },
    ])
    expect(isOfflineCacheForUser(snapshot, 'user-2')).toBe(false)
    expect(getOfflineRowsForUser(snapshot, 'user-2')).toBeNull()
  })

  it('rejects missing or malformed snapshots', () => {
    expect(getOfflineRowsForUser(null, 'user-1')).toBeNull()
    expect(getOfflineRowsForUser({ userId: 'user-1' }, 'user-1')).toBeNull()
    expect(getOfflineRowsForUser({ userId: 'user-1', updatedAt: '', rows: [] }, 'user-1')).toBeNull()
  })
})

describe('legacy offline cache database compatibility', () => {
  beforeEach(async () => {
    await deleteTestDatabase(syncDatabaseName)
  })

  afterEach(async () => {
    await deleteTestDatabase(syncDatabaseName)
  })

  it('continues writing and reading cache after the queue upgrades the database to v3', async () => {
    await enqueueOfflineMutation(
      createOfflinePendingMutation({
        id: 'queue-first',
        userId: 'user-1',
        entity: 'bean',
        action: 'delete',
        entityId: 'bean-1',
      }),
    )
    const rows = [{ id: 'bean-1', name: 'Ethiopia' }]

    await writeOfflineCache(
      'beans',
      buildOfflineCacheSnapshot(rows, 'user-1', new Date('2026-08-09T00:00:00.000Z')),
    )

    expect(await readOfflineCache<TestRow>('beans', 'user-1')).toEqual(rows)
  })

  it('creates the complete v3 schema when cache opens first and keeps the queue writable', async () => {
    const rows = [{ id: 'bean-1', name: 'Kenya' }]
    await writeOfflineCache(
      'beans',
      buildOfflineCacheSnapshot(rows, 'user-1', new Date('2026-08-09T00:00:00.000Z')),
    )

    const database = await openCurrentDatabase()
    try {
      expect(database.version).toBe(syncDatabaseVersion)
      expect(Array.from(database.objectStoreNames)).toEqual([
        'aiRecommendations',
        'beans',
        'brewLogs',
        'brewTemplates',
        'migrationMeta',
        'outbox',
        'pendingMutations',
        'snapshots',
        'syncMeta',
        'userSettings',
      ])
    } finally {
      database.close()
    }

    const mutation = createOfflinePendingMutation({
      id: 'cache-first',
      userId: 'user-1',
      entity: 'bean',
      action: 'delete',
      entityId: 'bean-1',
    })
    await enqueueOfflineMutation(mutation)

    expect(await readOfflineMutations('user-1')).toEqual([mutation])
    expect(await readOfflineCache<TestRow>('beans', 'user-1')).toEqual(rows)
  })
})

function openCurrentDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(syncDatabaseName)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Test database open failed'))
  })
}
