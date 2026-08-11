import {
  migrateLegacyOfflineData,
} from '../features/sync/legacyMigration'
import {
  createLocalRepository,
  listLocalEntities,
  listOutbox,
} from '../features/sync/localRepository'
import {
  openSyncDatabase,
  syncDatabaseName,
  syncStoreNames,
} from '../features/sync/syncDatabase'
import type { ServerBeanRow } from '../features/beans/beanTypes'
import type { SyncMutation, SyncSnapshot } from '../features/sync/syncTypes'

type SmokeResult = {
  browser: string
  status: 'PASS' | 'FAIL'
  checks: Array<{ name: string; status: 'PASS' | 'FAIL'; detail?: string }>
}

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const deviceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const entityId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const mutationId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const now = '2026-08-08T10:00:00.000Z'

const checks: Array<{ name: string; run: () => Promise<void> }> = [
  { name: 'v2-to-v3 upgrade preserves legacy rows', run: checkVersionUpgrade },
  { name: 'legacy schema-version recovery rejection is atomic', run: checkSchemaRecovery },
  { name: 'completed migration rejects changed source fingerprint', run: checkCompletedFingerprint },
  { name: 'blocked open is deduplicated and late connection closes', run: checkBlockedOpen },
  { name: 'entity and Outbox abort together', run: checkEntityOutboxAbort },
  { name: 'snapshot and sync metadata abort together', run: checkSnapshotMetaAbort },
]

void runSmoke()

async function runSmoke() {
  const result: SmokeResult = {
    browser: navigator.userAgent,
    status: 'PASS',
    checks: [],
  }
  for (const check of checks) {
    try {
      await check.run()
      result.checks.push({ name: check.name, status: 'PASS' })
    } catch (error) {
      result.status = 'FAIL'
      result.checks.push({
        name: check.name,
        status: 'FAIL',
        detail: error instanceof Error ? error.message : String(error),
      })
    } finally {
      await deleteDatabase()
    }
  }
  const output = document.querySelector('#result')
  if (output !== null) output.textContent = JSON.stringify(result, null, 2)
  document.documentElement.dataset.smokeStatus = result.status
  ;(window as Window & { indexedDbSmokeResult?: SmokeResult }).indexedDbSmokeResult = result
}

async function checkVersionUpgrade() {
  await deleteDatabase()
  const legacySnapshot = { userId, updatedAt: now, rows: [{ marker: 'preserve' }] }
  const legacyMutation = { id: 'legacy-preserve', marker: 'preserve' }
  const blocker = await createVersionTwoDatabase([
    ['beans', legacySnapshot],
  ], [legacyMutation])
  blocker.close()

  const database = await openSyncDatabase()
  try {
    equal(database.version, 3, 'database version')
    equal(
      JSON.stringify(await getValue(database, 'snapshots', 'beans')),
      JSON.stringify(legacySnapshot),
      'legacy snapshot changed during upgrade',
    )
    equal(
      JSON.stringify(await getValue(database, 'pendingMutations', legacyMutation.id)),
      JSON.stringify(legacyMutation),
      'legacy mutation changed during upgrade',
    )
    for (const name of Object.values(syncStoreNames)) {
      assert(database.objectStoreNames.contains(name), `missing v3 store ${name}`)
    }
  } finally {
    database.close()
  }
}

async function checkSchemaRecovery() {
  await deleteDatabase()
  const unsupported = legacyBean('unsupported schema')
  unsupported.schema_version = 999
  const blocker = await createVersionTwoDatabase([
    ['beans', legacySnapshot([unsupported])],
  ], [])
  blocker.close()
  const before = await readLegacyRows()

  const error = await captureError(() => migrateLegacyOfflineData(userId, deviceId, 1))
  equal(errorCode(error), 'LEGACY_MIGRATION_RECOVERY_REQUIRED', 'wrong recovery error')
  equal(JSON.stringify(await readLegacyRows()), JSON.stringify(before), 'legacy source changed')
  equal(await countStore(syncStoreNames.beans), 0, 'bean target was partially written')
  equal(await countStore(syncStoreNames.outbox), 0, 'Outbox target was partially written')
  equal(await countStore(syncStoreNames.migrationMeta), 0, 'migration meta was partially written')
}

async function checkCompletedFingerprint() {
  await deleteDatabase()
  const baseline = legacySnapshot([legacyBean('fingerprint baseline')])
  const blocker = await createVersionTwoDatabase([['beans', baseline]], [])
  blocker.close()
  await migrateLegacyOfflineData(userId, deviceId, 1)
  const targetsBefore = await readTargetRows()
  await putValue('snapshots', 'beans', legacySnapshot([legacyBean('fingerprint changed')]))

  const error = await captureError(() => migrateLegacyOfflineData(userId, deviceId, 999))
  equal(errorCode(error), 'LEGACY_MIGRATION_SOURCE_CHANGED', 'wrong fingerprint error')
  equal(JSON.stringify(await readTargetRows()), JSON.stringify(targetsBefore), 'completed targets changed')
}

async function checkBlockedOpen() {
  await deleteDatabase()
  const blocker = await createVersionTwoDatabase([], [])
  const firstOpening = openSyncDatabase()
  const first = await captureError(() => firstOpening)
  equal(first.message, 'IndexedDB open blocked', 'first open was not blocked')
  const second = await captureError(() => openSyncDatabase())
  assert(first === second, 'blocked open was not deduplicated to the same request error')
  blocker.close()
  await delay(100)
  await deleteDatabase()
}

async function checkEntityOutboxAbort() {
  await deleteDatabase()
  const bean = currentBean('atomic entity')
  const mutation = beanMutation(bean)
  const repository = createLocalRepository({
    beforeOutboxWrite() {
      throw new Error('forced entity/Outbox abort')
    },
  })
  const error = await captureError(() => repository.saveLocalEntity('beans', userId, bean, mutation))
  assert(error.message.includes('forced entity/Outbox abort'), 'forced abort was not observed')
  equal((await listLocalEntities('beans', userId)).length, 0, 'entity write survived abort')
  equal((await listOutbox(userId)).length, 0, 'Outbox write survived abort')
}

async function checkSnapshotMetaAbort() {
  await deleteDatabase()
  const bean = currentBean('server snapshot')
  const snapshot: SyncSnapshot = {
    syncEpoch: 2,
    serverTime: now,
    beans: [bean],
    brewLogs: [],
    brewTemplates: [],
    userSettings: null,
    aiRecommendations: [],
  }
  const repository = createLocalRepository({
    beforeCommit(operation) {
      if (operation === 'replaceServerSnapshot') throw new Error('forced snapshot/meta abort')
    },
  })
  const error = await captureError(() => repository.replaceServerSnapshot(userId, snapshot))
  assert(error.message.includes('forced snapshot/meta abort'), 'forced snapshot abort was not observed')
  equal((await listLocalEntities('beans', userId)).length, 0, 'snapshot row survived abort')
  equal(await countStore(syncStoreNames.syncMeta), 0, 'sync metadata survived abort')
}

function legacySnapshot(rows: unknown[]) {
  return { userId, updatedAt: now, rows }
}

function legacyBean(name: string) {
  return {
    id: entityId,
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
    created_at: now,
    updated_at: now,
    deleted_at: null,
    schema_version: 1,
  }
}

function currentBean(name: string): ServerBeanRow {
  return {
    ...legacyBean(name),
    bean_type: 'single_origin',
    blend_components: [],
    blend_notes: null,
  }
}

function beanMutation(bean: ServerBeanRow): Extract<SyncMutation, { entityType: 'bean'; operation: 'upsert' }> {
  const payloadGraph: Record<string, unknown> = { ...bean }
  for (const key of ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']) {
    delete payloadGraph[key]
  }
  const payload = payloadGraph as Extract<SyncMutation, {
    entityType: 'bean'
    operation: 'upsert'
  }>['payload']
  return {
    mutationId,
    deviceId,
    entityId: bean.id,
    entityType: 'bean',
    operation: 'upsert',
    payload,
    userId,
    baseSyncEpoch: 1,
    queuedAt: now,
    attemptCount: 0,
    status: 'pending',
    lastErrorCode: null,
    lastErrorMessage: null,
  }
}

function createVersionTwoDatabase(
  snapshots: Array<[IDBValidKey, unknown]>,
  pendingMutations: unknown[],
) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(syncDatabaseName, 2)
    request.onupgradeneeded = () => {
      const snapshotStore = request.result.createObjectStore('snapshots')
      const pendingStore = request.result.createObjectStore('pendingMutations', { keyPath: 'id' })
      for (const [key, value] of snapshots) snapshotStore.put(value, key)
      for (const value of pendingMutations) pendingStore.put(value)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('v2 database open failed'))
  })
}

async function deleteDatabase() {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(syncDatabaseName)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('database delete failed'))
    request.onblocked = () => reject(new Error('database delete blocked by leaked connection'))
  })
}

async function getValue(database: IDBDatabase, store: string, key: IDBValidKey) {
  return new Promise<unknown>((resolve, reject) => {
    const request = database.transaction(store).objectStore(store).get(key)
    request.onsuccess = () => resolve(request.result as unknown)
    request.onerror = () => reject(request.error ?? new Error(`${store} read failed`))
  })
}

async function putValue(store: string, key: IDBValidKey, value: unknown) {
  const database = await openSyncDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(store, 'readwrite')
      transaction.objectStore(store).put(value, key)
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error ?? new Error(`${store} write aborted`))
      transaction.onerror = () => reject(transaction.error ?? new Error(`${store} write failed`))
    })
  } finally {
    database.close()
  }
}

async function readLegacyRows() {
  const database = await openSyncDatabase()
  try {
    return {
      snapshots: await getAll(database, 'snapshots'),
      pendingMutations: await getAll(database, 'pendingMutations'),
    }
  } finally {
    database.close()
  }
}

async function readTargetRows() {
  const database = await openSyncDatabase()
  try {
    return {
      beans: await getAll(database, syncStoreNames.beans),
      outbox: await getAll(database, syncStoreNames.outbox),
      migrationMeta: await getAll(database, syncStoreNames.migrationMeta),
    }
  } finally {
    database.close()
  }
}

async function getAll(database: IDBDatabase, store: string) {
  return new Promise<unknown[]>((resolve, reject) => {
    const request = database.transaction(store).objectStore(store).getAll()
    request.onsuccess = () => resolve(request.result as unknown[])
    request.onerror = () => reject(request.error ?? new Error(`${store} read failed`))
  })
}

async function countStore(store: string) {
  const database = await openSyncDatabase()
  try {
    return await new Promise<number>((resolve, reject) => {
      const request = database.transaction(store).objectStore(store).count()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error(`${store} count failed`))
    })
  } finally {
    database.close()
  }
}

async function captureError(run: () => Promise<unknown>) {
  try {
    await run()
  } catch (error) {
    if (error instanceof Error) return error
    throw new Error(`non-Error rejection: ${String(error)}`, { cause: error })
  }
  throw new Error('expected operation to reject')
}

function errorCode(error: Error) {
  return 'code' in error ? String((error as Error & { code: unknown }).code) : ''
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function equal(actual: unknown, expected: unknown, message: string) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`)
  }
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
