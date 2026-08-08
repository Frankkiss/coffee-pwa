import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ServerBeanRow } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import type { UserBrewTemplateRow } from '../brewTemplates/brewTemplateTypes'
import type { SavedRecommendationRow } from '../recommendations/savedRecommendationList'
import type { UserSettingsRow } from '../settings/userSettingsTypes'
import type {
  BeanUpsertPayload,
  SyncMutation,
  SyncSnapshot,
} from './syncTypes'
import { createDeletePayload } from './syncTypes'
import { deleteTestDatabase } from '../../test/setupIndexedDb'
import {
  entityKey,
  openSyncDatabase,
  syncDatabaseName,
  syncStoreNames,
} from './syncDatabase'
import {
  acknowledgeMutations,
  createLocalRepository,
  discardMutationAndReplaceSnapshot,
  listLocalEntities,
  listOutbox,
  LocalSyncDataCorruptionError,
  LocalSyncMutationNotFoundError,
  markMutationAttention,
  markMutationPending,
  markMutationsSyncing,
  quarantineOlderEpoch,
  readSyncEpoch,
  recordRetryableFailure,
  replaceServerSnapshot,
  saveLocalEntity,
  StaleLocalSnapshotError,
  writeSyncMeta,
} from './localRepository'

const userOne = '00000000-0000-4000-8000-000000000001'
const userTwo = '00000000-0000-4000-8000-000000000002'
const fixedNow = '2026-08-08T10:00:00.000Z'

type BeanMutation = Extract<SyncMutation, { entityType: 'bean' }>
type BeanUpsertMutation = Extract<BeanMutation, { operation: 'upsert' }>
type BeanDeleteMutation = Extract<BeanMutation, { operation: 'delete' }>

describe('localRepository atomic entity writes', () => {
  beforeEach(async () => {
    await deleteTestDatabase(syncDatabaseName)
  })

  afterEach(async () => {
    await deleteTestDatabase(syncDatabaseName)
  })

  it('saves an owned entity and matching upsert in one transaction', async () => {
    const bean = createBean(userOne, 'bean-1', 'local edit')
    const mutation = createBeanUpsertMutation(bean, 'mutation-1')

    await saveLocalEntity('beans', userOne, bean, mutation)

    expect(await listLocalEntities('beans', userOne)).toEqual([bean])
    expect(await listOutbox(userOne)).toEqual([mutation])
  })

  it('rejects cross-user, wrong-entity, wrong-store, and mismatched payload writes', async () => {
    const bean = createBean(userOne, 'bean-1', 'local edit')
    const mutation = createBeanUpsertMutation(bean, 'mutation-1')

    await expect(
      saveLocalEntity('beans', userTwo, bean, mutation),
    ).rejects.toThrow('entity ownership')
    await expect(
      saveLocalEntity('beans', userOne, bean, {
        ...mutation,
        entityId: 'different-bean',
      }),
    ).rejects.toThrow('entity id')
    await expect(
      saveLocalEntity('beans', userOne, bean, {
        ...mutation,
        entityType: 'brewLog',
      } as unknown as Parameters<typeof saveLocalEntity<'beans'>>[3]),
    ).rejects.toThrow('Invalid sync mutation')
    await expect(
      saveLocalEntity('beans', userOne, bean, {
        ...mutation,
        payload: { ...mutation.payload, name: 'wire mismatch' },
      }),
    ).rejects.toThrow('payload')

    expect(await listLocalEntities('beans', userOne)).toEqual([])
    expect(await listOutbox(userOne)).toEqual([])
  })

  it('aborts both writes when the test hook fails before Outbox write', async () => {
    const bean = createBean(userOne, 'bean-1', 'local edit')
    const mutation = createBeanUpsertMutation(bean, 'mutation-1')
    const repository = createLocalRepository({
      beforeOutboxWrite: () => {
        throw new Error('forced outbox failure')
      },
    })

    await expect(
      repository.saveLocalEntity('beans', userOne, bean, mutation),
    ).rejects.toThrow('forced outbox failure')

    expect(await listLocalEntities('beans', userOne)).toEqual([])
    expect(await listOutbox(userOne)).toEqual([])
  })

  it('cannot overwrite another user Outbox row when a mutation id collides', async () => {
    const otherMutation = createBeanDeleteMutation(
      userTwo,
      'other-bean',
      'shared-mutation-id',
    )
    await putOutbox(otherMutation)
    const bean = createBean(userOne, 'bean-1', 'local edit')

    await expect(
      saveLocalEntity(
        'beans',
        userOne,
        bean,
        createBeanUpsertMutation(bean, 'shared-mutation-id'),
      ),
    ).rejects.toThrow('mutation id collision')

    expect(await listLocalEntities('beans', userOne)).toEqual([])
    expect(await getOutboxMutation(otherMutation.mutationId)).toEqual(
      otherMutation,
    )
  })

  it('soft-deletes with one local timestamp and an empty branded delete payload', async () => {
    const bean = createBean(userOne, 'bean-1', 'active')
    const mutation = createBeanDeleteMutation(userOne, bean.id, 'mutation-1')
    const repository = createLocalRepository({
      now: () => new Date(fixedNow),
    })

    const tombstone = await repository.softDeleteLocalEntity(
      'beans',
      userOne,
      bean,
      mutation,
    )

    expect(tombstone.deleted_at).toBe(fixedNow)
    expect(tombstone.updated_at).toBe(fixedNow)
    expect(await listLocalEntities('beans', userOne)).toEqual([tombstone])
    expect(await listOutbox(userOne)).toEqual([mutation])
    expect(mutation.payload).toEqual({})
  })

  it('rolls back both tombstone and delete mutation on forced failure', async () => {
    const bean = createBean(userOne, 'bean-1', 'active')
    await putEnvelope('beans', {
      key: entityKey(userOne, bean.id),
      userId: userOne,
      value: bean,
    })
    const repository = createLocalRepository({
      now: () => new Date(fixedNow),
      beforeOutboxWrite: () => {
        throw new Error('forced delete failure')
      },
    })

    await expect(
      repository.softDeleteLocalEntity(
        'beans',
        userOne,
        bean,
        createBeanDeleteMutation(userOne, bean.id, 'mutation-1'),
      ),
    ).rejects.toThrow('forced delete failure')

    expect(await listLocalEntities('beans', userOne)).toEqual([bean])
    expect(await listOutbox(userOne)).toEqual([])
  })

  it('lists stable owned rows including tombstones and ignores valid foreign envelopes', async () => {
    const later = createBean(userOne, 'bean-z', 'later', fixedNow)
    const tombstone = {
      ...createBean(userOne, 'bean-a', 'deleted'),
      deleted_at: fixedNow,
    }
    const other = createBean(userTwo, 'bean-other', 'other')
    await putEnvelope('beans', {
      key: entityKey(userOne, later.id),
      userId: userOne,
      value: later,
    })
    await putEnvelope('beans', {
      key: entityKey(userOne, tombstone.id),
      userId: userOne,
      value: tombstone,
    })
    await putEnvelope('beans', {
      key: entityKey(userTwo, other.id),
      userId: userTwo,
      value: other,
    })
    expect(await listLocalEntities('beans', userOne)).toEqual([
      tombstone,
      later,
    ])
  })

  it('rejects a corrupt-owned entity envelope instead of hiding it', async () => {
    const bean = createBean(userOne, 'bean-1', 'local')
    await putEnvelope('beans', {
      key: entityKey(userOne, 'wrong-id'),
      userId: userOne,
      value: bean,
    })

    await expect(listLocalEntities('beans', userOne)).rejects.toMatchObject({
      code: 'LOCAL_SYNC_DATA_CORRUPT',
    })
  })
})

describe('localRepository Outbox isolation and state transitions', () => {
  beforeEach(async () => {
    await deleteTestDatabase(syncDatabaseName)
  })

  afterEach(async () => {
    await deleteTestDatabase(syncDatabaseName)
  })

  it('lists only valid current-user envelopes in queuedAt and mutationId order', async () => {
    const second = createBeanDeleteMutation(userOne, 'bean-2', 'mutation-c', {
      queuedAt: '2026-08-08T10:01:00.000Z',
    })
    const firstB = createBeanDeleteMutation(userOne, 'bean-1', 'mutation-b', {
      queuedAt: fixedNow,
    })
    const firstA = createBeanDeleteMutation(userOne, 'bean-3', 'mutation-a', {
      queuedAt: fixedNow,
    })
    const other = createBeanDeleteMutation(userTwo, 'bean-4', 'mutation-other')
    await putOutbox(firstB)
    await putOutbox(second)
    await putOutbox(firstA)
    await putOutbox(other)
    await putEnvelope('outbox', {
      key: 'unowned-orphan',
      value: { broken: true },
    })
    expect(await listOutbox(userOne)).toEqual([firstA, firstB, second])
  })

  it('sorts equivalent RFC3339 offsets by mutation id after parsed time', async () => {
    const zulu = createBeanDeleteMutation(userOne, 'bean-z', 'mutation-z', {
      queuedAt: '2026-08-08T10:00:00Z',
    })
    const offset = createBeanDeleteMutation(userOne, 'bean-a', 'mutation-a', {
      queuedAt: '2026-08-08T18:00:00+08:00',
    })
    await putOutbox(zulu)
    await putOutbox(offset)

    expect(await listOutbox(userOne)).toEqual([offset, zulu])
  })

  it('accepts complete allowlisted upserts for all four mutable entity types', async () => {
    const bean = createBean(userOne, 'bean-valid', 'bean')
    const brewLog = createBrewLog(userOne, 'brew-valid')
    const brewTemplate = createBrewTemplate(userOne, 'template-valid')
    const settings = createSettings(userOne, 7)
    const mutations = [
      createBeanUpsertMutation(bean, 'mutation-bean'),
      createRawUpsertMutation(
        userOne,
        brewLog.id,
        'brewLog',
        'mutation-brew',
        omitFields(brewLog, [
          'id',
          'user_id',
          'created_at',
          'updated_at',
          'deleted_at',
        ]),
      ),
      createRawUpsertMutation(
        userOne,
        brewTemplate.id,
        'brewTemplate',
        'mutation-template',
        omitFields(brewTemplate, [
          'id',
          'user_id',
          'created_at',
          'updated_at',
          'deleted_at',
        ]),
      ),
      createRawUpsertMutation(
        userOne,
        userOne,
        'userSettings',
        'mutation-settings',
        omitFields(settings, ['user_id', 'created_at', 'updated_at']),
      ),
    ]
    for (const mutation of mutations) {
      await putOutbox(mutation)
    }

    expect(await listOutbox(userOne)).toEqual(
      [...mutations].sort((left, right) =>
        left.mutationId.localeCompare(right.mutationId),
      ),
    )
  })

  it.each<[
    string,
    (mutation: BeanDeleteMutation) => { key: string; userId: string; value: unknown },
  ]>([
    [
      'envelope owner',
      (mutation) => ({
        key: mutation.mutationId,
        userId: userTwo,
        value: mutation,
      }),
    ],
    [
      'value owner',
      (mutation) => ({
        key: mutation.mutationId,
        userId: userOne,
        value: { ...mutation, userId: userTwo },
      }),
    ],
    [
      'key',
      (mutation) => ({
        key: 'different-key',
        userId: userOne,
        value: mutation,
      }),
    ],
    [
      'queuedAt',
      (mutation) => ({
        key: mutation.mutationId,
        userId: userOne,
        value: { ...mutation, queuedAt: 'August 8, 2026 10:00' },
      }),
    ],
  ])('rejects current-user corrupt-owned %s data', async (_label, createRow) => {
    const mutation = createBeanDeleteMutation(
      userOne,
      'bean-corrupt',
      'mutation-corrupt',
    )
    await putEnvelope('outbox', createRow(mutation))

    await expect(listOutbox(userOne)).rejects.toMatchObject({
      code: 'LOCAL_SYNC_DATA_CORRUPT',
    })
    await expect(listOutbox(userOne)).rejects.toBeInstanceOf(
      LocalSyncDataCorruptionError,
    )
  })

  it('classifies an empty current-user upsert payload as corrupt-owned', async () => {
    const bean = createBean(userOne, 'bean-empty', 'empty payload')
    const mutation = createBeanUpsertMutation(bean, 'mutation-empty')
    await putEnvelope('outbox', {
      key: mutation.mutationId,
      userId: userOne,
      value: { ...mutation, payload: {} },
    })

    await expect(listOutbox(userOne)).rejects.toMatchObject({
      code: 'LOCAL_SYNC_DATA_CORRUPT',
    })
  })

  it('rolls back a batch when an upsert payload contains an unknown field', async () => {
    const valid = createBeanDeleteMutation(userOne, 'bean-valid', 'mutation-valid')
    const bean = createBean(userOne, 'bean-unknown', 'unknown payload')
    const corrupt = createBeanUpsertMutation(bean, 'mutation-unknown')
    await putOutbox(valid)
    await putEnvelope('outbox', {
      key: corrupt.mutationId,
      userId: userOne,
      value: {
        ...corrupt,
        payload: { ...corrupt.payload, unexpected: true },
      },
    })

    await expect(
      markMutationsSyncing(userOne, [valid.mutationId, corrupt.mutationId]),
    ).rejects.toMatchObject({ code: 'LOCAL_SYNC_DATA_CORRUPT' })

    expect(await getOutboxMutation(valid.mutationId)).toEqual(valid)
    expect(await getOutboxMutation(corrupt.mutationId)).toEqual({
      ...corrupt,
      payload: { ...corrupt.payload, unexpected: true },
    })
  })

  it('rejects a normalized but impossible RFC3339 calendar date', async () => {
    const mutation = createBeanDeleteMutation(
      userOne,
      'bean-date',
      'mutation-date',
      { queuedAt: '2026-02-30T10:00:00Z' },
    )
    await putOutbox(mutation)

    await expect(listOutbox(userOne)).rejects.toMatchObject({
      code: 'LOCAL_SYNC_DATA_CORRUPT',
    })
  })

  it('applies guarded status transitions without changing another user', async () => {
    const own = createBeanDeleteMutation(userOne, 'bean-1', 'mutation-own', {
      lastErrorCode: 'OLD',
      lastErrorMessage: 'old error',
    })
    const other = createBeanDeleteMutation(userTwo, 'bean-2', 'mutation-other')
    const attention = createBeanDeleteMutation(
      userOne,
      'bean-3',
      'mutation-attention',
      { status: 'needs_attention' },
    )
    await putOutbox(own)
    await putOutbox(other)
    await putOutbox(attention)

    await markMutationsSyncing(userOne, [own.mutationId, attention.mutationId])
    expect(await getOutboxMutation(own.mutationId)).toMatchObject({
      status: 'syncing',
      attemptCount: 1,
      lastErrorCode: null,
      lastErrorMessage: null,
    })
    expect(await getOutboxMutation(attention.mutationId)).toMatchObject({
      status: 'needs_attention',
      attemptCount: 0,
    })

    await recordRetryableFailure(
      userOne,
      [own.mutationId, other.mutationId],
      'NETWORK',
      'retry later',
    )
    expect(await getOutboxMutation(own.mutationId)).toMatchObject({
      status: 'pending',
      attemptCount: 1,
      lastErrorCode: 'NETWORK',
      lastErrorMessage: 'retry later',
    })
    expect(await getOutboxMutation(other.mutationId)).toEqual(other)

    await markMutationAttention(
      userOne,
      [own.mutationId, other.mutationId],
      'INVALID',
      'manual action',
    )
    await markMutationPending(userOne, own.mutationId)
    expect(await getOutboxMutation(own.mutationId)).toMatchObject({
      status: 'pending',
      attemptCount: 1,
      lastErrorCode: null,
      lastErrorMessage: null,
    })
    expect(await getOutboxMutation(other.mutationId)).toEqual(other)
  })

  it('cannot acknowledge, retry, discard, quarantine, or change another user row', async () => {
    const other = createBeanDeleteMutation(userTwo, 'bean-2', 'mutation-other', {
      baseSyncEpoch: 1,
      status: 'needs_attention',
      lastErrorCode: 'KEEP',
      lastErrorMessage: 'keep me',
    })
    await putOutbox(other)

    await acknowledgeMutations(userOne, [other.mutationId])
    await markMutationsSyncing(userOne, [other.mutationId])
    await recordRetryableFailure(userOne, [other.mutationId], 'NO', 'no')
    await markMutationAttention(userOne, [other.mutationId], 'NO', 'no')
    await markMutationPending(userOne, other.mutationId)
    await quarantineOlderEpoch(userOne, 2, 'STALE', 'stale')
    await expect(
      discardMutationAndReplaceSnapshot(
        userOne,
        other.mutationId,
        createSnapshot(userOne),
      ),
    ).rejects.toBeInstanceOf(LocalSyncMutationNotFoundError)

    expect(await getOutboxMutation(other.mutationId)).toEqual(other)
  })

  it('acknowledges only exact owned envelopes', async () => {
    const acknowledged = createBeanDeleteMutation(
      userOne,
      'bean-1',
      'mutation-ack',
    )
    await putOutbox(acknowledged)

    await acknowledgeMutations(userOne, [acknowledged.mutationId])

    expect(await listOutbox(userOne)).toEqual([])
  })

  it('quarantines only current-user rows from an older epoch', async () => {
    const oldMutation = createBeanDeleteMutation(userOne, 'bean-1', 'old', {
      baseSyncEpoch: 1,
    })
    const currentMutation = createBeanDeleteMutation(userOne, 'bean-2', 'current', {
      baseSyncEpoch: 2,
    })
    const other = createBeanDeleteMutation(userTwo, 'bean-3', 'other', {
      baseSyncEpoch: 1,
    })
    await putOutbox(oldMutation)
    await putOutbox(currentMutation)
    await putOutbox(other)

    await quarantineOlderEpoch(userOne, 2, 'STALE_EPOCH', 'review edit')

    expect(await getOutboxMutation(oldMutation.mutationId)).toMatchObject({
      status: 'needs_attention',
      lastErrorCode: 'STALE_EPOCH',
      lastErrorMessage: 'review edit',
    })
    expect(await getOutboxMutation(currentMutation.mutationId)).toEqual(
      currentMutation,
    )
    expect(await getOutboxMutation(other.mutationId)).toEqual(other)
  })

  it('rolls back every selected state change when a transaction hook fails', async () => {
    const first = createBeanDeleteMutation(userOne, 'bean-1', 'first')
    const second = createBeanDeleteMutation(userOne, 'bean-2', 'second')
    await putOutbox(first)
    await putOutbox(second)
    const repository = createLocalRepository({
      beforeCommit: (operation) => {
        if (operation === 'markMutationsSyncing') {
          throw new Error('forced batch failure')
        }
      },
    })

    await expect(
      repository.markMutationsSyncing(userOne, [first.mutationId, second.mutationId]),
    ).rejects.toThrow('forced batch failure')

    expect(await getOutboxMutation(first.mutationId)).toEqual(first)
    expect(await getOutboxMutation(second.mutationId)).toEqual(second)
  })

  it('aborts all selected state changes when one target is corrupt-owned', async () => {
    const valid = createBeanDeleteMutation(userOne, 'bean-valid', 'mutation-valid')
    const corrupt = createBeanDeleteMutation(
      userOne,
      'bean-corrupt',
      'mutation-corrupt-value',
    )
    await putOutbox(valid)
    await putEnvelope('outbox', {
      key: 'mutation-corrupt',
      userId: userOne,
      value: corrupt,
    })

    await expect(
      markMutationsSyncing(userOne, [valid.mutationId, 'mutation-corrupt']),
    ).rejects.toMatchObject({ code: 'LOCAL_SYNC_DATA_CORRUPT' })

    expect(await getOutboxMutation(valid.mutationId)).toEqual(valid)
    expect(await getOutboxMutation('mutation-corrupt')).toEqual(corrupt)
  })

  it('rejects a directly targeted unowned corrupt orphan without modifying valid rows', async () => {
    const valid = createBeanDeleteMutation(userOne, 'bean-valid', 'mutation-valid')
    await putOutbox(valid)
    await putEnvelope('outbox', {
      key: 'mutation-orphan',
      value: { broken: true },
    })

    await expect(
      markMutationsSyncing(userOne, [valid.mutationId, 'mutation-orphan']),
    ).rejects.toMatchObject({ code: 'LOCAL_SYNC_DATA_CORRUPT' })

    expect(await getOutboxMutation(valid.mutationId)).toEqual(valid)
  })
})

describe('localRepository server snapshots and sync metadata', () => {
  beforeEach(async () => {
    await deleteTestDatabase(syncDatabaseName)
  })

  afterEach(async () => {
    await deleteTestDatabase(syncDatabaseName)
  })

  it('atomically replaces one user baseline while preserving every local intent', async () => {
    const protectedPending = createBean(userOne, 'bean-protected-pending', 'local pending')
    const protectedAttention = createBean(userOne, 'bean-protected-attention', 'local attention')
    const removedByServer = createBean(userOne, 'bean-removed', 'old server row')
    const otherUserBean = createBean(userTwo, 'bean-other', 'other user')
    const oldRecommendation = createRecommendation(userOne, 'recommendation-old')
    await putEntityRows('beans', [
      protectedPending,
      protectedAttention,
      removedByServer,
      otherUserBean,
    ])
    await putEntityRows('aiRecommendations', [oldRecommendation])
    await putOutbox(
      createBeanUpsertMutation(protectedPending, 'pending-intent'),
    )
    await putOutbox(
      createBeanUpsertMutation(protectedAttention, 'attention-intent', {
        status: 'needs_attention',
      }),
    )

    const serverNew = createBean(userOne, 'bean-new', 'server new')
    const serverTombstone = {
      ...createBean(userOne, 'bean-tombstone', 'server deleted'),
      deleted_at: fixedNow,
    }
    const snapshot = createSnapshot(userOne, {
      beans: [
        { ...protectedPending, name: 'server stale pending' },
        { ...protectedAttention, name: 'server stale attention' },
        serverNew,
        serverTombstone,
      ],
      aiRecommendations: [
        createRecommendation(userOne, 'recommendation-new'),
      ],
    })

    await replaceServerSnapshot(userOne, snapshot)

    expect(await listLocalEntities('beans', userOne)).toEqual([
      serverNew,
      protectedAttention,
      protectedPending,
      serverTombstone,
    ])
    expect(await listLocalEntities('beans', userTwo)).toEqual([otherUserBean])
    expect(await listLocalEntities('aiRecommendations', userOne)).toEqual(
      snapshot.aiRecommendations,
    )
    expect(await readSyncEpoch(userOne)).toBe(snapshot.syncEpoch)
    expect(await readSyncMetaRow(userOne)).toEqual({
      syncEpoch: snapshot.syncEpoch,
      lastSyncedAt: snapshot.serverTime,
    })
  })

  it('atomically discards one mutation, restores its server tombstone, and preserves other intent', async () => {
    const discardedLocal = createBean(userOne, 'bean-discarded', 'local edit')
    const protectedLocal = createBean(userOne, 'bean-protected', 'keep local')
    const otherUserBean = createBean(userTwo, 'bean-other', 'other user')
    const discardedMutation = createBeanUpsertMutation(
      discardedLocal,
      'mutation-discarded',
      { status: 'needs_attention' },
    )
    const protectedMutation = createBeanUpsertMutation(
      protectedLocal,
      'mutation-protected',
    )
    await putEntityRows('beans', [discardedLocal, protectedLocal, otherUserBean])
    await putOutbox(discardedMutation)
    await putOutbox(protectedMutation)
    const serverTombstone = {
      ...createBean(userOne, discardedLocal.id, 'server deleted'),
      deleted_at: fixedNow,
    }
    const snapshot = createSnapshot(userOne, {
      beans: [
        serverTombstone,
        { ...protectedLocal, name: 'stale server protected' },
      ],
    })

    await discardMutationAndReplaceSnapshot(
      userOne,
      discardedMutation.mutationId,
      snapshot,
    )

    expect(await listLocalEntities('beans', userOne)).toEqual([
      serverTombstone,
      protectedLocal,
    ])
    expect(await listOutbox(userOne)).toEqual([protectedMutation])
    expect(await listLocalEntities('beans', userTwo)).toEqual([otherUserBean])
    expect(await readSyncMetaRow(userOne)).toEqual({
      syncEpoch: snapshot.syncEpoch,
      lastSyncedAt: snapshot.serverTime,
    })
  })

  it('rolls back discard, overlay, snapshot, and meta on forced failure', async () => {
    const local = createBean(userOne, 'bean-discarded', 'local edit')
    const mutation = createBeanUpsertMutation(local, 'mutation-discarded', {
      status: 'needs_attention',
    })
    await putEntityRows('beans', [local])
    await putOutbox(mutation)
    const repository = createLocalRepository({
      beforeCommit: (operation) => {
        if (operation === 'discardMutationAndReplaceSnapshot') {
          throw new Error('forced discard failure')
        }
      },
    })

    await expect(
      repository.discardMutationAndReplaceSnapshot(
        userOne,
        mutation.mutationId,
        createSnapshot(userOne, {
          beans: [createBean(userOne, local.id, 'server version')],
        }),
      ),
    ).rejects.toThrow('forced discard failure')

    expect(await listLocalEntities('beans', userOne)).toEqual([local])
    expect(await listOutbox(userOne)).toEqual([mutation])
    expect(await readSyncEpoch(userOne)).toBe(1)
  })

  it('rejects missing or foreign discard targets without applying a snapshot', async () => {
    const original = createBean(userOne, 'bean-original', 'original')
    const foreign = createBeanDeleteMutation(
      userTwo,
      'bean-foreign',
      'mutation-foreign',
    )
    await putEntityRows('beans', [original])
    await putOutbox(foreign)
    const snapshot = createSnapshot(userOne, {
      beans: [createBean(userOne, 'bean-new', 'must not apply')],
    })

    await expect(
      discardMutationAndReplaceSnapshot(userOne, 'missing', snapshot),
    ).rejects.toBeInstanceOf(LocalSyncMutationNotFoundError)
    await expect(
      discardMutationAndReplaceSnapshot(userOne, foreign.mutationId, snapshot),
    ).rejects.toBeInstanceOf(LocalSyncMutationNotFoundError)

    expect(await listLocalEntities('beans', userOne)).toEqual([original])
    expect(await getOutboxMutation(foreign.mutationId)).toEqual(foreign)
    expect(await readSyncEpoch(userOne)).toBe(1)
  })

  it('replaces brew logs, templates, and settings for only the requested user', async () => {
    const oldBrew = createBrewLog(userOne, 'brew-old')
    const otherBrew = createBrewLog(userTwo, 'brew-other')
    const oldTemplate = createBrewTemplate(userOne, 'template-old')
    const oldSettings = createSettings(userOne, 7)
    await putEntityRows('brewLogs', [oldBrew, otherBrew])
    await putEntityRows('brewTemplates', [oldTemplate])
    await putEntityRows('userSettings', [oldSettings])
    const snapshot = createSnapshot(userOne, {
      brewLogs: [createBrewLog(userOne, 'brew-new')],
      brewTemplates: [createBrewTemplate(userOne, 'template-new')],
      userSettings: createSettings(userOne, 14),
    })

    await replaceServerSnapshot(userOne, snapshot)

    expect(await listLocalEntities('brewLogs', userOne)).toEqual(snapshot.brewLogs)
    expect(await listLocalEntities('brewLogs', userTwo)).toEqual([otherBrew])
    expect(await listLocalEntities('brewTemplates', userOne)).toEqual(
      snapshot.brewTemplates,
    )
    expect(await listLocalEntities('userSettings', userOne)).toEqual([
      snapshot.userSettings,
    ])
  })

  it('rejects a cross-user snapshot without changing cache or metadata', async () => {
    const original = createBean(userOne, 'bean-original', 'original')
    await putEntityRows('beans', [original])
    const snapshot = createSnapshot(userOne, {
      beans: [createBean(userTwo, 'bean-invalid', 'wrong owner')],
    })

    await expect(replaceServerSnapshot(userOne, snapshot)).rejects.toThrow(
      'snapshot ownership',
    )

    expect(await listLocalEntities('beans', userOne)).toEqual([original])
    expect(await readSyncEpoch(userOne)).toBe(1)
  })

  it('rejects corrupt-owned Outbox during snapshot replacement and rolls back all stores', async () => {
    const original = createBean(userOne, 'bean-original', 'original')
    const corrupt = createBeanDeleteMutation(
      userOne,
      original.id,
      'mutation-corrupt-value',
    )
    await putEntityRows('beans', [original])
    await writeSyncMeta(userOne, {
      syncEpoch: 2,
      lastSyncedAt: fixedNow,
    })
    await putEnvelope('outbox', {
      key: 'mutation-corrupt',
      userId: userOne,
      value: corrupt,
    })
    const snapshot = createSnapshot(userOne, {
      syncEpoch: 3,
      serverTime: '2026-08-08T11:00:00.000Z',
      beans: [createBean(userOne, 'bean-new', 'new')],
    })

    await expect(replaceServerSnapshot(userOne, snapshot)).rejects.toMatchObject({
      code: 'LOCAL_SYNC_DATA_CORRUPT',
    })

    expect(await listLocalEntities('beans', userOne)).toEqual([original])
    expect(await getOutboxMutation('mutation-corrupt')).toEqual(corrupt)
    expect(await readSyncMetaRow(userOne)).toEqual({
      syncEpoch: 2,
      lastSyncedAt: fixedNow,
    })
  })

  it('rolls back replace and discard when a persisted upsert payload is empty', async () => {
    const original = createBean(userOne, 'bean-original', 'local overlay')
    const mutation = createBeanUpsertMutation(original, 'mutation-empty', {
      status: 'needs_attention',
    })
    const corruptValue = { ...mutation, payload: {} }
    await putEntityRows('beans', [original])
    await putEnvelope('outbox', {
      key: mutation.mutationId,
      userId: userOne,
      value: corruptValue,
    })
    await writeSyncMeta(userOne, {
      syncEpoch: 2,
      lastSyncedAt: fixedNow,
    })
    const snapshot = createSnapshot(userOne, {
      syncEpoch: 3,
      serverTime: '2026-08-08T11:00:00Z',
      beans: [createBean(userOne, original.id, 'server version')],
    })

    await expect(replaceServerSnapshot(userOne, snapshot)).rejects.toMatchObject({
      code: 'LOCAL_SYNC_DATA_CORRUPT',
    })
    await expect(
      discardMutationAndReplaceSnapshot(userOne, mutation.mutationId, snapshot),
    ).rejects.toMatchObject({ code: 'LOCAL_SYNC_DATA_CORRUPT' })

    expect(await listLocalEntities('beans', userOne)).toEqual([original])
    expect(await getOutboxMutation(mutation.mutationId)).toEqual(corruptValue)
    expect(await readSyncMetaRow(userOne)).toEqual({
      syncEpoch: 2,
      lastSyncedAt: fixedNow,
    })
  })

  it('rejects lower epochs and older same-epoch snapshots without degrading rows or meta', async () => {
    const original = createBean(userOne, 'bean-original', 'original')
    await putEntityRows('beans', [original])
    await writeSyncMeta(userOne, {
      syncEpoch: 3,
      lastSyncedAt: fixedNow,
    })
    const staleEntity = createBean(userOne, 'bean-stale', 'stale')

    await expect(
      replaceServerSnapshot(
        userOne,
        createSnapshot(userOne, {
          syncEpoch: 2,
          serverTime: '2026-08-08T11:00:00.000Z',
          beans: [staleEntity],
        }),
      ),
    ).rejects.toBeInstanceOf(StaleLocalSnapshotError)
    await expect(
      replaceServerSnapshot(
        userOne,
        createSnapshot(userOne, {
          syncEpoch: 3,
          serverTime: '2026-08-08T09:00:00.000Z',
          beans: [staleEntity],
        }),
      ),
    ).rejects.toMatchObject({ code: 'STALE_LOCAL_SNAPSHOT' })

    expect(await listLocalEntities('beans', userOne)).toEqual([original])
    expect(await readSyncMetaRow(userOne)).toEqual({
      syncEpoch: 3,
      lastSyncedAt: fixedNow,
    })
  })

  it('allows a higher epoch even when its canonical server time is earlier', async () => {
    await writeSyncMeta(userOne, {
      syncEpoch: 3,
      lastSyncedAt: fixedNow,
    })
    const higherEpoch = createSnapshot(userOne, {
      syncEpoch: 4,
      serverTime: '2020-01-01T00:00:00Z',
      beans: [createBean(userOne, 'bean-new', 'higher epoch')],
    })

    await replaceServerSnapshot(userOne, higherEpoch)

    expect(await listLocalEntities('beans', userOne)).toEqual(higherEpoch.beans)
    expect(await readSyncMetaRow(userOne)).toEqual({
      syncEpoch: 4,
      lastSyncedAt: higherEpoch.serverTime,
    })
  })

  it('rolls back snapshot rows and metadata together on forced failure', async () => {
    const original = createBean(userOne, 'bean-original', 'original')
    await putEntityRows('beans', [original])
    await writeSyncMeta(userOne, {
      syncEpoch: 2,
      lastSyncedAt: '2026-08-08T09:00:00.000Z',
    })
    const repository = createLocalRepository({
      beforeCommit: (operation) => {
        if (operation === 'replaceServerSnapshot') {
          throw new Error('forced snapshot failure')
        }
      },
    })

    await expect(
      repository.replaceServerSnapshot(
        userOne,
        createSnapshot(userOne, {
          syncEpoch: 3,
          beans: [createBean(userOne, 'bean-new', 'new')],
        }),
      ),
    ).rejects.toThrow('forced snapshot failure')

    expect(await listLocalEntities('beans', userOne)).toEqual([original])
    expect(await readSyncMetaRow(userOne)).toEqual({
      syncEpoch: 2,
      lastSyncedAt: '2026-08-08T09:00:00.000Z',
    })
  })

  it('rejects corrupt current-user sync metadata before snapshot or meta writes', async () => {
    const original = createBean(userOne, 'bean-original', 'original')
    await putEntityRows('beans', [original])
    await putEnvelope('syncMeta', {
      key: entityKey(userOne, 'syncMeta'),
      userId: userOne,
      value: { syncEpoch: 'broken', lastSyncedAt: fixedNow },
    })

    await expect(
      replaceServerSnapshot(
        userOne,
        createSnapshot(userOne, {
          beans: [createBean(userOne, 'bean-new', 'must not apply')],
        }),
      ),
    ).rejects.toBeInstanceOf(LocalSyncDataCorruptionError)
    await expect(
      writeSyncMeta(userOne, { syncEpoch: 3, lastSyncedAt: fixedNow }),
    ).rejects.toMatchObject({ code: 'LOCAL_SYNC_DATA_CORRUPT' })

    expect(await listLocalEntities('beans', userOne)).toEqual([original])
  })

  it('defaults missing sync metadata to epoch one and validates writes', async () => {
    expect(await readSyncEpoch(userOne)).toBe(1)

    await writeSyncMeta(userOne, {
      syncEpoch: 4,
      lastSyncedAt: fixedNow,
    })
    expect(await readSyncEpoch(userOne)).toBe(4)

    await expect(
      writeSyncMeta(userOne, { syncEpoch: 0, lastSyncedAt: fixedNow }),
    ).rejects.toThrow('sync epoch')
    await expect(
      writeSyncMeta(userOne, { syncEpoch: 5, lastSyncedAt: 'not-a-date' }),
    ).rejects.toThrow('last synced')
    await expect(
      writeSyncMeta(userOne, {
        syncEpoch: 3,
        lastSyncedAt: '2026-08-08T11:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(StaleLocalSnapshotError)
    await expect(
      writeSyncMeta(userOne, {
        syncEpoch: 4,
        lastSyncedAt: '2026-08-08T09:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'STALE_LOCAL_SNAPSHOT' })
    await expect(
      writeSyncMeta(userOne, {
        syncEpoch: 5,
        lastSyncedAt: 'August 8, 2026 12:00',
      }),
    ).rejects.toThrow('last synced')
    expect(await readSyncEpoch(userOne)).toBe(4)
  })
})

function createBean(
  userId: string,
  id: string,
  name: string,
  updatedAt = '2026-08-08T09:00:00.000Z',
): ServerBeanRow {
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
    bean_type: 'single_origin',
    blend_components: [],
    blend_notes: null,
    notes: null,
    created_at: '2026-08-08T08:00:00.000Z',
    updated_at: updatedAt,
    deleted_at: null,
    schema_version: 1,
  }
}

function createBeanPayload(bean: ServerBeanRow): BeanUpsertPayload {
  return {
    name: bean.name,
    roaster: bean.roaster,
    origin: bean.origin,
    farm_or_station: bean.farm_or_station,
    process: bean.process,
    variety: bean.variety,
    altitude_meters: bean.altitude_meters,
    roast_date: bean.roast_date,
    roast_level: bean.roast_level,
    flavor_tags: bean.flavor_tags,
    flavor_notes: bean.flavor_notes,
    net_weight_grams: bean.net_weight_grams,
    price: bean.price,
    purchase_date: bean.purchase_date,
    source_url: bean.source_url,
    image_url: bean.image_url,
    bean_type: bean.bean_type,
    blend_components: bean.blend_components,
    blend_notes: bean.blend_notes,
    notes: bean.notes,
    schema_version: bean.schema_version,
  }
}

function createBeanUpsertMutation(
  bean: ServerBeanRow,
  mutationId: string,
  overrides: Partial<BeanUpsertMutation> = {},
): BeanUpsertMutation {
  return {
    mutationId,
    deviceId: 'device-1',
    entityId: bean.id,
    entityType: 'bean',
    operation: 'upsert',
    payload: createBeanPayload(bean),
    userId: bean.user_id,
    baseSyncEpoch: 1,
    queuedAt: fixedNow,
    attemptCount: 0,
    status: 'pending',
    lastErrorCode: null,
    lastErrorMessage: null,
    ...overrides,
  } as BeanUpsertMutation
}

function createBeanDeleteMutation(
  userId: string,
  entityId: string,
  mutationId: string,
  overrides: Partial<BeanDeleteMutation> = {},
): BeanDeleteMutation {
  return {
    mutationId,
    deviceId: 'device-1',
    entityId,
    entityType: 'bean',
    operation: 'delete',
    payload: createDeletePayload(),
    userId,
    baseSyncEpoch: 1,
    queuedAt: fixedNow,
    attemptCount: 0,
    status: 'pending',
    lastErrorCode: null,
    lastErrorMessage: null,
    ...overrides,
  } as BeanDeleteMutation
}

function createRawUpsertMutation(
  userId: string,
  entityId: string,
  entityType: SyncMutation['entityType'],
  mutationId: string,
  payload: Record<string, unknown>,
): SyncMutation {
  return {
    mutationId,
    deviceId: 'device-1',
    entityId,
    entityType,
    operation: 'upsert',
    payload,
    userId,
    baseSyncEpoch: 1,
    queuedAt: fixedNow,
    attemptCount: 0,
    status: 'pending',
    lastErrorCode: null,
    lastErrorMessage: null,
  } as SyncMutation
}

function omitFields<Row extends object>(
  row: Row,
  excludedFields: readonly string[],
) {
  return Object.fromEntries(
    (Object.entries(row) as Array<[string, unknown]>).filter(
      ([key]) => !excludedFields.includes(key),
    ),
  )
}

function createBrewLog(userId: string, id: string): BrewLog {
  return {
    id,
    user_id: userId,
    bean_id: null,
    brewed_at: fixedNow,
    method: null,
    dripper: null,
    filter_paper: null,
    grinder: null,
    grind_setting: null,
    coffee_grams: null,
    water_grams: null,
    ratio: null,
    water_temperature_c: null,
    total_time_seconds: null,
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
    created_at: fixedNow,
    updated_at: fixedNow,
    deleted_at: null,
    schema_version: 1,
  }
}

function createBrewTemplate(
  userId: string,
  id: string,
): UserBrewTemplateRow {
  return {
    id,
    user_id: userId,
    name: id,
    category: 'daily-pourover',
    difficulty: 'easy',
    brewer: 'V60',
    filter: 'paper',
    dose_grams: 15,
    water_grams: 250,
    ratio: '1:16.7',
    water_temperature_min: 90,
    water_temperature_max: 94,
    grind_size: 'medium',
    target_time_min: 150,
    target_time_max: 180,
    pour_steps: [],
    suitable_for: [],
    avoid_for: [],
    flavor_goal: 'balanced',
    adjustment_rules: [],
    source_notes: '',
    source_urls: [],
    is_champion_reference: false,
    copied_from_template_id: null,
    created_at: fixedNow,
    updated_at: fixedNow,
    deleted_at: null,
    schema_version: 1,
  }
}

function createSettings(userId: string, days: number): UserSettingsRow {
  return {
    user_id: userId,
    preferred_units: {},
    default_gear: {},
    taste_preferences: {},
    backup_reminder_days: days,
    created_at: fixedNow,
    updated_at: fixedNow,
    schema_version: 1,
  }
}

function createRecommendation(
  userId: string,
  id: string,
): SavedRecommendationRow {
  return {
    id,
    user_id: userId,
    bean_id: null,
    input_context: {},
    recommendation: {},
    model_name: null,
    accepted: null,
    created_at: fixedNow,
    updated_at: fixedNow,
    deleted_at: null,
    schema_version: 1,
  }
}

function createSnapshot(
  userId: string,
  overrides: Partial<SyncSnapshot> = {},
): SyncSnapshot {
  return {
    syncEpoch: 2,
    serverTime: fixedNow,
    beans: [],
    brewLogs: [],
    brewTemplates: [],
    userSettings: createSettings(userId, 7),
    aiRecommendations: [],
    ...overrides,
  }
}

async function putEntityRows(
  storeName:
    | 'beans'
    | 'brewLogs'
    | 'brewTemplates'
    | 'userSettings'
    | 'aiRecommendations',
  rows: Array<
    | ServerBeanRow
    | BrewLog
    | UserBrewTemplateRow
    | UserSettingsRow
    | SavedRecommendationRow
  >,
) {
  for (const row of rows) {
    const userId = row.user_id
    const id = 'id' in row ? row.id : row.user_id
    await putEnvelope(storeName, {
      key: entityKey(userId, id),
      userId,
      value: row,
    })
  }
}

function putOutbox(mutation: SyncMutation) {
  return putEnvelope('outbox', {
    key: mutation.mutationId,
    userId: mutation.userId,
    value: mutation,
  })
}

async function putEnvelope(storeName: string, envelope: unknown) {
  const database = await openSyncDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite')
      transaction.objectStore(storeName).put(envelope)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => {
        reject(transaction.error ?? new Error('Test write failed'))
      }
      transaction.onabort = () => {
        reject(transaction.error ?? new Error('Test write aborted'))
      }
    })
  } finally {
    database.close()
  }
}

async function getOutboxMutation(mutationId: string) {
  const database = await openSyncDatabase()
  try {
    const result = await readRequest<unknown>(
      database
        .transaction(syncStoreNames.outbox)
        .objectStore(syncStoreNames.outbox)
        .get(mutationId),
    )
    if (!isRecord(result) || !isRecord(result.value)) {
      return undefined
    }
    return result.value
  } finally {
    database.close()
  }
}

async function readSyncMetaRow(userId: string) {
  const database = await openSyncDatabase()
  try {
    const result = await readRequest<unknown>(
      database
        .transaction(syncStoreNames.syncMeta)
        .objectStore(syncStoreNames.syncMeta)
        .get(entityKey(userId, 'syncMeta')),
    )
    if (!isRecord(result)) {
      return undefined
    }
    return result.value
  } finally {
    database.close()
  }
}

function readRequest<Result>(request: IDBRequest<Result>) {
  return new Promise<Result>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      reject(request.error ?? new Error('Test read failed'))
    }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
