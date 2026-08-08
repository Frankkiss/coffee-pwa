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
  | 'markMutationsSyncing'
  | 'recordRetryableFailure'
  | 'markMutationAttention'
  | 'markMutationPending'
  | 'discardMutation'
  | 'quarantineOlderEpoch'
  | 'replaceServerSnapshot'
  | 'writeSyncMeta'

export type LocalRepositoryTestOptions = {
  beforeOutboxWrite?: () => void
  beforeCommit?: (operation: LocalRepositoryTestOperation) => void
  now?: () => Date
}

export type LocalRepository = SyncStorage & {
  saveLocalEntity<Store extends MutableEntityStoreName>(
    storeName: Store,
    userId: string,
    entity: EntityByStore[Store],
    mutation: UpsertMutationForStore<Store>,
  ): Promise<void>
  softDeleteLocalEntity<Store extends DeletableEntityStoreName>(
    storeName: Store,
    userId: string,
    entity: EntityByStore[Store],
    mutation: DeleteMutationForStore<Store>,
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
  return {
    saveLocalEntity: <Store extends MutableEntityStoreName>(
      storeName: Store,
      userId: string,
      entity: EntityByStore[Store],
      mutation: UpsertMutationForStore<Store>,
    ) => saveLocalEntityWithOptions(storeName, userId, entity, mutation, testOptions),
    softDeleteLocalEntity: <Store extends DeletableEntityStoreName>(
      storeName: Store,
      userId: string,
      entity: EntityByStore[Store],
      mutation: DeleteMutationForStore<Store>,
    ) => softDeleteLocalEntityWithOptions(
      storeName,
      userId,
      entity,
      mutation,
      testOptions,
    ),
    listLocalEntities,
    replaceServerSnapshot: (userId: string, snapshot: SyncSnapshot) =>
      replaceServerSnapshotWithOptions(userId, snapshot, testOptions),
    listOutbox,
    acknowledgeMutations: (userId: string, mutationIds: string[]) =>
      acknowledgeMutationsWithOptions(userId, mutationIds, testOptions),
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
    discardMutation: (userId: string, mutationId: string) =>
      discardMutationWithOptions(userId, mutationId, testOptions),
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
    readSyncEpoch,
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
) {
  return saveLocalEntityWithOptions(
    storeName,
    userId,
    entity,
    mutation,
    defaultOptions,
  )
}

export function softDeleteLocalEntity<
  Store extends DeletableEntityStoreName,
>(
  storeName: Store,
  userId: string,
  entity: EntityByStore[Store],
  mutation: DeleteMutationForStore<Store>,
) {
  return softDeleteLocalEntityWithOptions(
    storeName,
    userId,
    entity,
    mutation,
    defaultOptions,
  )
}

/** Returns the owned overlay in stable key order, including tombstones. */
export async function listLocalEntities<Store extends LocalEntityStoreName>(
  storeName: Store,
  userId: string,
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
  })
}

export async function listOutbox(userId: string): Promise<SyncMutation[]> {
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
                left.queuedAt.localeCompare(right.queuedAt) ||
                left.mutationId.localeCompare(right.mutationId),
            )
        } catch (error) {
          abort(error)
        }
      }
    }).then(() => mutations)
  })
}

export function acknowledgeMutations(userId: string, mutationIds: string[]) {
  return acknowledgeMutationsWithOptions(userId, mutationIds, defaultOptions)
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

/**
 * Removes only the owned queue entry. It deliberately does not claim to restore
 * the server row; SyncManager must fetch and install a fresh snapshot next.
 */
export function discardMutation(userId: string, mutationId: string) {
  return discardMutationWithOptions(userId, mutationId, defaultOptions)
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

export function replaceServerSnapshot(userId: string, snapshot: SyncSnapshot) {
  return replaceServerSnapshotWithOptions(userId, snapshot, defaultOptions)
}

export async function readSyncEpoch(userId: string): Promise<number> {
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
  })
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
) {
  assertMutableStoreName(storeName)
  assertOwnedEntity(storeName, userId, entity)
  assertNewMutation(storeName, userId, entity, mutation, 'upsert')

  await withDatabase((database) => {
    const transaction = database.transaction(
      [storeName, syncStoreNames.outbox],
      'readwrite',
    )
    return waitForTransaction(transaction, (abort) => {
      scheduleEntityAndOutboxWrite(
        transaction,
        storeName,
        userId,
        entity,
        mutation,
        'saveLocalEntity',
        options,
        abort,
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
): Promise<EntityByStore[Store]> {
  assertDeletableStoreName(storeName)
  assertOwnedEntity(storeName, userId, entity)
  assertNewMutation(storeName, userId, entity, mutation, 'delete')
  const deletedAt = (options.now ?? (() => new Date()))().toISOString()
  const tombstone = {
    ...entity,
    deleted_at: deletedAt,
    updated_at: deletedAt,
  } as EntityByStore[Store]

  await withDatabase((database) => {
    const transaction = database.transaction(
      [storeName, syncStoreNames.outbox],
      'readwrite',
    )
    return waitForTransaction(transaction, (abort) => {
      scheduleEntityAndOutboxWrite(
        transaction,
        storeName,
        userId,
        tombstone,
        mutation,
        'softDeleteLocalEntity',
        options,
        abort,
      )
    })
  })

  return tombstone
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
      mutation.status === 'needs_attention'
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

function discardMutationWithOptions(
  userId: string,
  mutationId: string,
  options: LocalRepositoryTestOptions,
) {
  return mutateSelectedOutbox(
    userId,
    [mutationId],
    'discardMutation',
    () => 'delete',
    options,
  )
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
      let remaining = storesToRead.length

      for (const storeName of storesToRead) {
        const request = transaction.objectStore(storeName).getAll()
        request.onsuccess = () => {
          try {
            rowsByStore.set(storeName, request.result as unknown[])
            remaining -= 1
            if (remaining === 0) {
              applySnapshotTransaction(
                transaction,
                rowsByStore,
                userId,
                snapshot,
              )
              options.beforeCommit?.('replaceServerSnapshot')
            }
          } catch (error) {
            abort(error)
          }
        }
      }
    })
  })
}

function applySnapshotTransaction(
  transaction: IDBTransaction,
  rowsByStore: Map<string, unknown[]>,
  userId: string,
  snapshot: SyncSnapshot,
) {
  const protectedKeys = new Map<LocalEntityStoreName, Set<string>>()
  for (const storeName of entityStoreNames) {
    protectedKeys.set(storeName, new Set())
  }

  for (const row of rowsByStore.get(syncStoreNames.outbox) ?? []) {
    const envelope = readOutboxEnvelope(row, userId)
    if (envelope !== null) {
      const storeName = storeByEntityType[envelope.value.entityType]
      protectedKeys
        .get(storeName)
        ?.add(entityKey(userId, envelope.value.entityId))
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
      try {
        transaction
          .objectStore(syncStoreNames.syncMeta)
          .put(createSyncMetaEnvelope(userId, input))
        options.beforeCommit?.('writeSyncMeta')
      } catch (error) {
        abort(error)
      }
    })
  })
}

async function withDatabase<Result>(
  work: (database: IDBDatabase) => Promise<Result>,
) {
  const database = await openSyncDatabase()
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
  if (
    !isRecord(row) ||
    typeof row.key !== 'string' ||
    row.userId !== userId ||
    !isRecord(row.value) ||
    row.value.user_id !== userId
  ) {
    return null
  }
  const id =
    storeName === syncStoreNames.userSettings
      ? row.value.user_id
      : row.value.id
  if (typeof id !== 'string' || row.key !== entityKey(userId, id)) {
    return null
  }
  return row as StoredEnvelope<EntityByStore[Store]>
}

function readOutboxEnvelope(
  row: unknown,
  userId: string,
  expectedMutationId?: string,
): StoredEnvelope<SyncMutation> | null {
  if (
    !isRecord(row) ||
    typeof row.key !== 'string' ||
    row.userId !== userId ||
    !isSyncMutation(row.value) ||
    row.value.userId !== userId ||
    row.key !== row.value.mutationId ||
    (expectedMutationId !== undefined && row.key !== expectedMutationId)
  ) {
    return null
  }
  return {
    key: row.key,
    userId,
    value: row.value,
  }
}

function isSyncMutation(value: unknown): value is SyncMutation {
  if (!isRecord(value) || !isRecord(value.payload)) {
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
  return value.operation !== 'delete' || isEmptyRecord(value.payload)
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
  if (
    !isRecord(row) ||
    row.key !== syncMetaKey(userId) ||
    row.userId !== userId ||
    !isRecord(row.value) ||
    !isPositiveInteger(row.value.syncEpoch) ||
    !isIsoTime(row.value.lastSyncedAt)
  ) {
    return null
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
  return isRecord(value) && Object.keys(value).length === 0
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isIsoTime(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}
