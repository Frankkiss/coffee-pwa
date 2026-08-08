import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteTestDatabase,
} from '../../test/setupIndexedDb'
import {
  openSyncDatabase,
  syncDatabaseName,
  syncDatabaseVersion,
  syncStoreNames,
} from './syncDatabase'

const legacySnapshot = { beans: [{ id: 'legacy-bean' }], savedAt: 'v2' }
const legacyMutation = { id: 'legacy-mutation', operation: 'upsert' }

describe('syncDatabase', () => {
  beforeEach(async () => {
    await deleteTestDatabase(syncDatabaseName)
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await deleteTestDatabase(syncDatabaseName)
  })

  it('creates the complete v3 schema with the required key paths', async () => {
    const database = await openSyncDatabase()

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

    const transaction = database.transaction(
      [...Object.values(syncStoreNames), 'snapshots', 'pendingMutations'],
      'readonly',
    )
    for (const storeName of Object.values(syncStoreNames)) {
      expect(transaction.objectStore(storeName).keyPath).toBe('key')
    }
    expect(transaction.objectStore('snapshots').keyPath).toBeNull()
    expect(transaction.objectStore('pendingMutations').keyPath).toBe('id')

    database.close()
  })

  it('upgrades a v2 database without deleting or rewriting legacy rows', async () => {
    const legacyDatabase = await createVersionTwoDatabase()
    legacyDatabase.close()

    const database = await openSyncDatabase()

    expect(await readStoredValue(database, 'snapshots', 'current')).toEqual(
      legacySnapshot,
    )
    expect(
      await readStoredValue(database, 'pendingMutations', 'legacy-mutation'),
    ).toEqual(legacyMutation)
    expect(database.transaction('snapshots').objectStore('snapshots').keyPath)
      .toBeNull()
    expect(
      database
        .transaction('pendingMutations')
        .objectStore('pendingMutations').keyPath,
    ).toBe('id')

    database.close()
  })

  it('rejects when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)

    await expect(openSyncDatabase()).rejects.toThrow('IndexedDB unavailable')
  })

  it('rejects a blocked upgrade and closes the late connection', async () => {
    const blocker = await createVersionTwoDatabase()

    const opening = openSyncDatabase()
    await expect(opening).rejects.toThrow('IndexedDB open blocked')

    blocker.close()
    await new Promise((resolve) => setTimeout(resolve, 0))

    await expect(deleteTestDatabase(syncDatabaseName)).resolves.toBeUndefined()
  })
})

function createVersionTwoDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(syncDatabaseName, 2)
    request.onupgradeneeded = () => {
      const database = request.result
      const snapshots = database.createObjectStore('snapshots')
      const pendingMutations = database.createObjectStore('pendingMutations', {
        keyPath: 'id',
      })
      snapshots.put(legacySnapshot, 'current')
      pendingMutations.put(legacyMutation)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      reject(request.error ?? new Error('Could not create v2 database'))
    }
  })
}

function readStoredValue(
  database: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
) {
  return new Promise<unknown>((resolve, reject) => {
    const request = database.transaction(storeName).objectStore(storeName).get(key)
    request.onsuccess = () => resolve(request.result as unknown)
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB read failed'))
    }
  })
}
