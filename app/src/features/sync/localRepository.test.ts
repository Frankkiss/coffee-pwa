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
  discardMutation,
  listLocalEntities,
  listOutbox,
  markMutationAttention,
  markMutationPending,
  markMutationsSyncing,
  quarantineOlderEpoch,
  readSyncEpoch,
  recordRetryableFailure,
  replaceServerSnapshot,
  saveLocalEntity,
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
    ).rejects.toThrow('entity type')
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

  it('lists stable owned rows including tombstones and ignores malformed envelopes', async () => {
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
    await putEnvelope('beans', {
      key: entityKey(userOne, 'malformed'),
      userId: userOne,
      value: { ...later, id: 'wrong-id' },
    })

    expect(await listLocalEntities('beans', userOne)).toEqual([
      tombstone,
      later,
    ])
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
      key: 'bad-key',
      userId: userOne,
      value: { ...firstA, mutationId: 'different-key' },
    })
    await putEnvelope('outbox', {
      key: 'bad-owner',
      userId: userOne,
      value: { ...firstA, mutationId: 'bad-owner', userId: userTwo },
    })

    expect(await listOutbox(userOne)).toEqual([firstA, firstB, second])
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
    await discardMutation(userOne, other.mutationId)

    expect(await getOutboxMutation(other.mutationId)).toEqual(other)
  })

  it('acknowledges and discards only exact owned envelopes', async () => {
    const acknowledged = createBeanDeleteMutation(
      userOne,
      'bean-1',
      'mutation-ack',
    )
    const discarded = createBeanDeleteMutation(
      userOne,
      'bean-2',
      'mutation-discard',
    )
    const localOverlay = createBean(userOne, discarded.entityId, 'still local')
    await putOutbox(acknowledged)
    await putOutbox(discarded)
    await putEnvelope('beans', {
      key: entityKey(userOne, localOverlay.id),
      userId: userOne,
      value: localOverlay,
    })

    await acknowledgeMutations(userOne, [acknowledged.mutationId])
    await discardMutation(userOne, discarded.mutationId)

    expect(await listOutbox(userOne)).toEqual([])
    expect(await listLocalEntities('beans', userOne)).toEqual([localOverlay])
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
