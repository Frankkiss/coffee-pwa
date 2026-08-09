import type { ServerBeanRow } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import {
  createDeletePayload,
  createEntityId,
  createMutationId,
  type SyncMutation,
} from './syncTypes'
import {
  entityKey,
  openSyncDatabase,
  syncDatabaseName,
  syncStoreNames,
} from './syncDatabase'

const legacyStoreNames = {
  snapshots: 'snapshots',
  pendingMutations: 'pendingMutations',
} as const

const migrationMetaId = 'legacyMigration'
export const legacyMigrationVersion = 7 as const

const legacyBeanFields = new Set([
  'id',
  'user_id',
  'name',
  'roaster',
  'origin',
  'farm_or_station',
  'process',
  'variety',
  'altitude_meters',
  'roast_date',
  'roast_level',
  'flavor_tags',
  'flavor_notes',
  'net_weight_grams',
  'price',
  'purchase_date',
  'source_url',
  'image_url',
  'bean_type',
  'blend_components',
  'blend_notes',
  'notes',
  'created_at',
  'updated_at',
  'deleted_at',
  'schema_version',
])

const legacyBrewFields = new Set([
  'id',
  'user_id',
  'bean_id',
  'brewed_at',
  'method',
  'dripper',
  'filter_paper',
  'grinder',
  'grind_setting',
  'coffee_grams',
  'water_grams',
  'ratio',
  'water_temperature_c',
  'total_time_seconds',
  'pour_steps',
  'rating',
  'acidity',
  'sweetness',
  'bitterness',
  'astringency',
  'body',
  'aftertaste',
  'flavor_tags',
  'is_pinned_recipe',
  'notes',
  'created_at',
  'updated_at',
  'deleted_at',
  'schema_version',
])

export type LegacyMigrationCounts = {
  sourceSnapshots: number
  sourceMutations: number
  migratedBeans: number
  migratedBrewLogs: number
  migratedMutations: number
}

export type LegacyMigrationResult = {
  status: 'completed'
  migrationVersion: typeof legacyMigrationVersion
  userId: string
  deviceId: string
  syncEpoch: number
  completedAt: string
  sourceFingerprint: string
  idMap: Record<string, string>
  sourcePreserved: true
  counts: LegacyMigrationCounts
}

export type LegacyRecoveryExport = {
  exportedAt: string
  userId: string
  snapshots: unknown[]
  pendingMutations: unknown[]
}

type LegacyEntityType = 'bean' | 'brewLog'
type LegacyAction = 'create' | 'update' | 'delete'

type LegacySnapshot = {
  key: 'beans' | 'brewLogs'
  userId: string
  updatedAt: string
  rows: unknown[]
}

type ParsedLegacyMutation = {
  id: string
  userId: string
  entity: LegacyEntityType
  action: LegacyAction
  entityId: string
  payload: Record<string, unknown> | undefined
  createdAt: string
  createdAtInstant: bigint
  attempts: number
  lastError: string | null
}

type MigratedEntity =
  | {
      type: 'bean'
      originalId: string
      source: 'snapshot' | 'pending'
      row: ServerBeanRow
    }
  | {
      type: 'brewLog'
      originalId: string
      source: 'snapshot' | 'pending'
      row: BrewLog
    }

type StoredEnvelope<Value> = {
  key: string
  userId: string
  value: Value
}

type TransactionAbort = (error: unknown) => void

export type LegacyMigrationTestOptions = {
  beforeCommit?: () => void
}

export class LegacyMigrationError extends Error {
  readonly code:
    | 'LEGACY_MIGRATION_FAILED'
    | 'LEGACY_MIGRATION_UPGRADE_REQUIRED'
    | 'LEGACY_MIGRATION_RECOVERY_REQUIRED'
    | 'LEGACY_MIGRATION_SOURCE_CHANGED'

  constructor(
    message: string,
    code:
      | 'LEGACY_MIGRATION_FAILED'
      | 'LEGACY_MIGRATION_UPGRADE_REQUIRED'
      | 'LEGACY_MIGRATION_RECOVERY_REQUIRED'
      | 'LEGACY_MIGRATION_SOURCE_CHANGED' = 'LEGACY_MIGRATION_FAILED',
  ) {
    super(message)
    this.name = 'LegacyMigrationError'
    this.code = code
  }
}

export async function migrateLegacyOfflineData(
  userId: string,
  deviceId: string,
  syncEpoch: number,
  testOptions: LegacyMigrationTestOptions = {},
): Promise<LegacyMigrationResult> {
  assertUuid(userId, 'user id')

  const database = await openSyncDatabase()
  try {
    return await runMigrationTransaction(
      database,
      userId,
      deviceId,
      syncEpoch,
      testOptions,
    )
  } finally {
    database.close()
  }
}

export async function exportLegacyRecoveryData(
  userId: string,
): Promise<LegacyRecoveryExport> {
  assertUuid(userId, 'user id')
  const database = await openExistingDatabaseReadOnly()
  try {
    if (
      !database.objectStoreNames.contains(legacyStoreNames.snapshots) ||
      !database.objectStoreNames.contains(legacyStoreNames.pendingMutations)
    ) {
      throw new LegacyMigrationError('Legacy recovery stores are unavailable')
    }

    const transaction = database.transaction(
      [legacyStoreNames.snapshots, legacyStoreNames.pendingMutations],
      'readonly',
    )
    const snapshotStore = transaction.objectStore(legacyStoreNames.snapshots)
    const pendingStore = transaction.objectStore(
      legacyStoreNames.pendingMutations,
    )
    const [snapshotKeys, snapshots, pendingMutations] = await Promise.all([
      requestResult(snapshotStore.getAllKeys(), 'Legacy snapshot key read failed'),
      requestResult(snapshotStore.getAll(), 'Legacy snapshot read failed'),
      requestResult(pendingStore.getAll(), 'Legacy mutation read failed'),
    ])
    await waitForReadonlyTransaction(transaction)

    return {
      exportedAt: new Date().toISOString(),
      userId,
      snapshots: snapshots.flatMap((value, index) => {
        if (!isRecord(value) || value.userId !== userId) return []
        const rows = Array.isArray(value.rows)
          ? value.rows.filter(
              (row) => isRecord(row) && row.user_id === userId,
            )
          : []
        return [{ key: snapshotKeys[index], value: { ...value, rows } }]
      }),
      pendingMutations: pendingMutations.filter(
        (value) => isRecoveryMutationOwnedBy(value, userId),
      ),
    }
  } finally {
    database.close()
  }
}

function runMigrationTransaction(
  database: IDBDatabase,
  userId: string,
  deviceId: string,
  syncEpoch: number,
  testOptions: LegacyMigrationTestOptions,
) {
  return new Promise<LegacyMigrationResult>((resolve, reject) => {
    const transaction = database.transaction(
      [
        legacyStoreNames.snapshots,
        legacyStoreNames.pendingMutations,
        syncStoreNames.beans,
        syncStoreNames.brewLogs,
        syncStoreNames.outbox,
        syncStoreNames.migrationMeta,
      ],
      'readwrite',
    )
    let result: LegacyMigrationResult | undefined
    let failure: Error | DOMException | undefined
    let settled = false

    const abort: TransactionAbort = (error) => {
      if (failure === undefined) {
        failure = normalizeError(error)
      }
      try {
        transaction.abort()
      } catch {
        if (!settled) {
          settled = true
          reject(failure)
        }
      }
    }

    transaction.oncomplete = () => {
      if (settled) return
      settled = true
      if (result === undefined) {
        reject(failure ?? new LegacyMigrationError('Legacy migration produced no result'))
      } else {
        resolve(structuredClone(result))
      }
    }
    transaction.onerror = () => {
      if (failure === undefined && transaction.error !== null) {
        failure = transaction.error
      }
    }
    transaction.onabort = () => {
      if (settled) return
      settled = true
      reject(
        failure ??
          transaction.error ??
          new LegacyMigrationError('Legacy migration transaction aborted'),
      )
    }

    const metaKey = entityKey(userId, migrationMetaId)
    const metaRequest = transaction
      .objectStore(syncStoreNames.migrationMeta)
      .get(metaKey)
    metaRequest.onerror = () =>
      abort(metaRequest.error ?? new LegacyMigrationError('Migration metadata read failed'))
    metaRequest.onsuccess = () => {
      try {
        const completed = readCompletedMigration(metaRequest.result, userId, metaKey)
        if (completed === null) {
          assertUuid(deviceId, 'device id')
          assertPositiveInteger(syncEpoch, 'sync epoch')
        }
        scheduleMigrationReads(
          transaction,
          userId,
          deviceId,
          syncEpoch,
          metaKey,
          testOptions,
          completed,
          (completedResult) => {
            result = completedResult
          },
          abort,
        )
      } catch (error) {
        abort(error)
      }
    }
  })
}

function scheduleMigrationReads(
  transaction: IDBTransaction,
  userId: string,
  deviceId: string,
  syncEpoch: number,
  metaKey: string,
  testOptions: LegacyMigrationTestOptions,
  storedCompleted: LegacyMigrationResult | null,
  setResult: (result: LegacyMigrationResult) => void,
  abort: TransactionAbort,
) {
  const requests = {
    beanSnapshot: transaction
      .objectStore(legacyStoreNames.snapshots)
      .get('beans'),
    brewSnapshot: transaction
      .objectStore(legacyStoreNames.snapshots)
      .get('brewLogs'),
    pending: transaction
      .objectStore(legacyStoreNames.pendingMutations)
      .getAll(),
    targetBeans: transaction.objectStore(syncStoreNames.beans).getAll(),
    targetBrews: transaction.objectStore(syncStoreNames.brewLogs).getAll(),
    targetOutbox: transaction.objectStore(syncStoreNames.outbox).getAll(),
  }
  let remaining = Object.keys(requests).length

  const finishRead = () => {
    remaining -= 1
    if (remaining !== 0) return
    try {
      const sourceFingerprint = createLegacySourceFingerprint(
        userId,
        requests.beanSnapshot.result,
        requests.brewSnapshot.result,
        requests.pending.result,
      )
      if (storedCompleted !== null) {
        if (storedCompleted.sourceFingerprint !== sourceFingerprint) {
          throwLegacyMigrationSourceChanged()
        }
        setResult(storedCompleted)
        return
      }
      const completed = prepareMigration(
        userId,
        deviceId,
        syncEpoch,
        requests.beanSnapshot.result,
        requests.brewSnapshot.result,
        requests.pending.result,
        requests.targetBeans.result,
        requests.targetBrews.result,
        requests.targetOutbox.result,
        sourceFingerprint,
      )
      writeMigration(
        transaction,
        userId,
        metaKey,
        completed,
        testOptions,
        abort,
      )
      setResult(completed.result)
    } catch (error) {
      abort(error)
    }
  }

  for (const request of Object.values(requests)) {
    request.onerror = () =>
      abort(request.error ?? new LegacyMigrationError('Legacy migration read failed'))
    request.onsuccess = finishRead
  }
}

function prepareMigration(
  userId: string,
  deviceId: string,
  syncEpoch: number,
  rawBeanSnapshot: unknown,
  rawBrewSnapshot: unknown,
  rawPending: unknown,
  rawTargetBeans: unknown,
  rawTargetBrews: unknown,
  rawTargetOutbox: unknown,
  sourceFingerprint: string,
) {
  const targetBeans = assertUnknownArray(rawTargetBeans, 'target bean rows')
  const targetBrews = assertUnknownArray(rawTargetBrews, 'target brew rows')
  const targetOutbox = assertUnknownArray(rawTargetOutbox, 'target Outbox rows')
  if (
    targetBeans.some((row) => targetRowPointsToUser(row, userId)) ||
    targetBrews.some((row) => targetRowPointsToUser(row, userId)) ||
    targetOutbox.some((row) => targetRowPointsToUser(row, userId))
  ) {
    throw new LegacyMigrationError(
      'Legacy migration target conflict: current-user v3 data already exists',
    )
  }

  const snapshots = [
    readOwnedSnapshot('beans', rawBeanSnapshot, userId),
    readOwnedSnapshot('brewLogs', rawBrewSnapshot, userId),
  ].filter((snapshot): snapshot is LegacySnapshot => snapshot !== null)
  const pendingRows = assertUnknownArray(rawPending, 'legacy mutation rows').filter(
    (row) => isRecord(row) && row.userId === userId,
  )
  const localIds = collectLocalIds(snapshots, pendingRows)
  const reservedEntityIds = collectReservedEntityIds(
    snapshots,
    pendingRows,
    [...targetBeans, ...targetBrews, ...targetOutbox],
  )
  const idMap = createPermanentIdMap(localIds, reservedEntityIds)
  const pending = pendingRows
    .map((row) => parseLegacyMutation(row, userId, idMap))
    .sort((left, right) => {
      const instantOrder = compareInstants(
        left.createdAtInstant,
        right.createdAtInstant,
      )
      return instantOrder || left.id.localeCompare(right.id)
    })
  assertSnapshotLocalCreateProof(snapshots, pending)

  const entities = buildMigratedEntities(
    snapshots,
    pending,
    userId,
    idMap,
  )
  assertMigratedReferences(entities, idMap)
  const existingOutboxKeys = new Set(
    targetOutbox.flatMap((row) =>
      isRecord(row) && typeof row.key === 'string'
        ? [normalizeUuidKey(row.key)]
        : [],
    ),
  )
  const generatedMutationIds = new Set<string>()
  const convertedMutations = pending.map((mutation, index) => {
    const entity = entities.get(entityLookupKey(mutation.entity, mutation.entityId))
    if (mutation.action !== 'delete' && entity === undefined) {
      throw new LegacyMigrationError(
        `Legacy ${mutation.entity} upsert has no complete entity row`,
      )
    }
    const entityId = rewriteEntityId(
      mutation.entityId,
      mutation.entity,
      idMap,
      'mutation entity id',
    )
    const mutationId = createUniqueMutationId(existingOutboxKeys, generatedMutationIds)
    const base = {
      mutationId,
      deviceId,
      entityId,
      entityType: mutation.entity,
      userId,
      baseSyncEpoch: syncEpoch,
      queuedAt: createOrderedQueuedAt(mutation.createdAt, index),
      attemptCount: 0,
      status: 'pending' as const,
      lastErrorCode: null,
      lastErrorMessage: null,
    }
    if (mutation.action === 'delete') {
      return {
        ...base,
        operation: 'delete' as const,
        payload: createDeletePayload(),
      } as SyncMutation
    }
    if (entity === undefined || entity.type !== mutation.entity) {
      throw new LegacyMigrationError('Legacy mutation entity type mismatch')
    }
    return {
      ...base,
      operation: 'upsert' as const,
      payload: createUpsertPayload(entity),
    } as SyncMutation
  })
  const mutations = convertedMutations
  const beans = [...entities.values()].flatMap((entity) =>
    entity.type === 'bean' ? [entity.row] : [],
  )
  const brewLogs = [...entities.values()].flatMap((entity) =>
    entity.type === 'brewLog' ? [entity.row] : [],
  )
  const result: LegacyMigrationResult = {
    status: 'completed',
    migrationVersion: legacyMigrationVersion,
    userId,
    deviceId,
    syncEpoch,
    completedAt: new Date().toISOString(),
    sourceFingerprint,
    idMap,
    sourcePreserved: true,
    counts: {
      sourceSnapshots: snapshots.length,
      sourceMutations: pending.length,
      migratedBeans: beans.length,
      migratedBrewLogs: brewLogs.length,
      migratedMutations: mutations.length,
    },
  }
  return { beans, brewLogs, mutations, result }
}

function writeMigration(
  transaction: IDBTransaction,
  userId: string,
  metaKey: string,
  migration: ReturnType<typeof prepareMigration>,
  testOptions: LegacyMigrationTestOptions,
  abort: TransactionAbort,
) {
  try {
    const beanStore = transaction.objectStore(syncStoreNames.beans)
    const brewStore = transaction.objectStore(syncStoreNames.brewLogs)
    const outboxStore = transaction.objectStore(syncStoreNames.outbox)
    for (const bean of migration.beans) {
      beanStore.put(createEntityEnvelope(userId, bean))
    }
    for (const brewLog of migration.brewLogs) {
      brewStore.put(createEntityEnvelope(userId, brewLog))
    }
    for (const mutation of migration.mutations) {
      outboxStore.put({
        key: mutation.mutationId,
        userId,
        value: mutation,
      } satisfies StoredEnvelope<SyncMutation>)
    }
    transaction.objectStore(syncStoreNames.migrationMeta).put({
      key: metaKey,
      userId,
      value: migration.result,
    } satisfies StoredEnvelope<LegacyMigrationResult>)
    testOptions.beforeCommit?.()
  } catch (error) {
    abort(error)
  }
}

function buildMigratedEntities(
  snapshots: LegacySnapshot[],
  pending: ParsedLegacyMutation[],
  userId: string,
  idMap: Record<string, string>,
) {
  const entities = new Map<string, MigratedEntity>()
  for (const snapshot of snapshots) {
    for (const rawRow of snapshot.rows) {
      const entity =
        snapshot.key === 'beans'
          ? createBeanEntity(rawRow, userId, idMap, 'snapshot')
          : createBrewEntity(rawRow, userId, idMap, 'snapshot')
      const key = entityLookupKey(entity.type, entity.originalId)
      if (entities.has(key)) {
        throw new LegacyMigrationError(`Duplicate legacy ${entity.type} id`)
      }
      entities.set(key, entity)
    }
  }

  for (const mutation of pending) {
    if (mutation.action === 'delete') continue
    const key = entityLookupKey(mutation.entity, mutation.entityId)
    const current = entities.get(key)
    if (current?.source === 'snapshot') {
      entities.set(key, mergePendingEntity(current, mutation, userId, idMap))
      continue
    }

    if (mutation.action === 'create') {
      entities.set(
        key,
        reconstructEntityFromCreate(mutation, userId, idMap),
      )
      continue
    }
    if (current === undefined) {
      throw new LegacyMigrationError(
        `Legacy ${mutation.entity} upsert has no complete entity row`,
      )
    }
    entities.set(key, mergePendingEntity(current, mutation, userId, idMap))
  }

  const lastMutationByEntity = new Map<string, ParsedLegacyMutation>()
  for (const mutation of pending) {
    lastMutationByEntity.set(
      entityLookupKey(mutation.entity, mutation.entityId),
      mutation,
    )
  }
  for (const [key, entity] of entities) {
    const lastMutation = lastMutationByEntity.get(key)
    if (lastMutation === undefined) continue
    if (lastMutation.action === 'delete') {
      entity.row = {
        ...entity.row,
        updated_at: lastMutation.createdAt,
        deleted_at: lastMutation.createdAt,
      }
    } else if (entity.row.deleted_at !== null) {
      entity.row = { ...entity.row, deleted_at: null }
    }
  }
  return entities
}

function reconstructEntityFromCreate(
  mutation: ParsedLegacyMutation,
  userId: string,
  idMap: Record<string, string>,
): MigratedEntity {
  const payload = mutation.payload
  if (payload === undefined || payload.user_id !== userId) {
    throw new LegacyMigrationError(
      `Legacy ${mutation.entity} create cannot rebuild a complete entity`,
    )
  }
  const common = {
    ...payload,
    id: mutation.entityId,
    user_id: userId,
    created_at: mutation.createdAt,
    updated_at: mutation.createdAt,
    deleted_at: null,
    schema_version: 1,
  }
  return mutation.entity === 'bean'
    ? createBeanEntity(
        { ...common, image_url: payload.image_url ?? null },
        userId,
        idMap,
        'pending',
      )
    : createBrewEntity(
        { ...common, brewed_at: payload.brewed_at ?? mutation.createdAt },
        userId,
        idMap,
        'pending',
      )
}

function mergePendingEntity(
  entity: MigratedEntity,
  mutation: ParsedLegacyMutation,
  userId: string,
  idMap: Record<string, string>,
): MigratedEntity {
  const payload = mutation.payload
  if (payload === undefined) {
    throw new LegacyMigrationError('Legacy update payload is required')
  }
  const merged = {
    ...entity.row,
    ...payload,
    id: entity.originalId,
    user_id: userId,
    created_at: entity.row.created_at,
    updated_at: mutation.createdAt,
    deleted_at: null,
    schema_version: 1,
  }
  return entity.type === 'bean'
    ? createBeanEntity(merged, userId, idMap, 'pending')
    : createBrewEntity(merged, userId, idMap, 'pending')
}

function createBeanEntity(
  raw: unknown,
  userId: string,
  idMap: Record<string, string>,
  source: 'snapshot' | 'pending',
): MigratedEntity & { type: 'bean' } {
  const record = assertJsonRecord(raw, 'legacy bean row')
  assertKnownLegacyFields(record, legacyBeanFields, 'bean row')
  assertOwnedRow(record, userId, 'bean')
  assertLegacySchemaVersion(record.schema_version, 'bean schema version')
  const originalId = assertString(record.id, 'bean id')
  const id = rewriteEntityId(originalId, 'bean', idMap, 'bean id')
  const name = assertNonEmptyString(record.name, 'bean name')
  const createdAt = canonicalTime(record.created_at, 'bean created_at')
  const updatedAt = canonicalTime(record.updated_at, 'bean updated_at')
  assertTimeOrder(createdAt, updatedAt, 'bean timestamps')
  const blendComponents = optionalBlendComponents(record.blend_components)
  const beanType =
    record.bean_type === undefined
      ? blendComponents.length > 0
        ? 'blend'
        : 'single_origin'
      : record.bean_type === 'single_origin' || record.bean_type === 'blend'
        ? record.bean_type
        : fail('Invalid bean type')
  return {
    type: 'bean',
    originalId,
    source,
    row: {
      id,
      user_id: userId,
      name,
      roaster: optionalNullableString(record.roaster, 'bean roaster'),
      origin: optionalNullableString(record.origin, 'bean origin'),
      farm_or_station: optionalNullableString(record.farm_or_station, 'bean farm_or_station'),
      process: optionalNullableString(record.process, 'bean process'),
      variety: optionalNullableString(record.variety, 'bean variety'),
      altitude_meters: optionalNullableNumber(record.altitude_meters, 'bean altitude_meters'),
      roast_date: optionalCalendarDate(record.roast_date, 'bean roast_date'),
      roast_level: optionalNullableString(record.roast_level, 'bean roast_level'),
      flavor_tags: optionalStringArray(record.flavor_tags, 'bean flavor_tags'),
      flavor_notes: optionalNullableString(record.flavor_notes, 'bean flavor_notes'),
      net_weight_grams: optionalNullableNumber(record.net_weight_grams, 'bean net_weight_grams'),
      price: optionalNullableNumber(record.price, 'bean price'),
      purchase_date: optionalCalendarDate(record.purchase_date, 'bean purchase_date'),
      source_url: optionalNullableString(record.source_url, 'bean source_url'),
      image_url: optionalNullableString(record.image_url, 'bean image_url'),
      bean_type: beanType,
      blend_components: blendComponents,
      blend_notes: optionalNullableString(record.blend_notes, 'bean blend_notes'),
      notes: optionalNullableString(record.notes, 'bean notes'),
      created_at: createdAt,
      updated_at: updatedAt,
      deleted_at: optionalCanonicalTime(record.deleted_at, 'bean deleted_at'),
      schema_version: 1,
    },
  }
}

function createBrewEntity(
  raw: unknown,
  userId: string,
  idMap: Record<string, string>,
  source: 'snapshot' | 'pending',
): MigratedEntity & { type: 'brewLog' } {
  const record = assertJsonRecord(raw, 'legacy brew row')
  assertKnownLegacyFields(record, legacyBrewFields, 'brew row')
  assertOwnedRow(record, userId, 'brew')
  assertLegacySchemaVersion(record.schema_version, 'brew schema version')
  const originalId = assertString(record.id, 'brew id')
  const id = rewriteEntityId(originalId, 'brewLog', idMap, 'brew id')
  const createdAt = canonicalTime(record.created_at, 'brew created_at')
  const updatedAt = canonicalTime(record.updated_at, 'brew updated_at')
  assertTimeOrder(createdAt, updatedAt, 'brew timestamps')
  return {
    type: 'brewLog',
    originalId,
    source,
    row: {
      id,
      user_id: userId,
      bean_id: rewriteBeanReference(record.bean_id, idMap),
      brewed_at: canonicalTime(record.brewed_at, 'brew brewed_at'),
      method: optionalNullableString(record.method, 'brew method'),
      dripper: optionalNullableString(record.dripper, 'brew dripper'),
      filter_paper: optionalNullableString(record.filter_paper, 'brew filter_paper'),
      grinder: optionalNullableString(record.grinder, 'brew grinder'),
      grind_setting: optionalNullableString(record.grind_setting, 'brew grind_setting'),
      coffee_grams: optionalNullableNumber(record.coffee_grams, 'brew coffee_grams'),
      water_grams: optionalNullableNumber(record.water_grams, 'brew water_grams'),
      ratio: optionalNullableString(record.ratio, 'brew ratio'),
      water_temperature_c: optionalNullableNumber(record.water_temperature_c, 'brew water_temperature_c'),
      total_time_seconds: optionalNullableNumber(record.total_time_seconds, 'brew total_time_seconds'),
      pour_steps: optionalJsonArray(record.pour_steps, 'brew pour_steps'),
      rating: optionalNullableNumber(record.rating, 'brew rating'),
      acidity: optionalNullableNumber(record.acidity, 'brew acidity'),
      sweetness: optionalNullableNumber(record.sweetness, 'brew sweetness'),
      bitterness: optionalNullableNumber(record.bitterness, 'brew bitterness'),
      astringency: optionalNullableNumber(record.astringency, 'brew astringency'),
      body: optionalNullableNumber(record.body, 'brew body'),
      aftertaste: optionalNullableNumber(record.aftertaste, 'brew aftertaste'),
      flavor_tags: optionalStringArray(record.flavor_tags, 'brew flavor_tags'),
      is_pinned_recipe: optionalBoolean(record.is_pinned_recipe, 'brew is_pinned_recipe'),
      notes: optionalNullableString(record.notes, 'brew notes'),
      created_at: createdAt,
      updated_at: updatedAt,
      deleted_at: optionalCanonicalTime(record.deleted_at, 'brew deleted_at'),
      schema_version: 1,
    },
  }
}

function parseLegacyMutation(
  raw: unknown,
  userId: string,
  idMap: Record<string, string>,
): ParsedLegacyMutation {
  const record = assertJsonRecord(raw, 'legacy mutation')
  if (record.userId !== userId) {
    throw new LegacyMigrationError('Legacy mutation ownership does not match user')
  }
  const id = assertNonEmptyString(record.id, 'legacy mutation id')
  const entity =
    record.entity === 'bean' || record.entity === 'brewLog'
      ? record.entity
      : fail('Invalid legacy mutation entity')
  const action =
    record.action === 'create' ||
    record.action === 'update' ||
    record.action === 'delete'
      ? record.action
      : fail('Invalid legacy mutation action')
  const entityId = assertString(record.entityId, 'legacy mutation entity id')
  rewriteEntityId(entityId, entity, idMap, 'legacy mutation entity id')
  const payload = record.payload
  if (action === 'delete') {
    if (payload !== undefined && (!isPlainRecord(payload) || Object.keys(payload).length !== 0)) {
      throw new LegacyMigrationError('Legacy delete payload must be absent or empty')
    }
  } else if (!isPlainRecord(payload) || !isJsonValue(payload)) {
    throw new LegacyMigrationError('Legacy upsert payload must be a JSON object')
  }
  const parsedPayload = isPlainRecord(payload) ? payload : undefined
  if (action !== 'delete' && parsedPayload !== undefined) {
    assertKnownLegacyFields(
      parsedPayload,
      entity === 'bean' ? legacyBeanFields : legacyBrewFields,
      `${entity} mutation payload`,
    )
  }
  if (parsedPayload?.user_id !== undefined && parsedPayload.user_id !== userId) {
    throw new LegacyMigrationError('Legacy mutation payload ownership does not match user')
  }
  if (action !== 'delete' && parsedPayload?.schema_version !== undefined) {
    assertLegacySchemaVersion(
      parsedPayload.schema_version,
      `legacy ${entity} mutation schema version`,
    )
  }
  if (parsedPayload?.id !== undefined) {
    const payloadId = assertString(parsedPayload.id, 'legacy payload id')
    if (payloadId !== entityId) {
      throw new LegacyMigrationError('Legacy payload id does not match mutation entity id')
    }
    rewriteEntityId(payloadId, entity, idMap, 'legacy payload id')
  }
  if (entity === 'brewLog' && parsedPayload?.bean_id !== undefined) {
    rewriteBeanReference(parsedPayload.bean_id, idMap)
  }
  const attempts = record.attempts
  if (typeof attempts !== 'number' || !Number.isInteger(attempts) || attempts < 0) {
    throw new LegacyMigrationError('Invalid legacy mutation attempts')
  }
  const lastError = record.lastError
  if (lastError !== null && typeof lastError !== 'string') {
    throw new LegacyMigrationError('Invalid legacy mutation lastError')
  }
  return {
    id,
    userId,
    entity,
    action,
    entityId,
    payload: parsedPayload,
    createdAt: canonicalTime(record.createdAt, 'legacy mutation createdAt'),
    createdAtInstant: canonicalInstantNanoseconds(
      record.createdAt,
      'legacy mutation createdAt',
    ),
    attempts,
    lastError,
  }
}

function readOwnedSnapshot(
  key: LegacySnapshot['key'],
  raw: unknown,
  userId: string,
): LegacySnapshot | null {
  if (!isRecord(raw) || raw.userId !== userId) return null
  const rows = assertUnknownArray(raw.rows, `legacy ${key} snapshot rows`)
  return {
    key,
    userId,
    updatedAt: canonicalTime(raw.updatedAt, `legacy ${key} snapshot updatedAt`),
    rows,
  }
}

function isRecoveryMutationOwnedBy(value: unknown, userId: string) {
  if (!isRecord(value) || value.userId !== userId) return false
  return !(
    isRecord(value.payload) &&
    Object.hasOwn(value.payload, 'user_id') &&
    value.payload.user_id !== userId
  )
}

function createLegacySourceFingerprint(
  userId: string,
  rawBeanSnapshot: unknown,
  rawBrewSnapshot: unknown,
  rawPending: unknown,
) {
  const filterSnapshot = (raw: unknown) => {
    if (!isRecord(raw) || raw.userId !== userId) return null
    const rows = Array.isArray(raw.rows)
      ? [...raw.rows].sort((left, right) => {
          const leftValue = stableSerialize(left)
          const rightValue = stableSerialize(right)
          return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0
        })
      : raw.rows
    return {
      ...raw,
      rows,
    }
  }
  const pending = assertUnknownArray(
    rawPending,
    'legacy mutation rows for fingerprint',
  )
    .filter((row) => isRecord(row) && row.userId === userId)
    .map(stableSerialize)
    .sort()
  const manifest = stableSerialize({
    snapshots: [
      ['beans', filterSnapshot(rawBeanSnapshot)],
      ['brewLogs', filterSnapshot(rawBrewSnapshot)],
    ],
    pending,
  })
  const bytes = new TextEncoder().encode(manifest)
  const first = fnv1a64(bytes, 0xcbf29ce484222325n)
  const second = fnv1a64(bytes, 0x84222325cbf29ce4n)
  return `fnv1a128:${first}${second}`
}

function stableSerialize(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return `string:${JSON.stringify(value)}`
  if (typeof value === 'boolean') return value ? 'boolean:true' : 'boolean:false'
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'number:NaN'
    if (value === Number.POSITIVE_INFINITY) return 'number:+Infinity'
    if (value === Number.NEGATIVE_INFINITY) return 'number:-Infinity'
    if (Object.is(value, -0)) return 'number:-0'
    return `number:${value}`
  }
  if (typeof value === 'bigint') return `bigint:${value}`
  if (Array.isArray(value)) {
    return `array:[${value.map(stableSerialize).join(',')}]`
  }
  if (isRecord(value)) {
    return `object:{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(',')}}`
  }
  return `${typeof value}:${String(value)}`
}

function fnv1a64(bytes: Uint8Array, offset: bigint) {
  const mask = 0xffffffffffffffffn
  const prime = 0x100000001b3n
  let hash = offset
  for (const byte of bytes) {
    hash = ((hash ^ BigInt(byte)) * prime) & mask
  }
  return hash.toString(16).padStart(16, '0')
}

function collectLocalIds(
  snapshots: LegacySnapshot[],
  pendingRows: unknown[],
) {
  const ids = new Set<string>()
  const visitRecord = (record: Record<string, unknown>) => {
    collectLocalId(record.id, ids)
    collectLocalId(record.entityId, ids)
    collectLocalId(record.bean_id, ids)
    if (isRecord(record.payload)) {
      collectLocalId(record.payload.id, ids)
      collectLocalId(record.payload.bean_id, ids)
    }
  }
  for (const snapshot of snapshots) {
    for (const row of snapshot.rows) {
      if (isRecord(row)) visitRecord(row)
    }
  }
  for (const row of pendingRows) {
    if (isRecord(row)) visitRecord(row)
  }
  return ids
}

function collectLocalId(value: unknown, ids: Set<string>) {
  if (typeof value === 'string' && isRecognizedLocalId(value)) ids.add(value)
}

function collectReservedEntityIds(
  snapshots: LegacySnapshot[],
  pendingRows: unknown[],
  targetRows: unknown[],
) {
  const ids = new Set<string>()
  const add = (value: unknown) => {
    if (isUuid(value)) ids.add(value.toLowerCase())
  }
  for (const snapshot of snapshots) {
    for (const row of snapshot.rows) {
      if (!isRecord(row)) continue
      add(row.id)
      add(row.bean_id)
    }
  }
  for (const row of pendingRows) {
    if (!isRecord(row)) continue
    add(row.entityId)
    if (isRecord(row.payload)) {
      add(row.payload.id)
      add(row.payload.bean_id)
    }
  }
  for (const row of targetRows) {
    if (!isRecord(row)) continue
    add(row.id)
    add(row.entityId)
    if (typeof row.key === 'string') {
      add(row.key.slice(row.key.lastIndexOf(':') + 1))
    }
    if (isRecord(row.value)) {
      add(row.value.id)
      add(row.value.bean_id)
      add(row.value.entityId)
    }
  }
  return ids
}

function assertSnapshotLocalCreateProof(
  snapshots: LegacySnapshot[],
  pending: ParsedLegacyMutation[],
) {
  const provenCreates = new Set(
    pending.flatMap((mutation) =>
      mutation.action === 'create'
        ? [entityLookupKey(mutation.entity, mutation.entityId)]
        : [],
    ),
  )
  const requireCreate = (entity: LegacyEntityType, id: unknown) => {
    if (
      typeof id === 'string' &&
      isRecognizedLocalId(id) &&
      !provenCreates.has(entityLookupKey(entity, id))
    ) {
      throwLegacyMigrationRecoveryRequired(
        `local entity ${id} has no proven create chain`,
      )
    }
  }

  for (const snapshot of snapshots) {
    for (const row of snapshot.rows) {
      if (!isRecord(row)) continue
      if (snapshot.key === 'beans') {
        requireCreate('bean', row.id)
      } else {
        requireCreate('brewLog', row.id)
        requireCreate('bean', row.bean_id)
      }
    }
  }
}

function throwLegacyMigrationRecoveryRequired(reason: string): never {
  throw new LegacyMigrationError(
    `Legacy migration recovery required: ${reason}; preserve local data and call exportLegacyRecoveryData(userId)`,
    'LEGACY_MIGRATION_RECOVERY_REQUIRED',
  )
}

function assertMigratedReferences(
  entities: Map<string, MigratedEntity>,
  idMap: Record<string, string>,
) {
  const migratedBeanIds = new Set(
    [...entities.values()].flatMap((entity) =>
      entity.type === 'bean' ? [entity.row.id] : [],
    ),
  )
  const mappedLocalBeanIds = new Set(
    Object.entries(idMap).flatMap(([sourceId, targetId]) =>
      isLocalBeanId(sourceId) ? [targetId] : [],
    ),
  )
  for (const entity of entities.values()) {
    if (
      entity.type === 'brewLog' &&
      entity.row.bean_id !== null &&
      mappedLocalBeanIds.has(entity.row.bean_id) &&
      !migratedBeanIds.has(entity.row.bean_id)
    ) {
      throw new LegacyMigrationError(
        'Legacy brew references a local bean that cannot be migrated',
      )
    }
  }
}

function createUpsertPayload(entity: MigratedEntity) {
  const payload = { ...entity.row } as Record<string, unknown>
  for (const key of ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']) {
    delete payload[key]
  }
  return payload
}

function createEntityEnvelope(
  userId: string,
  entity: ServerBeanRow | BrewLog,
): StoredEnvelope<ServerBeanRow | BrewLog> {
  return {
    key: entityKey(userId, entity.id),
    userId,
    value: entity,
  }
}

function readCompletedMigration(
  raw: unknown,
  userId: string,
  expectedKey: string,
): LegacyMigrationResult | null {
  if (raw === undefined) return null
  if (
    !isRecord(raw) ||
    raw.key !== expectedKey ||
    raw.userId !== userId ||
    !isRecord(raw.value)
  ) {
    throw new LegacyMigrationError('Current-user migration metadata is corrupt')
  }
  const value = raw.value
  if (value.migrationVersion !== legacyMigrationVersion) {
    throwLegacyMigrationUpgradeRequired()
  }
  if (
    value.status !== 'completed' ||
    value.userId !== userId ||
    typeof value.deviceId !== 'string' ||
    !isUuid(value.deviceId) ||
    typeof value.syncEpoch !== 'number' ||
    !Number.isInteger(value.syncEpoch) ||
    value.syncEpoch <= 0 ||
    typeof value.sourceFingerprint !== 'string' ||
    !/^fnv1a128:[0-9a-f]{32}$/.test(value.sourceFingerprint) ||
    value.sourcePreserved !== true ||
    !isRecord(value.idMap) ||
    !isRecord(value.counts)
  ) {
    throw new LegacyMigrationError('Completed migration metadata is invalid')
  }
  canonicalTime(value.completedAt, 'migration completedAt')
  for (const [sourceId, targetId] of Object.entries(value.idMap)) {
    if (!isRecognizedLocalId(sourceId) || !isUuid(targetId)) {
      throw new LegacyMigrationError('Completed migration id map is invalid')
    }
  }
  for (const key of [
    'sourceSnapshots',
    'sourceMutations',
    'migratedBeans',
    'migratedBrewLogs',
    'migratedMutations',
  ]) {
    const count = value.counts[key]
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
      throw new LegacyMigrationError('Completed migration counts are invalid')
    }
  }
  if (value.counts.sourceMutations !== value.counts.migratedMutations) {
    throwLegacyMigrationUpgradeRequired()
  }
  return value as LegacyMigrationResult
}

function throwLegacyMigrationUpgradeRequired(): never {
  throw new LegacyMigrationError(
    'Legacy migration upgrade required; preserve local data and call exportLegacyRecoveryData(userId)',
    'LEGACY_MIGRATION_UPGRADE_REQUIRED',
  )
}

function throwLegacyMigrationSourceChanged(): never {
  throw new LegacyMigrationError(
    'Legacy migration source changed after completion; preserve local data and call exportLegacyRecoveryData(userId)',
    'LEGACY_MIGRATION_SOURCE_CHANGED',
  )
}

function targetRowPointsToUser(raw: unknown, userId: string) {
  if (!isRecord(raw)) return false
  const value = isRecord(raw.value) ? raw.value : null
  return (
    raw.userId === userId ||
    (typeof raw.key === 'string' && raw.key.startsWith(`${userId}:`)) ||
    value?.user_id === userId ||
    value?.userId === userId
  )
}

function rewriteEntityId(
  id: string,
  entity: LegacyEntityType,
  idMap: Record<string, string>,
  label: string,
) {
  if (entity === 'bean' && isLocalBeanId(id)) return requireMappedId(id, idMap)
  if (entity === 'brewLog' && isLocalBrewId(id)) return requireMappedId(id, idMap)
  if (isRecognizedLocalId(id)) {
    throw new LegacyMigrationError(`Invalid ${label} prefix for ${entity}`)
  }
  assertUuid(id, label)
  return id
}

function rewriteBeanReference(
  value: unknown,
  idMap: Record<string, string>,
): string | null {
  if (value === undefined || value === null) return null
  const id = assertString(value, 'brew bean reference')
  if (isLocalBeanId(id)) return requireMappedId(id, idMap)
  if (isRecognizedLocalId(id)) {
    throw new LegacyMigrationError('Brew bean reference has the wrong local id type')
  }
  assertUuid(id, 'brew bean reference')
  return id
}

function requireMappedId(id: string, idMap: Record<string, string>) {
  const mapped = idMap[id]
  if (mapped === undefined) {
    throw new LegacyMigrationError(`Missing permanent id mapping for ${id}`)
  }
  return mapped
}

function createUniqueMutationId(
  existing: Set<string>,
  generated: Set<string>,
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = createMutationId()
    assertUuid(id, 'generated mutation id')
    const collisionKey = id.toLowerCase()
    if (!existing.has(collisionKey) && !generated.has(collisionKey)) {
      generated.add(collisionKey)
      return id
    }
  }
  throw new LegacyMigrationError('Could not allocate a unique mutation id')
}

function createPermanentIdMap(
  localIds: Set<string>,
  reservedEntityIds: Set<string>,
) {
  const allocated = new Set(reservedEntityIds)
  const entries: Array<[string, string]> = []
  for (const localId of [...localIds].sort()) {
    let mapped: string | undefined
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = createEntityId()
      assertUuid(candidate, 'generated entity id')
      const collisionKey = candidate.toLowerCase()
      if (!allocated.has(collisionKey)) {
        mapped = candidate
        allocated.add(collisionKey)
        break
      }
    }
    if (mapped === undefined) {
      throw new LegacyMigrationError('Could not allocate a unique entity id')
    }
    entries.push([localId, mapped])
  }
  return Object.fromEntries(entries)
}

function normalizeUuidKey(value: string) {
  return isUuid(value) ? value.toLowerCase() : value
}

function createOrderedQueuedAt(canonicalCreatedAt: string, index: number) {
  if (index > 999_999) {
    throw new LegacyMigrationError('Too many legacy mutations to order safely')
  }
  return `${canonicalCreatedAt.slice(0, -1)}${index.toString().padStart(6, '0')}Z`
}

function entityLookupKey(entity: LegacyEntityType, originalId: string) {
  return `${entity}:${originalId}`
}

function assertOwnedRow(
  record: Record<string, unknown>,
  userId: string,
  label: string,
) {
  if (record.user_id !== userId) {
    throw new LegacyMigrationError(`Legacy ${label} ownership does not match user`)
  }
}

function assertLegacySchemaVersion(value: unknown, label: string) {
  if (value !== 1) {
    throwLegacyMigrationRecoveryRequired(`${label} must equal 1`)
  }
}

function assertKnownLegacyFields(
  record: Record<string, unknown>,
  knownFields: ReadonlySet<string>,
  label: string,
) {
  const unknownFields = Object.keys(record)
    .filter((key) => !knownFields.has(key))
    .sort()
  if (unknownFields.length > 0) {
    throwLegacyMigrationRecoveryRequired(
      `legacy ${label} contains unknown fields: ${unknownFields.join(', ')}`,
    )
  }
}

function optionalBlendComponents(value: unknown): ServerBeanRow['blend_components'] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new LegacyMigrationError('Invalid bean blend_components')
  return value.map((item) => {
    const component = assertJsonRecord(item, 'bean blend component')
    return {
      origin: optionalString(component.origin, 'blend origin'),
      process: optionalString(component.process, 'blend process'),
      variety: optionalString(component.variety, 'blend variety'),
      percentage: optionalNullableNumber(component.percentage, 'blend percentage'),
      role: optionalString(component.role, 'blend role'),
      notes: optionalString(component.notes, 'blend notes'),
    }
  })
}

function optionalString(value: unknown, label: string) {
  if (value === undefined) return ''
  return assertString(value, label)
}

function optionalNullableString(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null
  return assertString(value, label)
}

function optionalNullableNumber(value: unknown, label: string): number | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new LegacyMigrationError(`Invalid ${label}`)
  }
  return value
}

function optionalStringArray(value: unknown, label: string) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new LegacyMigrationError(`Invalid ${label}`)
  }
  return [...value] as string[]
}

function optionalJsonArray(value: unknown, label: string) {
  if (value === undefined) return []
  if (!Array.isArray(value) || !value.every(isJsonValue)) {
    throw new LegacyMigrationError(`Invalid ${label}`)
  }
  return structuredClone(value) as BrewLog['pour_steps']
}

function optionalBoolean(value: unknown, label: string) {
  if (value === undefined) return false
  if (typeof value !== 'boolean') throw new LegacyMigrationError(`Invalid ${label}`)
  return value
}

function optionalCalendarDate(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null
  const date = assertString(value, label)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (match === null) throw new LegacyMigrationError(`Invalid ${label}`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > getDaysInMonth(year, month)
  ) {
    throw new LegacyMigrationError(`Invalid ${label}`)
  }
  return date
}

function optionalCanonicalTime(value: unknown, label: string): string | null {
  return value === undefined || value === null ? null : canonicalTime(value, label)
}

function canonicalTime(value: unknown, label: string) {
  const time = assertString(value, label)
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-](\d{2}):(\d{2}))$/.exec(time)
  if (match === null) throw new LegacyMigrationError(`Invalid ${label}`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const zone = match[8]
  const offsetHour = zone === 'Z' ? 0 : Number(match[9])
  const offsetMinute = zone === 'Z' ? 0 : Number(match[10])
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > getDaysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    throw new LegacyMigrationError(`Invalid ${label}`)
  }
  const epoch = Date.parse(time)
  if (!Number.isFinite(epoch)) throw new LegacyMigrationError(`Invalid ${label}`)
  return new Date(epoch).toISOString()
}

function canonicalInstantNanoseconds(value: unknown, label: string) {
  const time = assertString(value, label)
  canonicalTime(time, label)
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(
    time,
  )
  if (match === null) throw new LegacyMigrationError(`Invalid ${label}`)
  const wholeSecondMilliseconds = Date.parse(`${match[1]}${match[3]}`)
  if (!Number.isFinite(wholeSecondMilliseconds)) {
    throw new LegacyMigrationError(`Invalid ${label}`)
  }
  const fractionalNanoseconds = BigInt(
    (match[2] ?? '').padEnd(9, '0') || '0',
  )
  return BigInt(wholeSecondMilliseconds) * 1_000_000n + fractionalNanoseconds
}

function compareInstants(left: bigint, right: bigint) {
  return left < right ? -1 : left > right ? 1 : 0
}

function assertTimeOrder(createdAt: string, updatedAt: string, label: string) {
  if (Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw new LegacyMigrationError(`Invalid ${label}: updated_at precedes created_at`)
  }
}

function getDaysInMonth(year: number, month: number) {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    return leap ? 29 : 28
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

function assertUuid(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !isUuid(value)) {
    throw new LegacyMigrationError(`Invalid ${label}: UUID required`)
  }
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
}

function isLocalBeanId(value: string) {
  return value.startsWith('local-bean-') && value.length > 'local-bean-'.length
}

function isLocalBrewId(value: string) {
  return value.startsWith('local-brew-') && value.length > 'local-brew-'.length
}

function isRecognizedLocalId(value: string) {
  return isLocalBeanId(value) || isLocalBrewId(value)
}

function assertPositiveInteger(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new LegacyMigrationError(`Invalid ${label}`)
  }
}

function assertUnknownArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new LegacyMigrationError(`Invalid ${label}`)
  return value
}

function assertString(value: unknown, label: string) {
  if (typeof value !== 'string') throw new LegacyMigrationError(`Invalid ${label}`)
  return value
}

function assertNonEmptyString(value: unknown, label: string) {
  const text = assertString(value, label)
  if (text.trim().length === 0) throw new LegacyMigrationError(`Invalid ${label}`)
  return text
}

function assertJsonRecord(value: unknown, label: string) {
  if (!isPlainRecord(value) || !isJsonValue(value)) {
    throw new LegacyMigrationError(`Invalid ${label}: JSON object required`)
  }
  return value
}

function isJsonValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true
  }
  if (Array.isArray(value)) return value.every(isJsonValue)
  return isPlainRecord(value) && Object.values(value).every(isJsonValue)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const prototype = Object.getPrototypeOf(value) as unknown
  return prototype === Object.prototype || prototype === null
}

function fail(message: string): never {
  throw new LegacyMigrationError(message)
}

function normalizeError(error: unknown) {
  return error instanceof Error || error instanceof DOMException
    ? error
    : new LegacyMigrationError(String(error))
}

function requestResult<Result>(request: IDBRequest<Result>, message: string) {
  return new Promise<Result>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new LegacyMigrationError(message))
  })
}

function waitForReadonlyTransaction(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new LegacyMigrationError('Legacy recovery read failed'))
    transaction.onabort = () =>
      reject(transaction.error ?? new LegacyMigrationError('Legacy recovery read aborted'))
  })
}

async function openExistingDatabaseReadOnly() {
  if (typeof indexedDB === 'undefined') {
    throw new LegacyMigrationError('IndexedDB unavailable')
  }
  if (typeof indexedDB.databases === 'function') {
    const databases = await indexedDB.databases()
    if (!databases.some((database) => database.name === syncDatabaseName)) {
      throw new LegacyMigrationError('Legacy recovery database does not exist')
    }
  }
  return new Promise<IDBDatabase>((resolve, reject) => {
    let createdUnexpectedly = false
    const request = indexedDB.open(syncDatabaseName)
    request.onupgradeneeded = () => {
      createdUnexpectedly = true
      request.transaction?.abort()
    }
    request.onsuccess = () => {
      if (createdUnexpectedly) {
        request.result.close()
        reject(new LegacyMigrationError('Legacy recovery database does not exist'))
      } else {
        resolve(request.result)
      }
    }
    request.onerror = () =>
      reject(
        createdUnexpectedly
          ? new LegacyMigrationError('Legacy recovery database does not exist')
          : request.error ?? new LegacyMigrationError('Legacy recovery database open failed'),
      )
    request.onblocked = () =>
      reject(new LegacyMigrationError('Legacy recovery database open blocked'))
  })
}
