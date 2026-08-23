import type { ServerBeanRow } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import type { UserBrewTemplateRow } from '../brewTemplates/brewTemplateTypes'
import type { SavedRecommendationRow } from '../recommendations/savedRecommendationList'
import type { UserSettingsRow } from '../settings/userSettingsTypes'
import type { SyncMutation, SyncSnapshot, SyncStorage } from './syncTypes'
import {
  entityKey,
  openSyncDatabase,
  syncStoreNames,
} from './syncDatabase'
import { validateSyncMutationForWire } from './syncApi'

type EntityByStore = {
  beans: ServerBeanRow
  brewLogs: BrewLog
  brewTemplates: UserBrewTemplateRow
  userSettings: UserSettingsRow
  aiRecommendations: SavedRecommendationRow
}

type EntityTypeByStore = {
  beans: 'bean'
  brewLogs: 'brewLog'
  brewTemplates: 'brewTemplate'
  userSettings: 'userSettings'
}

export type LocalEntityStoreName = keyof EntityByStore
export type MutableEntityStoreName = keyof EntityTypeByStore
export type DeletableEntityStoreName = Exclude<
  MutableEntityStoreName,
  'userSettings'
>

export type LocalEntityWritePrecondition =
  | { kind: 'missing' }
  | { kind: 'active'; expectedUpdatedAt: string }

type MutationForStore<Store extends MutableEntityStoreName> = SyncMutation & {
  entityType: EntityTypeByStore[Store]
}

type UpsertMutationForStore<Store extends MutableEntityStoreName> =
  MutationForStore<Store> & { operation: 'upsert' }

type DeleteMutationForStore<Store extends DeletableEntityStoreName> =
  MutationForStore<Store> & { operation: 'delete' }

export type LocalRepositoryTestOperation =
  | 'saveLocalEntity'
  | 'softDeleteLocalEntity'
  | 'acknowledgeMutations'
  | 'acknowledgeMutationsAndReplaceSnapshot'
  | 'markMutationsSyncing'
  | 'recordRetryableFailure'
  | 'markMutationAttention'
  | 'markMutationPending'
  | 'releaseLegacyCreateChain'
  | 'discardMutationAndReplaceSnapshot'
  | 'quarantineOlderEpoch'
  | 'replaceServerSnapshot'
  | 'writeSyncMeta'

export type LocalRepositoryTestOptions = {
  beforeOutboxWrite?: () => void
  beforeCommit?: (operation: LocalRepositoryTestOperation) => void
  now?: () => Date
  openDatabase?: () => Promise<IDBDatabase>
}

export type LocalRepository = SyncStorage & {
  subscribeEntityChanges(
    userId: string,
    storeName: LocalEntityStoreName,
    listener: () => void,
  ): () => void
  saveLocalEntity<Store extends MutableEntityStoreName>(
    storeName: Store,
    userId: string,
    entity: EntityByStore[Store],
    mutation: UpsertMutationForStore<Store>,
    precondition?: LocalEntityWritePrecondition,
  ): Promise<void>
  softDeleteLocalEntity<Store extends DeletableEntityStoreName>(
    storeName: Store,
    userId: string,
    entity: EntityByStore[Store],
    mutation: DeleteMutationForStore<Store>,
    deletedAt?: string,
    precondition?: LocalEntityWritePrecondition,
  ): Promise<EntityByStore[Store]>
  listLocalEntities<Store extends LocalEntityStoreName>(
    storeName: Store,
    userId: string,
  ): Promise<Array<EntityByStore[Store]>>
}

type StoredEnvelope<Value> = {
  key: string
  userId: string
  value: Value
}

type SyncMetaValue = {
  syncEpoch: number
  lastSyncedAt: string
}

type TransactionAbort = (cause: unknown) => void

type EnvelopeClassification<Value> =
  | { kind: 'missing' }
  | { kind: 'foreign' }
  | { kind: 'orphan' }
  | { kind: 'corrupt-owned' }
  | { kind: 'valid'; envelope: StoredEnvelope<Value> }

export class LocalSyncDataCorruptionError extends Error {
  readonly code = 'LOCAL_SYNC_DATA_CORRUPT'

  constructor(message = 'Current-user local sync data is corrupt') {
    super(message)
    this.name = 'LocalSyncDataCorruptionError'
  }
}

export class StaleLocalSnapshotError extends Error {
  readonly code = 'STALE_LOCAL_SNAPSHOT'

  constructor(message = 'Local snapshot metadata would move backwards') {
    super(message)
    this.name = 'StaleLocalSnapshotError'
  }
}

export class LocalSyncMutationNotFoundError extends Error {
  readonly code = 'LOCAL_SYNC_MUTATION_NOT_FOUND'

  constructor(message = 'Owned local sync mutation was not found') {
    super(message)
    this.name = 'LocalSyncMutationNotFoundError'
  }
}

export class LocalSyncMutationStateError extends Error {
  readonly code = 'LOCAL_SYNC_MUTATION_STATE_CHANGED'

  constructor(message = 'Owned local sync mutation state changed') {
    super(message)
    this.name = 'LocalSyncMutationStateError'
  }
}

export class LocalEntityPreconditionError extends Error {
  readonly code = 'LOCAL_ENTITY_PRECONDITION_FAILED'

  constructor(message = 'Local entity write precondition failed') {
    super(message)
    this.name = 'LocalEntityPreconditionError'
  }
}

export class LegacyCreateChainChangedError extends Error {
  readonly code = 'LEGACY_CREATE_CHAIN_CHANGED'

  constructor(message = 'Legacy create confirmation chain changed') {
    super(message)
    this.name = 'LegacyCreateChainChangedError'
  }
}

const entityStoreNames: readonly LocalEntityStoreName[] = [
  syncStoreNames.beans,
  syncStoreNames.brewLogs,
  syncStoreNames.brewTemplates,
  syncStoreNames.userSettings,
  syncStoreNames.aiRecommendations,
]

const mutableEntityStoreNames: readonly MutableEntityStoreName[] = [
  syncStoreNames.beans,
  syncStoreNames.brewLogs,
  syncStoreNames.brewTemplates,
  syncStoreNames.userSettings,
]

const entityTypeByStore: EntityTypeByStore = {
  beans: 'bean',
  brewLogs: 'brewLog',
  brewTemplates: 'brewTemplate',
  userSettings: 'userSettings',
}

const storeByEntityType: Record<
  SyncMutation['entityType'],
  MutableEntityStoreName
> = {
  bean: 'beans',
  brewLog: 'brewLogs',
  brewTemplate: 'brewTemplates',
  userSettings: 'userSettings',
}

const defaultOptions: LocalRepositoryTestOptions = {}

export function createLocalRepository(
  testOptions: LocalRepositoryTestOptions = {},
): LocalRepository {
  const entityListeners = new Set<{
    userId: string
    storeName: LocalEntityStoreName
    listener: () => void
  }>()
  const notifyEntityChange = (userId: string, storeName: LocalEntityStoreName) => {
    for (const subscription of entityListeners) {
      if (subscription.userId === userId && subscription.storeName === storeName) {
        try {
          subscription.listener()
        } catch {
          continue
        }
      }
    }
  }
  const notifySnapshotChange = (userId: string) => {
    for (const storeName of entityStoreNames) notifyEntityChange(userId, storeName)
  }

  return {
    subscribeEntityChanges(userId, storeName, listener) {
      assertEntityStoreName(storeName)
      const subscription = { userId, storeName, listener }
      entityListeners.add(subscription)
      let active = true
      return () => {
        if (!active) return
        active = false
        entityListeners.delete(subscription)
      }
    },
    saveLocalEntity: <Store extends MutableEntityStoreName>(
      storeName: Store,
      userId: string,
      entity: EntityByStore[Store],
      mutation: UpsertMutationForStore<Store>,
      precondition?: LocalEntityWritePrecondition,
    ) => saveLocalEntityWithOptions(
      storeName, userId, entity, mutation, testOptions, precondition,
    ).then(() => notifyEntityChange(userId, storeName)),
    softDeleteLocalEntity: <Store extends DeletableEntityStoreName>(
      storeName: Store,
      userId: string,
      entity: EntityByStore[Store],
      mutation: DeleteMutationForStore<Store>,
      deletedAt?: string,
      precondition?: LocalEntityWritePrecondition,
    ) => softDeleteLocalEntityWithOptions(
      storeName, userId, entity, mutation, testOptions, deletedAt, precondition,
    ).then((result) => {
      notifyEntityChange(userId, storeName)
      return result
    }),
    listLocalEntities: (storeName, userId) =>
      listLocalEntitiesWithOptions(storeName, userId, testOptions),
    replaceServerSnapshot: (userId: string, snapshot: SyncSnapshot) =>
      replaceServerSnapshotWithOptions(userId, snapshot, testOptions)
        .then(() => notifySnapshotChange(userId)),
    listOutbox: (userId: string) => listOutboxWithOptions(userId, testOptions),
    acknowledgeMutations: (userId: string, mutationIds: string[]) =>
      acknowledgeMutationsWithOptions(userId, mutationIds, testOptions),
    acknowledgeMutationsAndReplaceSnapshot: (
      userId: string,
      mutationIds: string[],
      snapshot: SyncSnapshot,
    ) => acknowledgeMutationsAndReplaceSnapshotWithOptions(
      userId, mutationIds, snapshot, testOptions,
    ).then(() => notifySnapshotChange(userId)),
    markMutationsSyncing: (userId: string, mutationIds: string[]) =>
      markMutationsSyncingWithOptions(userId, mutationIds, testOptions),
    recordRetryableFailure: (
      userId: string,
      mutationIds: string[],
      code: string,
      message: string,
    ) => recordRetryableFailureWithOptions(
      userId,
      mutationIds,
      code,
      message,
      testOptions,
    ),
    markMutationAttention: (
      userId: string,
      mutationIds: string[],
      code: string,
      message: string,
    ) => markMutationAttentionWithOptions(
      userId,
      mutationIds,
      code,
      message,
      testOptions,
    ),
    markMutationPending: (userId: string, mutationId: string) =>
      markMutationPendingWithOptions(userId, mutationId, testOptions),
    releaseLegacyCreateChain: (
      userId: string,
      mutationId: string,
      expectedMutationIds: string[],
      currentEpoch: number,
    ) => releaseLegacyCreateChainWithOptions(
      userId,
      mutationId,
      expectedMutationIds,
      currentEpoch,
      testOptions,
    ),
    discardMutationAndReplaceSnapshot: (
      userId: string,
      mutationId: string,
      snapshot: SyncSnapshot,
    ) => discardMutationAndReplaceSnapshotWithOptions(
      userId, mutationId, snapshot, testOptions,
    ).then(() => notifySnapshotChange(userId)),
    quarantineOlderEpoch: (
      userId: string,
      currentEpoch: number,
      code: string,
      message: string,
    ) => quarantineOlderEpochWithOptions(
      userId,
      currentEpoch,
      code,
      message,
      testOptions,
    ),
    readSyncEpoch: (userId: string) => readSyncEpochWithOptions(userId, testOptions),
    writeSyncMeta: (
      userId: string,
      input: { syncEpoch: number; lastSyncedAt: string },
    ) => writeSyncMetaWithOptions(userId, input, testOptions),
  }
}

export function saveLocalEntity<Store extends MutableEntityStoreName>(
  storeName: Store,
  userId: string,
  entity: EntityByStore[Store],
  mutation: UpsertMutationForStore<Store>,
  precondition?: LocalEntityWritePrecondition,
) {
  return saveLocalEntityWithOptions(
    storeName,
    userId,
    entity,
    mutation,
    defaultOptions,
    precondition,
  )
}

export function softDeleteLocalEntity<
  Store extends DeletableEntityStoreName,
>(
  storeName: Store,
  userId: string,
  entity: EntityByStore[Store],
  mutation: DeleteMutationForStore<Store>,
  deletedAt?: string,
  precondition?: LocalEntityWritePrecondition,
) {
  return softDeleteLocalEntityWithOptions(
    storeName,
    userId,
    entity,
    mutation,
    defaultOptions,
    deletedAt,
    precondition,
  )
}

/** Returns the owned overlay in stable key order, including tombstones. */
export async function listLocalEntities<Store extends LocalEntityStoreName>(
  storeName: Store,
  userId: string,
): Promise<Array<EntityByStore[Store]>> {
  return listLocalEntitiesWithOptions(storeName, userId, defaultOptions)
}

async function listLocalEntitiesWithOptions<Store extends LocalEntityStoreName>(
  storeName: Store,
  userId: string,
  options: LocalRepositoryTestOptions,
): Promise<Array<EntityByStore[Store]>> {
  assertEntityStoreName(storeName)
  return withDatabase((database) => {
    const transaction = database.transaction(storeName, 'readonly')
    let entities: Array<{ key: string; value: EntityByStore[Store] }> = []

    return waitForTransaction(transaction, (abort) => {
      const request = transaction.objectStore(storeName).getAll()
      request.onsuccess = () => {
        try {
          entities = (request.result as unknown[])
            .map((row) => readEntityEnvelope(storeName, row, userId))
            .filter((row): row is StoredEnvelope<EntityByStore[Store]> =>
              row !== null,
            )
            .map((row) => ({ key: row.key, value: row.value }))
            .sort((left, right) => left.key.localeCompare(right.key))
        } catch (error) {
          abort(error)
        }
      }
    }).then(() => entities.map((row) => row.value))
  }, options.openDatabase)
}

export async function listOutbox(userId: string): Promise<SyncMutation[]> {
  return listOutboxWithOptions(userId, defaultOptions)
}

async function listOutboxWithOptions(
  userId: string,
  options: LocalRepositoryTestOptions,
): Promise<SyncMutation[]> {
  return withDatabase((database) => {
    const transaction = database.transaction(syncStoreNames.outbox, 'readonly')
    let mutations: SyncMutation[] = []

    return waitForTransaction(transaction, (abort) => {
      const request = transaction.objectStore(syncStoreNames.outbox).getAll()
      request.onsuccess = () => {
        try {
          mutations = (request.result as unknown[])
            .map((row) => readOutboxEnvelope(row, userId))
            .filter((row): row is StoredEnvelope<SyncMutation> => row !== null)
            .map((row) => row.value)
            .sort(
              (left, right) =>
                compareCanonicalInstants(left.queuedAt, right.queuedAt) ||
                left.mutationId.localeCompare(right.mutationId),
            )
        } catch (error) {
          abort(error)
        }
      }
    }).then(() => mutations)
  }, options.openDatabase)
}

export function acknowledgeMutations(userId: string, mutationIds: string[]) {
  return acknowledgeMutationsWithOptions(userId, mutationIds, defaultOptions)
}

/** Atomically installs a validated snapshot and removes confirmed syncing rows. */
export function acknowledgeMutationsAndReplaceSnapshot(
  userId: string,
  mutationIds: string[],
  snapshot: SyncSnapshot,
) {
  return acknowledgeMutationsAndReplaceSnapshotWithOptions(
    userId,
    mutationIds,
    snapshot,
    defaultOptions,
  )
}

export function markMutationsSyncing(userId: string, mutationIds: string[]) {
  return markMutationsSyncingWithOptions(userId, mutationIds, defaultOptions)
}

export function recordRetryableFailure(
  userId: string,
  mutationIds: string[],
  code: string,
  message: string,
) {
  return recordRetryableFailureWithOptions(
    userId,
    mutationIds,
    code,
    message,
    defaultOptions,
  )
}

export function markMutationAttention(
  userId: string,
  mutationIds: string[],
  code: string,
  message: string,
) {
  return markMutationAttentionWithOptions(
    userId,
    mutationIds,
    code,
    message,
    defaultOptions,
  )
}

export function markMutationPending(userId: string, mutationId: string) {
  return markMutationPendingWithOptions(userId, mutationId, defaultOptions)
}

export function releaseLegacyCreateChain(
  userId: string,
  mutationId: string,
  expectedMutationIds: string[],
  currentEpoch: number,
) {
  return releaseLegacyCreateChainWithOptions(
    userId,
    mutationId,
    expectedMutationIds,
    currentEpoch,
    defaultOptions,
  )
}

/** Accepts only a SyncSnapshot already fully validated by the Task 9 RPC boundary. */
export function discardMutationAndReplaceSnapshot(
  userId: string,
  mutationId: string,
  snapshot: SyncSnapshot,
) {
  return discardMutationAndReplaceSnapshotWithOptions(
    userId,
    mutationId,
    snapshot,
    defaultOptions,
  )
}

export function quarantineOlderEpoch(
  userId: string,
  currentEpoch: number,
  code: string,
  message: string,
) {
  return quarantineOlderEpochWithOptions(
    userId,
    currentEpoch,
    code,
    message,
    defaultOptions,
  )
}

/** Accepts only a SyncSnapshot already fully validated by the Task 9 RPC boundary. */
export function replaceServerSnapshot(userId: string, snapshot: SyncSnapshot) {
  return replaceServerSnapshotWithOptions(userId, snapshot, defaultOptions)
}

export async function readSyncEpoch(userId: string): Promise<number> {
  return readSyncEpochWithOptions(userId, defaultOptions)
}

async function readSyncEpochWithOptions(
  userId: string,
  options: LocalRepositoryTestOptions,
): Promise<number> {
  return withDatabase((database) => {
    const transaction = database.transaction(syncStoreNames.syncMeta, 'readonly')
    let epoch = 1

    return waitForTransaction(transaction, (abort) => {
      const request = transaction
        .objectStore(syncStoreNames.syncMeta)
        .get(syncMetaKey(userId))
      request.onsuccess = () => {
        try {
          const envelope = readSyncMetaEnvelope(request.result as unknown, userId)
          if (envelope !== null) {
            epoch = envelope.value.syncEpoch
          }
        } catch (error) {
          abort(error)
        }
      }
    }).then(() => epoch)
  }, options.openDatabase)
}

export function writeSyncMeta(
  userId: string,
  input: { syncEpoch: number; lastSyncedAt: string },
) {
  return writeSyncMetaWithOptions(userId, input, defaultOptions)
}

async function saveLocalEntityWithOptions<Store extends MutableEntityStoreName>(
  storeName: Store,
  userId: string,
  entity: EntityByStore[Store],
  mutation: UpsertMutationForStore<Store>,
  options: LocalRepositoryTestOptions,
  precondition?: LocalEntityWritePrecondition,
) {
  assertMutableStoreName(storeName)
  assertOwnedEntity(storeName, userId, entity)
  assertNewMutation(storeName, userId, entity, mutation, 'upsert')
  assertEntityWritePreconditionShape(precondition)
  const writeGraph = structuredClone({ entity, mutation, precondition })
  assertOwnedEntity(storeName, userId, writeGraph.entity)
  assertNewMutation(
    storeName,
    userId,
    writeGraph.entity,
    writeGraph.mutation,
    'upsert',
  )
  assertEntityWritePreconditionShape(writeGraph.precondition)

  await withDatabase((database) => {
    const transaction = database.transaction(
      [storeName, syncStoreNames.outbox],
      'readwrite',
    )
    return waitForTransaction(transaction, (abort) => {
      schedulePreconditionedEntityAndOutboxWrite(
        transaction,
        storeName,
        userId,
        writeGraph.entity,
        writeGraph.mutation,
        'saveLocalEntity',
        options,
        abort,
        writeGraph.precondition,
      )
    })
  })
}

async function softDeleteLocalEntityWithOptions<
  Store extends DeletableEntityStoreName,
>(
  storeName: Store,
  userId: string,
  entity: EntityByStore[Store],
  mutation: DeleteMutationForStore<Store>,
  options: LocalRepositoryTestOptions,
  requestedDeletedAt?: string,
  precondition?: LocalEntityWritePrecondition,
): Promise<EntityByStore[Store]> {
  assertDeletableStoreName(storeName)
  assertOwnedEntity(storeName, userId, entity)
  assertNewMutation(storeName, userId, entity, mutation, 'delete')
  assertEntityWritePreconditionShape(precondition)
  const deletedAt =
    requestedDeletedAt ?? (options.now ?? (() => new Date()))().toISOString()
  if (!isIsoTime(deletedAt)) {
    throw new Error('Delete timestamp must be an ISO timestamp with timezone')
  }
  const tombstone = {
    ...entity,
    deleted_at: deletedAt,
    updated_at: deletedAt,
  } as EntityByStore[Store]
  const writeGraph = structuredClone({
    entity: tombstone,
    mutation,
    precondition,
  })
  assertOwnedEntity(storeName, userId, writeGraph.entity)
  assertNewMutation(
    storeName,
    userId,
    writeGraph.entity,
    writeGraph.mutation,
    'delete',
  )
  assertEntityWritePreconditionShape(writeGraph.precondition)

  await withDatabase((database) => {
    const transaction = database.transaction(
      [storeName, syncStoreNames.outbox],
      'readwrite',
    )
    return waitForTransaction(transaction, (abort) => {
      schedulePreconditionedEntityAndOutboxWrite(
        transaction,
        storeName,
        userId,
        writeGraph.entity,
        writeGraph.mutation,
        'softDeleteLocalEntity',
        options,
        abort,
        writeGraph.precondition,
      )
    })
  })

  return writeGraph.entity
}

function schedulePreconditionedEntityAndOutboxWrite<
  Store extends MutableEntityStoreName,
>(
  transaction: IDBTransaction,
  storeName: Store,
  userId: string,
  entity: EntityByStore[Store],
  mutation: MutationForStore<Store>,
  operation: 'saveLocalEntity' | 'softDeleteLocalEntity',
  options: LocalRepositoryTestOptions,
  abort: TransactionAbort,
  precondition?: LocalEntityWritePrecondition,
) {
  if (precondition === undefined) {
    scheduleEntityAndOutboxWrite(
      transaction,
      storeName,
      userId,
      entity,
      mutation,
      operation,
      options,
      abort,
    )
    return
  }

  const stableId = getStableEntityId(storeName, entity)
  const request = transaction
    .objectStore(storeName)
    .get(entityKey(userId, stableId))
  request.onsuccess = () => {
    try {
      assertEntityWritePrecondition(
        storeName,
        userId,
        request.result as unknown,
        entity,
        mutation,
        precondition,
      )
      scheduleEntityAndOutboxWrite(
        transaction,
        storeName,
        userId,
        entity,
        mutation,
        operation,
        options,
        abort,
      )
    } catch (error) {
      abort(error)
    }
  }
}

function scheduleEntityAndOutboxWrite<Store extends MutableEntityStoreName>(
  transaction: IDBTransaction,
  storeName: Store,
  userId: string,
  entity: EntityByStore[Store],
  mutation: MutationForStore<Store>,
  operation: 'saveLocalEntity' | 'softDeleteLocalEntity',
  options: LocalRepositoryTestOptions,
  abort: TransactionAbort,
) {
  try {
    const stableId = getStableEntityId(storeName, entity)
    transaction.objectStore(storeName).put({
      key: entityKey(userId, stableId),
      userId,
      value: entity,
    } satisfies StoredEnvelope<EntityByStore[Store]>)

    const outboxStore = transaction.objectStore(syncStoreNames.outbox)
    const collisionRequest = outboxStore.get(mutation.mutationId)
    collisionRequest.onsuccess = () => {
      try {
        const stored = collisionRequest.result as unknown
        if (stored !== undefined) {
          const existing = readOutboxEnvelope(
            stored,
            userId,
            mutation.mutationId,
          )
          if (
            existing === null ||
            !jsonValuesEqual(existing.value, mutation)
          ) {
            throw new Error('Outbox mutation id collision')
          }
        }

        options.beforeOutboxWrite?.()
        outboxStore.put({
          key: mutation.mutationId,
          userId,
          value: mutation,
        } satisfies StoredEnvelope<SyncMutation>)
        options.beforeCommit?.(operation)
      } catch (error) {
        abort(error)
      }
    }
  } catch (error) {
    abort(error)
  }
}

function acknowledgeMutationsWithOptions(
  userId: string,
  mutationIds: string[],
  options: LocalRepositoryTestOptions,
) {
  return mutateSelectedOutbox(
    userId,
    mutationIds,
    'acknowledgeMutations',
    () => 'delete',
    options,
  )
}

function markMutationsSyncingWithOptions(
  userId: string,
  mutationIds: string[],
  options: LocalRepositoryTestOptions,
) {
  return mutateSelectedOutbox(
    userId,
    mutationIds,
    'markMutationsSyncing',
    (mutation) =>
      mutation.status === 'pending'
        ? {
            ...mutation,
            status: 'syncing',
            attemptCount: mutation.attemptCount + 1,
            lastErrorCode: null,
            lastErrorMessage: null,
          }
        : null,
    options,
  )
}

function recordRetryableFailureWithOptions(
  userId: string,
  mutationIds: string[],
  code: string,
  message: string,
  options: LocalRepositoryTestOptions,
) {
  assertErrorDetails(code, message)
  return mutateSelectedOutbox(
    userId,
    mutationIds,
    'recordRetryableFailure',
    (mutation) =>
      mutation.status === 'syncing'
        ? {
            ...mutation,
            status: 'pending',
            lastErrorCode: code,
            lastErrorMessage: message,
          }
        : null,
    options,
  )
}

function markMutationAttentionWithOptions(
  userId: string,
  mutationIds: string[],
  code: string,
  message: string,
  options: LocalRepositoryTestOptions,
) {
  assertErrorDetails(code, message)
  return mutateSelectedOutbox(
    userId,
    mutationIds,
    'markMutationAttention',
    (mutation) => ({
      ...mutation,
      status: 'needs_attention',
      lastErrorCode: code,
      lastErrorMessage: message,
    }),
    options,
  )
}

function markMutationPendingWithOptions(
  userId: string,
  mutationId: string,
  options: LocalRepositoryTestOptions,
) {
  return mutateSelectedOutbox(
    userId,
    [mutationId],
    'markMutationPending',
    (mutation) =>
      mutation.status === 'needs_attention' || mutation.status === 'syncing'
        ? {
            ...mutation,
            status: 'pending',
            lastErrorCode: null,
            lastErrorMessage: null,
          }
        : null,
    options,
  )
}

async function releaseLegacyCreateChainWithOptions(
  userId: string,
  mutationId: string,
  expectedMutationIds: string[],
  currentEpoch: number,
  options: LocalRepositoryTestOptions,
) {
  assertPositiveEpoch(currentEpoch)
  const expected = [...new Set(expectedMutationIds)]
  if (
    expected.length !== expectedMutationIds.length ||
    !expected.includes(mutationId)
  ) {
    throw new LegacyCreateChainChangedError()
  }

  await withDatabase((database) => {
    const transaction = database.transaction(syncStoreNames.outbox, 'readwrite')
    return waitForTransaction(transaction, (abort) => {
      const store = transaction.objectStore(syncStoreNames.outbox)
      const request = store.getAll()
      request.onsuccess = () => {
        try {
          const mutations = (request.result as unknown[])
            .map((row) => readOutboxEnvelope(row, userId))
            .filter((row): row is StoredEnvelope<SyncMutation> => row !== null)
          const target = mutations.find(
            (row) => row.value.mutationId === mutationId,
          )?.value
          if (!target) throw new LegacyCreateChainChangedError()

          let rootEntityType = target.entityType
          let rootEntityId = target.entityId
          if (target.entityType === 'brewLog') {
            const rootBrewUpsert = mutations.find(
              (row) => row.value.entityType === 'brewLog' &&
                row.value.entityId === target.entityId &&
                row.value.operation === 'upsert',
            )?.value
            const referencedBean = rootBrewUpsert
              ? readReferencedBeanId(rootBrewUpsert)
              : null
            if (
              referencedBean !== null &&
              mutations.some((row) =>
                row.value.entityType === 'bean' &&
                row.value.entityId === referencedBean,
              )
            ) {
              rootEntityType = 'bean'
              rootEntityId = referencedBean
            }
          }
          const relatedEntityKeys = new Set([
            JSON.stringify([rootEntityType, rootEntityId]),
          ])
          if (rootEntityType === 'bean') {
            for (const row of mutations) {
              if (
                row.value.entityType === 'brewLog' &&
                row.value.operation === 'upsert' &&
                readReferencedBeanId(row.value) === rootEntityId
              ) {
                relatedEntityKeys.add(
                  JSON.stringify([row.value.entityType, row.value.entityId]),
                )
              }
            }
          }
          const chain = mutations.filter((row) =>
            relatedEntityKeys.has(
              JSON.stringify([row.value.entityType, row.value.entityId]),
            ),
          )
          const actualIds = chain.map((row) => row.value.mutationId)
          if (!sameStringSet(actualIds, expected)) {
            throw new LegacyCreateChainChangedError()
          }
          if (!chain.some((row) => row.value.operation === 'upsert')) {
            throw new LegacyCreateChainChangedError()
          }
          for (const row of chain) {
            if (
              row.value.status !== 'needs_attention' ||
              row.value.lastErrorCode !== 'LEGACY_CREATE_REQUIRES_CONFIRMATION'
            ) {
              throw new LegacyCreateChainChangedError()
            }
          }
          for (const envelope of chain) {
            store.put({
              ...envelope,
              value: {
                ...envelope.value,
                baseSyncEpoch: currentEpoch,
                status: 'pending',
                lastErrorCode: null,
                lastErrorMessage: null,
              },
            } satisfies StoredEnvelope<SyncMutation>)
          }
          options.beforeCommit?.('releaseLegacyCreateChain')
        } catch (error) {
          abort(error)
        }
      }
    })
  })
}

function readReferencedBeanId(mutation: SyncMutation): string | null {
  if (mutation.entityType !== 'brewLog' || mutation.operation !== 'upsert') {
    return null
  }
  const payload = mutation.payload as Record<string, unknown>
  return typeof payload.bean_id === 'string' ? payload.bean_id : null
}

function sameStringSet(left: string[], right: string[]) {
  return left.length === right.length &&
    left.every((value) => right.includes(value))
}

async function quarantineOlderEpochWithOptions(
  userId: string,
  currentEpoch: number,
  code: string,
  message: string,
  options: LocalRepositoryTestOptions,
) {
  assertPositiveEpoch(currentEpoch)
  assertErrorDetails(code, message)
  await withDatabase((database) => {
    const transaction = database.transaction(syncStoreNames.outbox, 'readwrite')
    return waitForTransaction(transaction, (abort) => {
      const store = transaction.objectStore(syncStoreNames.outbox)
      const request = store.getAll()
      request.onsuccess = () => {
        try {
          for (const row of request.result as unknown[]) {
            const envelope = readOutboxEnvelope(row, userId)
            if (
              envelope !== null &&
              envelope.value.baseSyncEpoch < currentEpoch
            ) {
              store.put({
                ...envelope,
                value: {
                  ...envelope.value,
                  status: 'needs_attention',
                  lastErrorCode: code,
                  lastErrorMessage: message,
                },
              } satisfies StoredEnvelope<SyncMutation>)
            }
          }
          options.beforeCommit?.('quarantineOlderEpoch')
        } catch (error) {
          abort(error)
        }
      }
    })
  })
}

async function mutateSelectedOutbox(
  userId: string,
  mutationIds: string[],
  operation: LocalRepositoryTestOperation,
  transform: (mutation: SyncMutation) => SyncMutation | 'delete' | null,
  options: LocalRepositoryTestOptions,
) {
  const uniqueIds = [...new Set(mutationIds)]
  await withDatabase((database) => {
    const transaction = database.transaction(syncStoreNames.outbox, 'readwrite')
    return waitForTransaction(transaction, (abort) => {
      const store = transaction.objectStore(syncStoreNames.outbox)
      if (uniqueIds.length === 0) {
        try {
          options.beforeCommit?.(operation)
        } catch (error) {
          abort(error)
        }
        return
      }

      let remaining = uniqueIds.length
      for (const mutationId of uniqueIds) {
        const request = store.get(mutationId)
        request.onsuccess = () => {
          try {
            const envelope = readOutboxEnvelope(
              request.result as unknown,
              userId,
              mutationId,
            )
            if (envelope !== null) {
              const next = transform(envelope.value)
              if (next === 'delete') {
                store.delete(envelope.key)
              } else if (next !== null) {
                store.put({ ...envelope, value: next })
              }
            }

            remaining -= 1
            if (remaining === 0) {
              options.beforeCommit?.(operation)
            }
          } catch (error) {
            abort(error)
          }
        }
      }
    })
  })
}

async function replaceServerSnapshotWithOptions(
  userId: string,
  snapshot: SyncSnapshot,
  options: LocalRepositoryTestOptions,
) {
  return runSnapshotTransaction(userId, snapshot, options)
}

async function acknowledgeMutationsAndReplaceSnapshotWithOptions(
  userId: string,
  mutationIds: string[],
  snapshot: SyncSnapshot,
  options: LocalRepositoryTestOptions,
) {
  const uniqueIds = [...new Set(mutationIds)]
  if (uniqueIds.length === 0 || uniqueIds.length !== mutationIds.length) {
    throw new LocalSyncMutationStateError(
      'Confirmed mutation IDs must be non-empty and unique',
    )
  }
  return runSnapshotTransaction(userId, snapshot, options, {
    kind: 'acknowledge',
    mutationIds: uniqueIds,
  })
}

async function discardMutationAndReplaceSnapshotWithOptions(
  userId: string,
  mutationId: string,
  snapshot: SyncSnapshot,
  options: LocalRepositoryTestOptions,
) {
  return runSnapshotTransaction(userId, snapshot, options, mutationId)
}

type SnapshotMutationRemoval = {
  kind: 'discard' | 'acknowledge'
  mutationIds: string[]
}

async function runSnapshotTransaction(
  userId: string,
  snapshot: SyncSnapshot,
  options: LocalRepositoryTestOptions,
  removal?: SnapshotMutationRemoval | string,
) {
  const normalizedRemoval: SnapshotMutationRemoval | undefined =
    typeof removal === 'string'
      ? { kind: 'discard', mutationIds: [removal] }
      : removal
  assertSnapshotOwnership(userId, snapshot)
  await withDatabase((database) => {
    const transactionStores = [
      ...entityStoreNames,
      syncStoreNames.outbox,
      syncStoreNames.syncMeta,
    ]
    const transaction = database.transaction(transactionStores, 'readwrite')

    return waitForTransaction(transaction, (abort) => {
      const rowsByStore = new Map<string, unknown[]>()
      const storesToRead = [...entityStoreNames, syncStoreNames.outbox]
      let currentMetaRow: unknown
      let remaining = storesToRead.length + 1

      const finishRead = () => {
        remaining -= 1
        if (remaining !== 0) {
          return
        }

        validateLocalSnapshotInputs(
          rowsByStore,
          currentMetaRow,
          userId,
          snapshot,
          normalizedRemoval,
        )
        applySnapshotTransaction(
          transaction,
          rowsByStore,
          userId,
          snapshot,
          normalizedRemoval,
        )
        options.beforeCommit?.(
          normalizedRemoval === undefined
            ? 'replaceServerSnapshot'
            : normalizedRemoval.kind === 'discard'
              ? 'discardMutationAndReplaceSnapshot'
              : 'acknowledgeMutationsAndReplaceSnapshot',
        )
      }

      for (const storeName of storesToRead) {
        const request = transaction.objectStore(storeName).getAll()
        request.onsuccess = () => {
          try {
            rowsByStore.set(storeName, request.result as unknown[])
            finishRead()
          } catch (error) {
            abort(error)
          }
        }
      }

      const metaRequest = transaction
        .objectStore(syncStoreNames.syncMeta)
        .get(syncMetaKey(userId))
      metaRequest.onsuccess = () => {
        try {
          currentMetaRow = metaRequest.result as unknown
          finishRead()
        } catch (error) {
          abort(error)
        }
      }
    })
  })
}

function validateLocalSnapshotInputs(
  rowsByStore: Map<string, unknown[]>,
  currentMetaRow: unknown,
  userId: string,
  snapshot: SyncSnapshot,
  removal?: SnapshotMutationRemoval,
) {
  const currentMeta = readSyncMetaEnvelope(currentMetaRow, userId)
  assertMonotonicSyncMeta(currentMeta?.value ?? null, {
    syncEpoch: snapshot.syncEpoch,
    lastSyncedAt: snapshot.serverTime,
  })

  const outboxRows = rowsByStore.get(syncStoreNames.outbox) ?? []
  for (const row of outboxRows) {
    readOutboxEnvelope(row, userId)
  }
  if (removal !== undefined) {
    for (const mutationId of removal.mutationIds) {
      const targetRow = outboxRows.find(
        (row) => isRecord(row) && row.key === mutationId,
      )
      const target = classifyOutboxEnvelope(targetRow, userId, mutationId)
      if (target.kind === 'corrupt-owned') {
        throw new LocalSyncDataCorruptionError(
          'Snapshot removal target local Outbox envelope is corrupt',
        )
      }
      if (target.kind !== 'valid') {
        throw new LocalSyncMutationNotFoundError()
      }
      if (
        removal.kind === 'acknowledge' &&
        target.envelope.value.status !== 'syncing'
      ) {
        throw new LocalSyncMutationStateError()
      }
    }
  }

  for (const storeName of entityStoreNames) {
    for (const row of rowsByStore.get(storeName) ?? []) {
      readEntityEnvelope(storeName, row, userId)
    }
  }

  const snapshotRows: {
    [Store in LocalEntityStoreName]: Array<EntityByStore[Store]>
  } = {
    beans: snapshot.beans,
    brewLogs: snapshot.brewLogs,
    brewTemplates: snapshot.brewTemplates,
    userSettings: snapshot.userSettings === null ? [] : [snapshot.userSettings],
    aiRecommendations: snapshot.aiRecommendations,
  }
  for (const storeName of entityStoreNames) {
    for (const row of snapshotRows[storeName]) {
      createEntityEnvelope(storeName, userId, row)
    }
  }
}

function applySnapshotTransaction(
  transaction: IDBTransaction,
  rowsByStore: Map<string, unknown[]>,
  userId: string,
  snapshot: SyncSnapshot,
  removal?: SnapshotMutationRemoval,
) {
  const removedMutationIds = new Set(removal?.mutationIds ?? [])
  const protectedKeys = new Map<LocalEntityStoreName, Set<string>>()
  for (const storeName of entityStoreNames) {
    protectedKeys.set(storeName, new Set())
  }

  for (const row of rowsByStore.get(syncStoreNames.outbox) ?? []) {
    const envelope = readOutboxEnvelope(row, userId)
    if (
      envelope !== null &&
      !removedMutationIds.has(envelope.key)
    ) {
      const storeName = storeByEntityType[envelope.value.entityType]
      protectedKeys
        .get(storeName)
        ?.add(entityKey(userId, envelope.value.entityId))
    }
  }

  for (const mutationId of removedMutationIds) {
    transaction.objectStore(syncStoreNames.outbox).delete(mutationId)
  }

  const snapshotRows: {
    [Store in LocalEntityStoreName]: Array<EntityByStore[Store]>
  } = {
    beans: snapshot.beans,
    brewLogs: snapshot.brewLogs,
    brewTemplates: snapshot.brewTemplates,
    userSettings: snapshot.userSettings === null ? [] : [snapshot.userSettings],
    aiRecommendations: snapshot.aiRecommendations,
  }

  for (const storeName of entityStoreNames) {
    replaceOneEntityStore(
      transaction,
      storeName,
      rowsByStore.get(storeName) ?? [],
      snapshotRows[storeName],
      protectedKeys.get(storeName) ?? new Set(),
      userId,
    )
  }

  transaction.objectStore(syncStoreNames.syncMeta).put(
    createSyncMetaEnvelope(userId, {
      syncEpoch: snapshot.syncEpoch,
      lastSyncedAt: snapshot.serverTime,
    }),
  )
}

function replaceOneEntityStore<Store extends LocalEntityStoreName>(
  transaction: IDBTransaction,
  storeName: Store,
  existingRows: unknown[],
  serverRows: Array<EntityByStore[Store]>,
  protectedKeys: Set<string>,
  userId: string,
) {
  const store = transaction.objectStore(storeName)
  const serverEnvelopes = serverRows.map((row) =>
    createEntityEnvelope(storeName, userId, row),
  )
  const serverKeys = new Set(serverEnvelopes.map((row) => row.key))

  for (const row of existingRows) {
    const envelope = readEntityEnvelope(storeName, row, userId)
    if (
      envelope !== null &&
      !protectedKeys.has(envelope.key) &&
      !serverKeys.has(envelope.key)
    ) {
      store.delete(envelope.key)
    }
  }

  for (const envelope of serverEnvelopes) {
    if (!protectedKeys.has(envelope.key)) {
      store.put(envelope)
    }
  }
}

async function writeSyncMetaWithOptions(
  userId: string,
  input: { syncEpoch: number; lastSyncedAt: string },
  options: LocalRepositoryTestOptions,
) {
  assertSyncMetaValue(input)
  await withDatabase((database) => {
    const transaction = database.transaction(syncStoreNames.syncMeta, 'readwrite')
    return waitForTransaction(transaction, (abort) => {
      const store = transaction.objectStore(syncStoreNames.syncMeta)
      const request = store.get(syncMetaKey(userId))
      request.onsuccess = () => {
        try {
          const current = readSyncMetaEnvelope(
            request.result as unknown,
            userId,
          )
          assertMonotonicSyncMeta(current?.value ?? null, input)
          store.put(createSyncMetaEnvelope(userId, input))
          options.beforeCommit?.('writeSyncMeta')
        } catch (error) {
          abort(error)
        }
      }
    })
  })
}

async function withDatabase<Result>(
  work: (database: IDBDatabase) => Promise<Result>,
  opener: () => Promise<IDBDatabase> = openSyncDatabase,
) {
  const database = await opener()
  try {
    return await work(database)
  } finally {
    database.close()
  }
}

function waitForTransaction(
  transaction: IDBTransaction,
  schedule: (abort: TransactionAbort) => void,
) {
  return new Promise<void>((resolve, reject) => {
    let failure: Error | DOMException | null = null
    const abort: TransactionAbort = (cause) => {
      if (failure === null) {
        failure = normalizeError(cause)
      }
      try {
        transaction.abort()
      } catch {
        reject(failure)
      }
    }

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => {
      reject(failure ?? transaction.error ?? new Error('IndexedDB transaction failed'))
    }
    transaction.onabort = () => {
      reject(failure ?? transaction.error ?? new Error('IndexedDB transaction aborted'))
    }

    try {
      schedule(abort)
    } catch (error) {
      abort(error)
    }
  })
}

function normalizeError(cause: unknown) {
  if (cause instanceof DOMException || cause instanceof Error) {
    return cause
  }
  return new Error(String(cause))
}

function assertEntityStoreName(value: string): asserts value is LocalEntityStoreName {
  if (!entityStoreNames.includes(value as LocalEntityStoreName)) {
    throw new Error(`Unsupported local entity store: ${value}`)
  }
}

function assertMutableStoreName(
  value: string,
): asserts value is MutableEntityStoreName {
  if (!mutableEntityStoreNames.includes(value as MutableEntityStoreName)) {
    throw new Error(`Unsupported mutable entity store: ${value}`)
  }
}

function assertDeletableStoreName(
  value: string,
): asserts value is DeletableEntityStoreName {
  if (
    value !== syncStoreNames.beans &&
    value !== syncStoreNames.brewLogs &&
    value !== syncStoreNames.brewTemplates
  ) {
    throw new Error(`Unsupported deletable entity store: ${value}`)
  }
}

function assertEntityWritePreconditionShape(
  precondition: LocalEntityWritePrecondition | undefined,
) {
  if (precondition === undefined) {
    return
  }
  if (
    !isPlainRecord(precondition) ||
    (precondition.kind === 'missing'
      ? !hasExactKeys(precondition, ['kind'])
      : precondition.kind !== 'active' ||
        !hasExactKeys(precondition, ['kind', 'expectedUpdatedAt']) ||
        !isIsoTime(precondition.expectedUpdatedAt))
  ) {
    throw new Error('Invalid local entity write precondition')
  }
}

function assertEntityWritePrecondition<Store extends MutableEntityStoreName>(
  storeName: Store,
  userId: string,
  row: unknown,
  entity: EntityByStore[Store],
  mutation: MutationForStore<Store>,
  precondition: LocalEntityWritePrecondition,
) {
  const classification = classifyEntityEnvelope(storeName, row, userId)
  if (classification.kind === 'corrupt-owned') {
    throw new LocalSyncDataCorruptionError(
      `Corrupt current-user entity envelope in ${storeName}`,
    )
  }
  if (
    !isIsoTime(entity.updated_at) ||
    compareCanonicalInstants(mutation.queuedAt, entity.updated_at) !== 0
  ) {
    throw new LocalEntityPreconditionError(
      'Mutation queue time must match local entity version',
    )
  }
  if (
    'deleted_at' in entity &&
    entity.deleted_at !== null &&
    (!isIsoTime(entity.deleted_at) ||
      compareCanonicalInstants(entity.deleted_at, entity.updated_at) !== 0)
  ) {
    throw new LocalEntityPreconditionError(
      'Delete tombstone timestamps must match',
    )
  }
  if (precondition.kind === 'missing') {
    if (classification.kind !== 'missing') {
      throw new LocalEntityPreconditionError('Local entity already exists')
    }
    return
  }
  if (classification.kind !== 'valid') {
    throw new LocalEntityPreconditionError('Active local entity was not found')
  }

  const current = classification.envelope.value
  if ('deleted_at' in current && current.deleted_at !== null) {
    throw new LocalEntityPreconditionError('Local entity is soft-deleted')
  }
  if (current.updated_at !== precondition.expectedUpdatedAt) {
    throw new LocalEntityPreconditionError('Local entity version changed')
  }
  if (
    !isIsoTime(entity.updated_at) ||
    compareCanonicalInstants(entity.updated_at, current.updated_at) <= 0
  ) {
    throw new LocalEntityPreconditionError(
      'Local entity version must advance',
    )
  }
}

function assertOwnedEntity<Store extends LocalEntityStoreName>(
  storeName: Store,
  userId: string,
  entity: EntityByStore[Store],
) {
  if (entity.user_id !== userId) {
    throw new Error('Local entity ownership does not match user')
  }
  const stableId = getStableEntityId(storeName, entity)
  if (!stableId) {
    throw new Error('Local entity id is required')
  }
}

function assertNewMutation<Store extends MutableEntityStoreName>(
  storeName: Store,
  userId: string,
  entity: EntityByStore[Store],
  mutation: MutationForStore<Store>,
  expectedOperation: 'upsert' | 'delete',
) {
  if (!isSyncMutation(mutation)) {
    throw new Error('Invalid sync mutation')
  }
  if (mutation.userId !== userId) {
    throw new Error('Mutation ownership does not match user')
  }
  if (mutation.entityId !== getStableEntityId(storeName, entity)) {
    throw new Error('Mutation entity id does not match local entity id')
  }
  if (mutation.entityType !== entityTypeByStore[storeName]) {
    throw new Error('Mutation entity type does not match local store')
  }
  if (mutation.operation !== expectedOperation) {
    throw new Error(`Mutation must use ${expectedOperation} operation`)
  }
  if (
    mutation.status !== 'pending' ||
    mutation.attemptCount !== 0 ||
    mutation.lastErrorCode !== null ||
    mutation.lastErrorMessage !== null
  ) {
    throw new Error('New mutation must be a clean pending item')
  }

  if (expectedOperation === 'upsert') {
    if (!jsonValuesEqual(mutation.payload, createUpsertPayload(storeName, entity))) {
      throw new Error('Mutation payload does not match local entity')
    }
  } else if (!isEmptyRecord(mutation.payload)) {
    throw new Error('Delete mutation payload must be empty')
  }
}

function createUpsertPayload<Store extends MutableEntityStoreName>(
  storeName: Store,
  entity: EntityByStore[Store],
) {
  const record = { ...entity } as Record<string, unknown>
  const excluded =
    storeName === syncStoreNames.userSettings
      ? ['user_id', 'created_at', 'updated_at']
      : ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
  for (const key of excluded) {
    delete record[key]
  }
  return record
}

function getStableEntityId<Store extends LocalEntityStoreName>(
  storeName: Store,
  entity: EntityByStore[Store],
) {
  return storeName === syncStoreNames.userSettings
    ? entity.user_id
    : 'id' in entity
      ? entity.id
      : ''
}

function createEntityEnvelope<Store extends LocalEntityStoreName>(
  storeName: Store,
  userId: string,
  entity: EntityByStore[Store],
): StoredEnvelope<EntityByStore[Store]> {
  assertOwnedEntity(storeName, userId, entity)
  return {
    key: entityKey(userId, getStableEntityId(storeName, entity)),
    userId,
    value: entity,
  }
}

function readEntityEnvelope<Store extends LocalEntityStoreName>(
  storeName: Store,
  row: unknown,
  userId: string,
): StoredEnvelope<EntityByStore[Store]> | null {
  const classification = classifyEntityEnvelope(storeName, row, userId)
  if (classification.kind === 'corrupt-owned') {
    throw new LocalSyncDataCorruptionError(
      `Corrupt current-user entity envelope in ${storeName}`,
    )
  }
  return classification.kind === 'valid' ? classification.envelope : null
}

function classifyEntityEnvelope<Store extends LocalEntityStoreName>(
  storeName: Store,
  row: unknown,
  userId: string,
): EnvelopeClassification<EntityByStore[Store]> {
  if (row === undefined) {
    return { kind: 'missing' }
  }
  const envelopeOwner = isRecord(row) ? row.userId : undefined
  const valueOwner =
    isRecord(row) && isRecord(row.value) ? row.value.user_id : undefined
  const pointsToCurrentUser =
    envelopeOwner === userId || valueOwner === userId

  if (
    isRecord(row) &&
    typeof row.key === 'string' &&
    typeof envelopeOwner === 'string' &&
    isRecord(row.value) &&
    typeof valueOwner === 'string' &&
    envelopeOwner === valueOwner
  ) {
    const id =
      storeName === syncStoreNames.userSettings
        ? row.value.user_id
        : row.value.id
    if (typeof id === 'string' && row.key === entityKey(envelopeOwner, id)) {
      if (envelopeOwner === userId) {
        return {
          kind: 'valid',
          envelope: row as StoredEnvelope<EntityByStore[Store]>,
        }
      }
      return { kind: 'foreign' }
    }
  }

  return pointsToCurrentUser ? { kind: 'corrupt-owned' } : { kind: 'orphan' }
}

function readOutboxEnvelope(
  row: unknown,
  userId: string,
  expectedMutationId?: string,
): StoredEnvelope<SyncMutation> | null {
  const classification = classifyOutboxEnvelope(
    row,
    userId,
    expectedMutationId,
  )
  if (classification.kind === 'corrupt-owned') {
    throw new LocalSyncDataCorruptionError('Corrupt current-user Outbox envelope')
  }
  return classification.kind === 'valid' ? classification.envelope : null
}

function classifyOutboxEnvelope(
  row: unknown,
  userId: string,
  expectedMutationId?: string,
): EnvelopeClassification<SyncMutation> {
  if (row === undefined) {
    return { kind: 'missing' }
  }
  const envelopeOwner = isRecord(row) ? row.userId : undefined
  const valueOwner =
    isRecord(row) && isRecord(row.value) ? row.value.userId : undefined
  const pointsToCurrentUser =
    envelopeOwner === userId || valueOwner === userId
  const directlyTargeted =
    expectedMutationId !== undefined &&
    isRecord(row) &&
    row.key === expectedMutationId

  if (
    isRecord(row) &&
    typeof row.key === 'string' &&
    typeof envelopeOwner === 'string' &&
    isSyncMutation(row.value) &&
    envelopeOwner === row.value.userId &&
    row.key === row.value.mutationId &&
    (expectedMutationId === undefined || row.key === expectedMutationId)
  ) {
    if (envelopeOwner === userId) {
      return {
        kind: 'valid',
        envelope: {
          key: row.key,
          userId,
          value: row.value,
        },
      }
    }
    return { kind: 'foreign' }
  }

  return pointsToCurrentUser || directlyTargeted
    ? { kind: 'corrupt-owned' }
    : { kind: 'orphan' }
}

function isSyncMutation(value: unknown): value is SyncMutation {
  if (!isRecord(value) || !isPlainRecord(value.payload)) {
    return false
  }
  if (
    !isNonEmptyString(value.mutationId) ||
    !isNonEmptyString(value.deviceId) ||
    !isNonEmptyString(value.entityId) ||
    !isNonEmptyString(value.userId) ||
    !isPositiveInteger(value.baseSyncEpoch) ||
    !isIsoTime(value.queuedAt) ||
    !Number.isInteger(value.attemptCount) ||
    (value.attemptCount as number) < 0 ||
    !isNullableString(value.lastErrorCode) ||
    !isNullableString(value.lastErrorMessage)
  ) {
    return false
  }
  if (
    value.status !== 'pending' &&
    value.status !== 'syncing' &&
    value.status !== 'needs_attention'
  ) {
    return false
  }
  if (
    value.entityType !== 'bean' &&
    value.entityType !== 'brewLog' &&
    value.entityType !== 'brewTemplate' &&
    value.entityType !== 'userSettings'
  ) {
    return false
  }
  if (value.operation !== 'upsert' && value.operation !== 'delete') {
    return false
  }
  if (value.entityType === 'userSettings' && value.operation === 'delete') {
    return false
  }
  const locallyValid = value.operation === 'delete'
    ? isEmptyRecord(value.payload)
    : (() => {
      switch (value.entityType) {
        case 'bean':
          return isBeanUpsertPayload(value.payload)
        case 'brewLog':
          return isBrewLogUpsertPayload(value.payload)
        case 'brewTemplate':
          return isBrewTemplateUpsertPayload(value.payload)
        case 'userSettings':
          return isUserSettingsUpsertPayload(value.payload)
      }
    })()
  if (!locallyValid) return false

  try {
    validateSyncMutationForWire(value)
    return true
  } catch {
    return false
  }
}

function isBeanUpsertPayload(value: Record<string, unknown>) {
  if (!hasExactKeys(value, [
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
    'remaining_grams',
    'price',
    'purchase_date',
    'source_url',
    'image_url',
    'bean_type',
    'blend_components',
    'blend_notes',
    'notes',
    'schema_version',
  ])) {
    return false
  }
  return (
    typeof value.name === 'string' &&
    isNullableString(value.roaster) &&
    isNullableString(value.origin) &&
    isNullableString(value.farm_or_station) &&
    isNullableString(value.process) &&
    isNullableString(value.variety) &&
    isNullableFiniteNumber(value.altitude_meters) &&
    isNullableCalendarDate(value.roast_date) &&
    isNullableString(value.roast_level) &&
    isStringArray(value.flavor_tags) &&
    isNullableString(value.flavor_notes) &&
    isNullableFiniteNumber(value.net_weight_grams) &&
    isNullableFiniteNumber(value.remaining_grams) &&
    (value.remaining_grams === null || value.remaining_grams >= 0) &&
    isNullableFiniteNumber(value.price) &&
    isNullableCalendarDate(value.purchase_date) &&
    isNullableString(value.source_url) &&
    isNullableString(value.image_url) &&
    (value.bean_type === 'single_origin' || value.bean_type === 'blend') &&
    Array.isArray(value.blend_components) &&
    value.blend_components.every(isBeanBlendComponent) &&
    isNullableString(value.blend_notes) &&
    isNullableString(value.notes) &&
    value.schema_version === 1
  )
}

function isBeanBlendComponent(value: unknown) {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, [
      'origin',
      'process',
      'variety',
      'percentage',
      'role',
      'notes',
    ]) &&
    typeof value.origin === 'string' &&
    typeof value.process === 'string' &&
    typeof value.variety === 'string' &&
    isNullableFiniteNumber(value.percentage) &&
    typeof value.role === 'string' &&
    typeof value.notes === 'string'
  )
}

function isBrewLogUpsertPayload(value: Record<string, unknown>) {
  if (!hasRequiredAndOptionalKeys(value, [
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
    'schema_version',
  ], [
    'brew_mode', 'brew_variant', 'ice_grams', 'beverage_grams',
  ])) {
    return false
  }
  return (
    isNullableString(value.bean_id) &&
    isIsoTime(value.brewed_at) &&
    isNullableString(value.method) &&
    isNullableString(value.dripper) &&
    (value.brew_mode === undefined || value.brew_mode === null || value.brew_mode === 'hot_pourover' || value.brew_mode === 'iced_pourover' || value.brew_mode === 'cold_brew' || value.brew_mode === 'espresso') &&
    (value.brew_variant === undefined || value.brew_variant === null || value.brew_variant === 'ready_to_drink' || value.brew_variant === 'concentrate') &&
    (value.ice_grams === undefined || (isNullableFiniteNumber(value.ice_grams) && (value.ice_grams === null || value.ice_grams >= 0))) &&
    (value.beverage_grams === undefined || (isNullableFiniteNumber(value.beverage_grams) && (value.beverage_grams === null || value.beverage_grams >= 0))) &&
    isNullableString(value.filter_paper) &&
    isNullableString(value.grinder) &&
    isNullableString(value.grind_setting) &&
    isNullableFiniteNumber(value.coffee_grams) &&
    isNullableFiniteNumber(value.water_grams) &&
    isNullableString(value.ratio) &&
    isNullableFiniteNumber(value.water_temperature_c) &&
    isNullableFiniteNumber(value.total_time_seconds) &&
    Array.isArray(value.pour_steps) &&
    value.pour_steps.every(isJsonValue) &&
    isNullableFiniteNumber(value.rating) &&
    isNullableFiniteNumber(value.acidity) &&
    isNullableFiniteNumber(value.sweetness) &&
    isNullableFiniteNumber(value.bitterness) &&
    isNullableFiniteNumber(value.astringency) &&
    isNullableFiniteNumber(value.body) &&
    isNullableFiniteNumber(value.aftertaste) &&
    isStringArray(value.flavor_tags) &&
    typeof value.is_pinned_recipe === 'boolean' &&
    isNullableString(value.notes) &&
    value.schema_version === 1 &&
    (value.brew_variant == null || value.brew_mode === 'cold_brew') &&
    (value.ice_grams == null || value.brew_mode === 'iced_pourover') &&
    (value.beverage_grams == null || value.brew_mode === 'espresso')
  )
}

function isBrewTemplateUpsertPayload(value: Record<string, unknown>) {
  if (!hasExactKeys(value, [
    'name',
    'category',
    'difficulty',
    'brewer',
    'filter',
    'dose_grams',
    'water_grams',
    'ratio',
    'water_temperature_min',
    'water_temperature_max',
    'grind_size',
    'target_time_min',
    'target_time_max',
    'pour_steps',
    'suitable_for',
    'avoid_for',
    'flavor_goal',
    'adjustment_rules',
    'source_notes',
    'source_urls',
    'is_champion_reference',
    'copied_from_template_id',
    'schema_version',
  ])) {
    return false
  }
  return (
    typeof value.name === 'string' &&
    isBrewTemplateCategory(value.category) &&
    (value.difficulty === 'easy' ||
      value.difficulty === 'medium' ||
      value.difficulty === 'advanced') &&
    typeof value.brewer === 'string' &&
    typeof value.filter === 'string' &&
    isFiniteNumber(value.dose_grams) &&
    isFiniteNumber(value.water_grams) &&
    typeof value.ratio === 'string' &&
    isFiniteNumber(value.water_temperature_min) &&
    isFiniteNumber(value.water_temperature_max) &&
    typeof value.grind_size === 'string' &&
    isFiniteNumber(value.target_time_min) &&
    isFiniteNumber(value.target_time_max) &&
    Array.isArray(value.pour_steps) &&
    value.pour_steps.every(isBrewTemplatePourStep) &&
    isStringArray(value.suitable_for) &&
    isStringArray(value.avoid_for) &&
    typeof value.flavor_goal === 'string' &&
    isStringArray(value.adjustment_rules) &&
    typeof value.source_notes === 'string' &&
    isStringArray(value.source_urls) &&
    typeof value.is_champion_reference === 'boolean' &&
    isNullableString(value.copied_from_template_id) &&
    value.schema_version === 1
  )
}

function isBrewTemplateCategory(value: unknown) {
  return (
    value === 'daily-pourover' ||
    value === 'immersion-hybrid' ||
    value === 'bean-specific' ||
    value === 'cold-brew' ||
    value === 'moka-pot' ||
    value === 'champion-reference'
  )
}

function isBrewTemplatePourStep(value: unknown) {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, [
      'order',
      'startSeconds',
      'endSeconds',
      'targetWaterGrams',
      'label',
      'action',
    ]) &&
    isFiniteNumber(value.order) &&
    isFiniteNumber(value.startSeconds) &&
    isNullableFiniteNumber(value.endSeconds) &&
    isFiniteNumber(value.targetWaterGrams) &&
    typeof value.label === 'string' &&
    typeof value.action === 'string'
  )
}

function isUserSettingsUpsertPayload(value: Record<string, unknown>) {
  return (
    hasExactKeys(value, [
      'preferred_units',
      'default_gear',
      'taste_preferences',
      'backup_reminder_days',
      'schema_version',
    ]) &&
    isJsonObject(value.preferred_units) &&
    isJsonObject(value.default_gear) &&
    isJsonObject(value.taste_preferences) &&
    isFiniteNumber(value.backup_reminder_days) &&
    value.schema_version === 1
  )
}

function assertSnapshotOwnership(userId: string, snapshot: SyncSnapshot) {
  assertPositiveEpoch(snapshot.syncEpoch)
  if (!isIsoTime(snapshot.serverTime)) {
    throw new Error('Invalid snapshot server time')
  }

  const rows: Array<{ user_id: string }> = [
    ...snapshot.beans,
    ...snapshot.brewLogs,
    ...snapshot.brewTemplates,
    ...snapshot.aiRecommendations,
    ...(snapshot.userSettings === null ? [] : [snapshot.userSettings]),
  ]
  if (rows.some((row) => row.user_id !== userId)) {
    throw new Error('Server snapshot ownership does not match user')
  }
}

function syncMetaKey(userId: string) {
  return entityKey(userId, 'syncMeta')
}

function createSyncMetaEnvelope(
  userId: string,
  value: SyncMetaValue,
): StoredEnvelope<SyncMetaValue> {
  assertSyncMetaValue(value)
  return { key: syncMetaKey(userId), userId, value }
}

function readSyncMetaEnvelope(
  row: unknown,
  userId: string,
): StoredEnvelope<SyncMetaValue> | null {
  if (row === undefined) {
    return null
  }
  if (
    !isRecord(row) ||
    row.key !== syncMetaKey(userId) ||
    row.userId !== userId ||
    !isRecord(row.value) ||
    !isPositiveInteger(row.value.syncEpoch) ||
    !isIsoTime(row.value.lastSyncedAt)
  ) {
    throw new LocalSyncDataCorruptionError(
      'Corrupt current-user sync metadata envelope',
    )
  }
  return {
    key: syncMetaKey(userId),
    userId,
    value: {
      syncEpoch: row.value.syncEpoch,
      lastSyncedAt: row.value.lastSyncedAt,
    },
  }
}

function assertSyncMetaValue(value: SyncMetaValue) {
  assertPositiveEpoch(value.syncEpoch)
  if (!isIsoTime(value.lastSyncedAt)) {
    throw new Error('Invalid last synced time')
  }
}

function assertMonotonicSyncMeta(
  current: SyncMetaValue | null,
  next: SyncMetaValue,
) {
  assertSyncMetaValue(next)
  if (current === null) {
    return
  }
  if (next.syncEpoch < current.syncEpoch) {
    throw new StaleLocalSnapshotError('Sync epoch cannot move backwards')
  }
  if (
    next.syncEpoch === current.syncEpoch &&
    isoInstantNanoseconds(next.lastSyncedAt) <
      isoInstantNanoseconds(current.lastSyncedAt)
  ) {
    throw new StaleLocalSnapshotError(
      'Same-epoch server time cannot move backwards',
    )
  }
}

function assertPositiveEpoch(value: number) {
  if (!isPositiveInteger(value)) {
    throw new Error('Invalid sync epoch')
  }
}

function assertErrorDetails(code: string, message: string) {
  if (!code.trim() || !message.trim()) {
    throw new Error('Mutation error code and message are required')
  }
}

function jsonValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => jsonValuesEqual(value, right[index]))
    )
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left).sort()
    const rightKeys = Object.keys(right).sort()
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key, index) =>
          key === rightKeys[index] && jsonValuesEqual(left[key], right[key]),
      )
    )
  }
  return false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isEmptyRecord(value: unknown) {
  return isPlainRecord(value) && Object.keys(value).length === 0
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value) as unknown
  return prototype === Object.prototype || prototype === null
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
) {
  const actualKeys = Object.keys(value).sort()
  const sortedExpectedKeys = [...expectedKeys].sort()
  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  )
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}


function hasRequiredAndOptionalKeys(
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
) {
  const actualKeys = Object.keys(value)
  const allowed = new Set([...requiredKeys, ...optionalKeys])
  return requiredKeys.every((key) => Object.hasOwn(value, key))
    && actualKeys.every((key) => allowed.has(key))
}
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value)
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return (
    isPlainRecord(value) &&
    Object.values(value).every((item) => isJsonValue(item))
  )
}

function isJsonValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    isFiniteNumber(value)
  ) {
    return true
  }
  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item))
  }
  return isJsonObject(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isNullableCalendarDate(value: unknown): value is string | null {
  return value === null || isCalendarDate(value)
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) {
    return false
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= getDaysInMonth(year, month)
  )
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isIsoTime(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-](\d{2}):(\d{2}))$/.exec(
    value,
  )
  if (match === null) {
    return false
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const zone = match[8]
  const offsetHour = zone === 'Z' ? 0 : Number(match[9])
  const offsetMinute = zone === 'Z' ? 0 : Number(match[10])
  const daysInMonth = getDaysInMonth(year, month)

  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59 &&
    offsetHour >= 0 &&
    offsetHour <= 23 &&
    offsetMinute >= 0 &&
    offsetMinute <= 59 &&
    Number.isFinite(Date.parse(value))
  )
}

function isoInstantNanoseconds(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(
    value,
  )
  if (match === null) {
    throw new Error('Invalid ISO time')
  }

  const epochMilliseconds = Date.parse(`${match[1]}${match[3]}`)
  if (!Number.isFinite(epochMilliseconds)) {
    throw new Error('Invalid ISO time')
  }
  const fractionalNanoseconds = BigInt((match[2] ?? '').padEnd(9, '0') || '0')
  return BigInt(epochMilliseconds) * 1_000_000n + fractionalNanoseconds
}

function compareCanonicalInstants(left: string, right: string) {
  const leftInstant = isoInstantNanoseconds(left)
  const rightInstant = isoInstantNanoseconds(right)
  return leftInstant < rightInstant ? -1 : leftInstant > rightInstant ? 1 : 0
}

function getDaysInMonth(year: number, month: number) {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}
