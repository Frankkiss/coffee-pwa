import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteTestDatabase } from '../../test/setupIndexedDb'
import {
  entityKey,
  openSyncDatabase,
  syncDatabaseName,
} from './syncDatabase'
import { listLocalEntities, listOutbox } from './localRepository'
import {
  exportLegacyRecoveryData,
  migrateLegacyOfflineData,
} from './legacyMigration'

const userOne = '00000000-0000-4000-8000-000000000001'
const userTwo = '00000000-0000-4000-8000-000000000002'
const deviceId = '00000000-0000-4000-8000-0000000000d1'
const localBeanId = 'local-bean-legacy-one'
const localBrewId = 'local-brew-legacy-one'
const cloudBeanId = '00000000-0000-4000-8000-0000000000b2'
const fixedTime = '2026-08-08T10:00:00.000Z'

describe('legacy offline migration', () => {
  beforeEach(async () => {
    await deleteTestDatabase(syncDatabaseName)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await deleteTestDatabase(syncDatabaseName)
  })

  it('maps local ids, rewrites references, compacts create/update, and preserves deletes and sources', async () => {
    const bean = legacyBean(userOne, localBeanId, 'snapshot final')
    const brew = legacyBrew(userOne, localBrewId, localBeanId)
    const pending = [
      legacyMutation('create-bean', userOne, 'bean', 'create', localBeanId, {
        ...beanCreatePayload(userOne, 'payload stale'),
        id: localBeanId,
      }),
      legacyMutation('update-bean', userOne, 'bean', 'update', localBeanId, {
        name: 'partial update must not replace snapshot',
      }, '2026-08-08T10:00:01.000Z'),
      legacyMutation('create-brew', userOne, 'brewLog', 'create', localBrewId, {
        ...brewCreatePayload(userOne, localBeanId),
        id: localBrewId,
      }, '2026-08-08T10:00:02.000Z'),
      legacyMutation('delete-local-bean', userOne, 'bean', 'delete', localBeanId, undefined, '2026-08-08T10:00:03.000Z'),
      legacyMutation('delete-cloud-bean', userOne, 'bean', 'delete', cloudBeanId, {}, '2026-08-08T10:00:04.000Z'),
      legacyMutation('foreign-secret', userTwo, 'bean', 'delete', '00000000-0000-4000-8000-000000000099'),
    ]
    await seedVersionTwoDatabase([
      ['beans', legacySnapshot(userOne, [bean])],
      ['brewLogs', legacySnapshot(userOne, [brew])],
    ], pending)

    const beforeSources = await readLegacySources()
    const result = await migrateLegacyOfflineData(userOne, deviceId, 7)

    expect(result.status).toBe('completed')
    expect(result.sourcePreserved).toBe(true)
    expect(result.idMap[localBeanId]).toMatch(uuidPattern)
    expect(result.idMap[localBrewId]).toMatch(uuidPattern)
    expect(result.counts).toEqual({
      sourceSnapshots: 2,
      sourceMutations: 5,
      migratedBeans: 1,
      migratedBrewLogs: 1,
      migratedMutations: 4,
    })

    const [migratedBean] = await listLocalEntities('beans', userOne)
    const [migratedBrew] = await listLocalEntities('brewLogs', userOne)
    expect(migratedBean).toEqual(expect.objectContaining({
      id: result.idMap[localBeanId],
      name: 'snapshot final',
      bean_type: 'single_origin',
      blend_components: [],
      blend_notes: null,
      schema_version: 1,
      deleted_at: '2026-08-08T10:00:03.000Z',
    }))
    expect(migratedBrew).toEqual(expect.objectContaining({
      id: result.idMap[localBrewId],
      bean_id: result.idMap[localBeanId],
      pour_steps: [],
      flavor_tags: [],
      is_pinned_recipe: false,
      schema_version: 1,
    }))

    const outbox = await listOutbox(userOne)
    expect(outbox).toHaveLength(4)
    expect(outbox.every((mutation) => mutation.mutationId.match(uuidPattern))).toBe(true)
    expect(outbox.every((mutation) => mutation.userId === userOne)).toBe(true)
    expect(outbox.every((mutation) => mutation.deviceId === deviceId)).toBe(true)
    expect(outbox.every((mutation) => mutation.baseSyncEpoch === 7)).toBe(true)
    expect(outbox.every((mutation) => mutation.status === 'pending' && mutation.attemptCount === 0)).toBe(true)

    const beanOperations = outbox
      .filter((mutation) => mutation.entityId === result.idMap[localBeanId])
      .map((mutation) => mutation.operation)
    expect(beanOperations).toEqual(['upsert', 'delete'])
    const beanUpsert = outbox.find(
      (mutation) => mutation.entityId === result.idMap[localBeanId] && mutation.operation === 'upsert',
    )
    expect(beanUpsert?.payload).toEqual(expect.objectContaining({ name: 'snapshot final' }))
    expect(beanUpsert?.payload).not.toHaveProperty('id')
    expect(beanUpsert?.payload).not.toHaveProperty('user_id')
    const brewUpsert = outbox.find((mutation) => mutation.entityType === 'brewLog')
    expect(brewUpsert?.payload).toEqual(expect.objectContaining({
      bean_id: result.idMap[localBeanId],
    }))
    expect(
      outbox
        .filter((mutation) => mutation.operation === 'delete')
        .every((mutation) => Object.keys(mutation.payload).length === 0),
    ).toBe(true)

    expect(await readLegacySources()).toEqual(beforeSources)
    const migrationMeta = await readEnvelopeValue('migrationMeta', entityKey(userOne, 'legacyMigration'))
    expect(migrationMeta).toEqual(result)
    expect(await listOutbox(userTwo)).toEqual([])

    const targetBeforeRetry = await readTargetRows()
    const repeated = await migrateLegacyOfflineData(userOne, deviceId, 999)
    expect(repeated).toEqual(result)
    expect(await readTargetRows()).toEqual(targetBeforeRetry)
    expect(await readLegacySources()).toEqual(beforeSources)
  })

  it('reconstructs pending-only local creates without leaving dangling ids', async () => {
    const pendingBeanId = 'local-bean-pending-only'
    const pendingBrewId = 'local-brew-pending-only'
    await seedVersionTwoDatabase([], [
      legacyMutation('pending-bean', userOne, 'bean', 'create', pendingBeanId, beanCreatePayload(userOne, 'pending only')),
      legacyMutation('pending-brew', userOne, 'brewLog', 'create', pendingBrewId, brewCreatePayload(userOne, pendingBeanId), '2026-08-08T10:00:01.000Z'),
    ])

    const result = await migrateLegacyOfflineData(userOne, deviceId, 1)

    expect(result.idMap[pendingBeanId]).toMatch(uuidPattern)
    expect(result.idMap[pendingBrewId]).toMatch(uuidPattern)
    expect(await listLocalEntities('beans', userOne)).toEqual([
      expect.objectContaining({ id: result.idMap[pendingBeanId], name: 'pending only' }),
    ])
    expect(await listLocalEntities('brewLogs', userOne)).toEqual([
      expect.objectContaining({
        id: result.idMap[pendingBrewId],
        bean_id: result.idMap[pendingBeanId],
      }),
    ])
  })

  it('retries UUID collisions so every legacy local id gets a distinct permanent id', async () => {
    const firstId = '00000000-0000-4000-8000-0000000000a1'
    const secondId = '00000000-0000-4000-8000-0000000000a2'
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(firstId)
      .mockReturnValueOnce(firstId)
      .mockReturnValueOnce(secondId)
    await seedVersionTwoDatabase([
      ['beans', legacySnapshot(userOne, [
        legacyBean(userOne, 'local-bean-first', 'first'),
        legacyBean(userOne, 'local-bean-second', 'second'),
      ])],
    ], [])

    const result = await migrateLegacyOfflineData(userOne, deviceId, 1)

    expect(new Set(Object.values(result.idMap))).toEqual(new Set([firstId, secondId]))
    expect(await listLocalEntities('beans', userOne)).toHaveLength(2)
  })

  it('aborts all v3 writes on a validation failure while preserving every legacy row', async () => {
    const valid = legacyBean(userOne, localBeanId, 'valid first')
    const invalid = legacyBean(userOne, 'local-bean-invalid', '')
    await seedVersionTwoDatabase([
      ['beans', legacySnapshot(userOne, [valid, invalid])],
    ], [legacyMutation('create-valid', userOne, 'bean', 'create', localBeanId, beanCreatePayload(userOne, 'valid first'))])
    const beforeSources = await readLegacySources()

    await expect(migrateLegacyOfflineData(userOne, deviceId, 1)).rejects.toThrow(/name/i)

    expect(await readStoreRows('beans')).toEqual([])
    expect(await readStoreRows('brewLogs')).toEqual([])
    expect(await readStoreRows('outbox')).toEqual([])
    expect(await readStoreRows('migrationMeta')).toEqual([])
    expect(await readLegacySources()).toEqual(beforeSources)
  })

  it('rolls back scheduled entity, Outbox, and metadata writes when the pre-commit hook fails', async () => {
    const bean = legacyBean(userOne, localBeanId, 'valid source')
    await seedVersionTwoDatabase([
      ['beans', legacySnapshot(userOne, [bean])],
    ], [legacyMutation('create-valid', userOne, 'bean', 'create', localBeanId, beanCreatePayload(userOne, bean.name))])
    const beforeSources = await readLegacySources()

    await expect(
      migrateLegacyOfflineData(userOne, deviceId, 1, {
        beforeCommit: () => {
          throw new Error('forced pre-commit failure')
        },
      }),
    ).rejects.toThrow('forced pre-commit failure')

    expect(await readStoreRows('beans')).toEqual([])
    expect(await readStoreRows('outbox')).toEqual([])
    expect(await readStoreRows('migrationMeta')).toEqual([])
    expect(await readLegacySources()).toEqual(beforeSources)
  })

  it('rejects target conflicts without overwriting current-user v3 data', async () => {
    const source = legacyBean(userOne, localBeanId, 'legacy source')
    await seedVersionTwoDatabase([
      ['beans', legacySnapshot(userOne, [source])],
    ], [])
    const existing = currentBean(userOne, '00000000-0000-4000-8000-0000000000c1', 'existing target')
    await putEnvelope('beans', {
      key: entityKey(userOne, existing.id),
      userId: userOne,
      value: existing,
    })

    await expect(migrateLegacyOfflineData(userOne, deviceId, 1)).rejects.toThrow(/target conflict/i)

    expect(await readStoreRows('beans')).toEqual([
      { key: entityKey(userOne, existing.id), userId: userOne, value: existing },
    ])
    expect(await readStoreRows('outbox')).toEqual([])
    expect(await readStoreRows('migrationMeta')).toEqual([])
  })

  it.each([
    ['cross-user snapshot row', () => ({
      snapshots: [['beans', legacySnapshot(userOne, [legacyBean(userTwo, localBeanId, 'leak')])] as LegacySnapshotEntry],
      pending: [],
    })],
    ['cross-user mutation payload', () => ({
      snapshots: [['beans', legacySnapshot(userOne, [legacyBean(userOne, localBeanId, 'owned')])] as LegacySnapshotEntry],
      pending: [legacyMutation('cross-payload', userOne, 'bean', 'create', localBeanId, beanCreatePayload(userTwo, 'leak'))],
    })],
    ['invalid non-local id', () => ({
      snapshots: [['beans', legacySnapshot(userOne, [legacyBean(userOne, 'not-a-uuid', 'bad id')])] as LegacySnapshotEntry],
      pending: [],
    })],
  ])('rejects malformed or unsafe legacy input: %s', async (_name, buildInput) => {
    const input = buildInput()
    await seedVersionTwoDatabase(input.snapshots, input.pending)

    await expect(migrateLegacyOfflineData(userOne, deviceId, 1)).rejects.toThrow()

    expect(await readStoreRows('beans')).toEqual([])
    expect(await readStoreRows('outbox')).toEqual([])
    expect(await readStoreRows('migrationMeta')).toEqual([])
  })

  it('fails instead of guessing an upsert entity that cannot be rebuilt', async () => {
    await seedVersionTwoDatabase([], [
      legacyMutation('partial-update', userOne, 'bean', 'update', cloudBeanId, { notes: 'partial only' }),
    ])

    await expect(migrateLegacyOfflineData(userOne, deviceId, 1)).rejects.toThrow(/complete entity/i)
    expect(await readStoreRows('outbox')).toEqual([])
  })

  it('isolates other-user source and target rows', async () => {
    const otherSource = legacyBean(userTwo, 'local-bean-other', 'other secret')
    await seedVersionTwoDatabase([
      ['beans', legacySnapshot(userTwo, [otherSource])],
    ], [legacyMutation('other-mutation', userTwo, 'bean', 'create', otherSource.id, beanCreatePayload(userTwo, otherSource.name))])
    const otherTarget = currentBean(userTwo, '00000000-0000-4000-8000-0000000000f2', 'foreign target')
    await putEnvelope('beans', {
      key: entityKey(userTwo, otherTarget.id),
      userId: userTwo,
      value: otherTarget,
    })

    const result = await migrateLegacyOfflineData(userOne, deviceId, 1)

    expect(result.counts.sourceSnapshots).toBe(0)
    expect(result.counts.sourceMutations).toBe(0)
    expect(result.idMap).toEqual({})
    expect(await listLocalEntities('beans', userOne)).toEqual([])
    expect(await listLocalEntities('beans', userTwo)).toEqual([otherTarget])
  })

  it('exports only raw recovery rows owned by the requested user without changing the database', async () => {
    const ownSnapshot = legacySnapshot(userOne, [legacyBean(userOne, localBeanId, 'recover me')])
    const foreignSnapshot = legacySnapshot(userTwo, [legacyBrew(userTwo, 'local-brew-secret', null)])
    const ownMutation = legacyMutation('own-recovery', userOne, 'bean', 'delete', cloudBeanId)
    const foreignMutation = legacyMutation('foreign-recovery', userTwo, 'bean', 'delete', '00000000-0000-4000-8000-000000000099', { secret: 'do not export' })
    await seedVersionTwoDatabase([
      ['beans', ownSnapshot],
      ['brewLogs', foreignSnapshot],
    ], [ownMutation, foreignMutation])
    const before = await readLegacySourcesUnversioned()

    const exported = await exportLegacyRecoveryData(userOne)

    expect(exported.userId).toBe(userOne)
    expect(exported.exportedAt).toMatch(canonicalTimePattern)
    expect(exported.snapshots).toEqual([{ key: 'beans', value: ownSnapshot }])
    expect(exported.pendingMutations).toEqual([ownMutation])
    expect(JSON.stringify(exported)).not.toContain('do not export')
    expect(JSON.stringify(exported)).not.toContain('local-brew-secret')
    expect(await readLegacySourcesUnversioned()).toEqual(before)
  })
})

type LegacySnapshotEntry = [key: 'beans' | 'brewLogs', value: unknown]

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const canonicalTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

function legacySnapshot(userId: string, rows: unknown[]) {
  return { userId, updatedAt: fixedTime, rows }
}

function legacyBean(userId: string, id: string, name: string) {
  return {
    id,
    user_id: userId,
    name,
    roaster: null,
    origin: null,
    farm_or_station: null,
    process: null,
    variety: null,
    altitude_meters: null,
    roast_date: null,
    roast_level: null,
    flavor_tags: [],
    flavor_notes: null,
    net_weight_grams: null,
    price: null,
    purchase_date: null,
    source_url: null,
    image_url: null,
    notes: null,
    created_at: fixedTime,
    updated_at: fixedTime,
    deleted_at: null,
    schema_version: 1,
  }
}

function currentBean(userId: string, id: string, name: string) {
  return {
    ...legacyBean(userId, id, name),
    bean_type: 'single_origin' as const,
    blend_components: [],
    blend_notes: null,
  }
}

function legacyBrew(userId: string, id: string, beanId: string | null) {
  return {
    id,
    user_id: userId,
    bean_id: beanId,
    brewed_at: fixedTime,
    method: 'V60',
    created_at: fixedTime,
    updated_at: fixedTime,
    deleted_at: null,
  }
}

function beanCreatePayload(userId: string, name: string) {
  const payload = { ...currentBean(userId, localBeanId, name) } as Record<string, unknown>
  for (const key of ['id', 'created_at', 'updated_at', 'deleted_at', 'image_url', 'schema_version']) {
    delete payload[key]
  }
  return payload
}

function brewCreatePayload(userId: string, beanId: string) {
  return {
    user_id: userId,
    bean_id: beanId,
    method: 'V60',
    dripper: null,
    filter_paper: null,
    grinder: null,
    grind_setting: null,
    coffee_grams: 15,
    water_grams: 250,
    ratio: '1:16.7',
    water_temperature_c: 92,
    total_time_seconds: 180,
    pour_steps: [],
    rating: null,
    acidity: null,
    sweetness: null,
    bitterness: null,
    astringency: null,
    body: null,
    aftertaste: null,
    flavor_tags: [],
    is_pinned_recipe: false,
    notes: null,
  }
}

function legacyMutation(
  id: string,
  userId: string,
  entity: 'bean' | 'brewLog',
  action: 'create' | 'update' | 'delete',
  entityId: string,
  payload?: unknown,
  createdAt = fixedTime,
) {
  return {
    id,
    userId,
    entity,
    action,
    entityId,
    ...(payload === undefined ? {} : { payload }),
    createdAt,
    attempts: 0,
    lastError: null,
  }
}

async function seedVersionTwoDatabase(
  snapshots: LegacySnapshotEntry[],
  pendingMutations: unknown[],
) {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(syncDatabaseName, 2)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('snapshots')
      request.result.createObjectStore('pendingMutations', { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Test v2 open failed'))
  })
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(['snapshots', 'pendingMutations'], 'readwrite')
      const snapshotStore = transaction.objectStore('snapshots')
      const pendingStore = transaction.objectStore('pendingMutations')
      for (const [key, value] of snapshots) snapshotStore.put(value, key)
      for (const mutation of pendingMutations) pendingStore.put(mutation)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Test v2 write failed'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Test v2 write aborted'))
    })
  } finally {
    database.close()
  }
}

async function putEnvelope(storeName: string, envelope: unknown) {
  const database = await openSyncDatabase()
  try {
    await transactionComplete(database.transaction(storeName, 'readwrite'), (transaction) => {
      transaction.objectStore(storeName).put(envelope)
    })
  } finally {
    database.close()
  }
}

async function readLegacySources() {
  return {
    snapshots: await readStoreRows('snapshots'),
    pendingMutations: await readStoreRows('pendingMutations'),
  }
}

async function readTargetRows() {
  return {
    beans: await readStoreRows('beans'),
    brewLogs: await readStoreRows('brewLogs'),
    outbox: await readStoreRows('outbox'),
    migrationMeta: await readStoreRows('migrationMeta'),
  }
}

async function readStoreRows(storeName: string) {
  const database = await openSyncDatabase()
  try {
    return await requestResult<unknown[]>(
      database.transaction(storeName).objectStore(storeName).getAll(),
    )
  } finally {
    database.close()
  }
}

async function readEnvelopeValue(storeName: string, key: IDBValidKey) {
  const database = await openSyncDatabase()
  try {
    const row = await requestResult<{ value?: unknown } | undefined>(
      database.transaction(storeName).objectStore(storeName).get(key),
    )
    return row?.value
  } finally {
    database.close()
  }
}

async function readLegacySourcesUnversioned() {
  const database = await openExistingDatabase()
  try {
    return {
      snapshots: await requestResult<unknown[]>(database.transaction('snapshots').objectStore('snapshots').getAll()),
      pendingMutations: await requestResult<unknown[]>(database.transaction('pendingMutations').objectStore('pendingMutations').getAll()),
      version: database.version,
    }
  } finally {
    database.close()
  }
}

function openExistingDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(syncDatabaseName)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Test database open failed'))
  })
}

function requestResult<Result>(request: IDBRequest<Result>) {
  return new Promise<Result>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Test read failed'))
  })
}

function transactionComplete(
  transaction: IDBTransaction,
  schedule: (transaction: IDBTransaction) => void,
) {
  return new Promise<void>((resolve, reject) => {
    schedule(transaction)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Test transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Test transaction aborted'))
  })
}
