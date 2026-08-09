import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteTestDatabase } from '../../test/setupIndexedDb'
import type { BeanInsertPayload, BeanUpdatePayload } from '../beans/beanTypes'
import type { BrewLogInsertPayload, BrewLogUpdatePayload } from '../brews/brewTypes'
import {
  entityKey,
  openSyncDatabase,
  syncDatabaseName,
} from './syncDatabase'
import { listLocalEntities, listOutbox } from './localRepository'
import { selectSendableMutationBatch } from './outboxModel'
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
const legacyCreateAttentionMessage =
  'Legacy create may already exist in cloud; compare the latest cloud snapshot and explicitly retry.'

describe('legacy offline migration', () => {
  beforeEach(async () => {
    await deleteTestDatabase(syncDatabaseName)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await deleteTestDatabase(syncDatabaseName)
  })

  it('maps local ids, rewrites references, and preserves every mutation and source', async () => {
    const bean = legacyBean(userOne, localBeanId, 'snapshot final')
    const brew = legacyBrew(userOne, localBrewId, localBeanId)
    const pending = [
      legacyMutation('create-bean', userOne, 'bean', 'create', localBeanId, {
        ...beanCreatePayload(userOne, 'payload stale'),
        id: localBeanId,
      }),
      legacyMutation('update-bean', userOne, 'bean', 'update', localBeanId, {
        name: 'snapshot final',
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
      [
        'beans',
        legacySnapshot(userOne, [bean], '2026-08-08T10:00:02.000Z'),
      ],
      [
        'brewLogs',
        legacySnapshot(userOne, [brew], '2026-08-08T10:00:02.000Z'),
      ],
    ], pending)

    const beforeSources = await readLegacySources()
    const result = await migrateLegacyOfflineData(userOne, deviceId, 7)

    expect(result.status).toBe('completed')
    expect(result).toEqual(expect.objectContaining({
      migrationVersion: 9,
      sourceFingerprint: expect.stringMatching(/^fnv1a128:[0-9a-f]{32}$/),
    }))
    expect(result.sourcePreserved).toBe(true)
    expect(result.idMap[localBeanId]).toMatch(uuidPattern)
    expect(result.idMap[localBrewId]).toMatch(uuidPattern)
    expect(result.counts).toEqual({
      sourceSnapshots: 2,
      sourceMutations: 5,
      migratedBeans: 1,
      migratedBrewLogs: 1,
      migratedMutations: 5,
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
    expect(outbox).toHaveLength(5)
    expect(outbox.every((mutation) => mutation.mutationId.match(uuidPattern))).toBe(true)
    expect(outbox.every((mutation) => mutation.userId === userOne)).toBe(true)
    expect(outbox.every((mutation) => mutation.deviceId === deviceId)).toBe(true)
    expect(outbox.every((mutation) => mutation.baseSyncEpoch === 7)).toBe(true)
    expect(outbox.every((mutation) => mutation.attemptCount === 0)).toBe(true)
    const attentionOutbox = outbox.filter(
      (mutation) => mutation.status === 'needs_attention',
    )
    expect(attentionOutbox).toHaveLength(4)
    expect(attentionOutbox.every(
      (mutation) =>
        mutation.lastErrorCode === 'LEGACY_CREATE_REQUIRES_CONFIRMATION' &&
        mutation.lastErrorMessage === legacyCreateAttentionMessage,
    )).toBe(true)
    expect(outbox.filter((mutation) => mutation.status === 'pending')).toEqual([
      expect.objectContaining({ entityId: cloudBeanId, operation: 'delete' }),
    ])
    expect(selectSendableMutationBatch(outbox)).toEqual([
      expect.objectContaining({
        mutation: expect.objectContaining({ entityId: cloudBeanId, operation: 'delete' }),
      }),
    ])

    const beanOperations = outbox
      .filter((mutation) => mutation.entityId === result.idMap[localBeanId])
      .map((mutation) => mutation.operation)
    expect(beanOperations).toEqual(['upsert', 'upsert', 'delete'])
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
    const outbox = await listOutbox(userOne)
    expect(outbox).toHaveLength(2)
    expect(outbox.every(
      (mutation) =>
        mutation.status === 'needs_attention' &&
        mutation.lastErrorCode === 'LEGACY_CREATE_REQUIRES_CONFIRMATION',
    )).toBe(true)
    expect(selectSendableMutationBatch(outbox)).toEqual([])
  })

  it('merges a pending update captured after an older snapshot', async () => {
    const bean = legacyBean(userOne, cloudBeanId, 'snapshot before update')
    await seedVersionTwoDatabase([
      [
        'beans',
        legacySnapshot(userOne, [bean], '2026-08-08T10:00:00.000001Z'),
      ],
    ], [
      legacyMutation(
        'newer-update',
        userOne,
        'bean',
        'update',
        cloudBeanId,
        { name: 'pending edit survives' },
        '2026-08-08T10:00:00.000002Z',
      ),
    ])

    await migrateLegacyOfflineData(userOne, deviceId, 1)

    expect(await listLocalEntities('beans', userOne)).toEqual([
      expect.objectContaining({ name: 'pending edit survives' }),
    ])
    expect(await listOutbox(userOne)).toEqual([
      expect.objectContaining({
        operation: 'upsert',
        payload: expect.objectContaining({ name: 'pending edit survives' }),
      }),
    ])
  })

  it('retains an update queued before the cache stored its resulting row', async () => {
    const bean = legacyBean(userOne, cloudBeanId, 'snapshot already updated')
    await seedVersionTwoDatabase([
      [
        'beans',
        legacySnapshot(userOne, [bean], '2026-08-08T10:00:00.000002Z'),
      ],
    ], [
      legacyMutation(
        'older-update',
        userOne,
        'bean',
        'update',
        cloudBeanId,
        { name: 'snapshot already updated' },
        '2026-08-08T10:00:00.000001Z',
      ),
    ])

    await migrateLegacyOfflineData(userOne, deviceId, 1)

    expect(await listLocalEntities('beans', userOne)).toEqual([
      expect.objectContaining({ name: 'snapshot already updated' }),
    ])
    expect(await listOutbox(userOne)).toEqual([
      expect.objectContaining({
        operation: 'upsert',
        payload: expect.objectContaining({
          name: 'snapshot already updated',
          bean_type: 'single_origin',
          blend_components: [],
          schema_version: 1,
        }),
      }),
    ])
  })

  it('prefers a pending update when snapshot and mutation timestamps are equal', async () => {
    const bean = legacyBean(userOne, cloudBeanId, 'snapshot at same instant')
    await seedVersionTwoDatabase([
      ['beans', legacySnapshot(userOne, [bean], fixedTime)],
    ], [
      legacyMutation(
        'equal-time-update',
        userOne,
        'bean',
        'update',
        cloudBeanId,
        { name: 'equal-time pending edit survives' },
        fixedTime,
      ),
    ])

    await migrateLegacyOfflineData(userOne, deviceId, 1)

    expect(await listLocalEntities('beans', userOne)).toEqual([
      expect.objectContaining({ name: 'equal-time pending edit survives' }),
    ])
    expect(await listOutbox(userOne)).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          name: 'equal-time pending edit survives',
        }),
      }),
    ])
  })

  it('retains a delete queued before the cache removed its row', async () => {
    await seedVersionTwoDatabase([
      [
        'beans',
        legacySnapshot(userOne, [], '2026-08-08T10:00:00.000002Z'),
      ],
    ], [
      legacyMutation(
        'older-delete',
        userOne,
        'bean',
        'delete',
        cloudBeanId,
        undefined,
        '2026-08-08T10:00:00.000001Z',
      ),
    ])

    await migrateLegacyOfflineData(userOne, deviceId, 1)

    expect(await listLocalEntities('beans', userOne)).toEqual([])
    expect(await listOutbox(userOne)).toEqual([
      expect.objectContaining({
        operation: 'delete',
        entityId: cloudBeanId,
        payload: {},
      }),
    ])
  })

  it('retains a create queued before the cache stored its resulting row', async () => {
    const bean = legacyBean(userOne, localBeanId, 'created offline')
    await seedVersionTwoDatabase([
      [
        'beans',
        legacySnapshot(userOne, [bean], '2026-08-08T10:00:00.000002Z'),
      ],
    ], [
      legacyMutation(
        'queued-create',
        userOne,
        'bean',
        'create',
        localBeanId,
        beanCreatePayload(userOne, 'created offline'),
        '2026-08-08T10:00:00.000001Z',
      ),
    ])

    const result = await migrateLegacyOfflineData(userOne, deviceId, 1)

    expect(await listLocalEntities('beans', userOne)).toEqual([
      expect.objectContaining({
        id: result.idMap[localBeanId],
        name: 'created offline',
      }),
    ])
    expect(await listOutbox(userOne)).toEqual([
      expect.objectContaining({
        operation: 'upsert',
        entityId: result.idMap[localBeanId],
        status: 'needs_attention',
        lastErrorCode: 'LEGACY_CREATE_REQUIRES_CONFIRMATION',
        lastErrorMessage: legacyCreateAttentionMessage,
      }),
    ])
    expect(selectSendableMutationBatch(await listOutbox(userOne))).toEqual([])
  })

  it('quarantines the full brew chain when its reconstructed row references a local bean', async () => {
    const cloudBrewId = '00000000-0000-4000-8000-0000000000c9'
    await seedVersionTwoDatabase([
      ['beans', legacySnapshot(userOne, [
        legacyBean(userOne, localBeanId, 'ambiguous local bean'),
      ])],
      ['brewLogs', legacySnapshot(userOne, [
        legacyBrew(userOne, cloudBrewId, localBeanId),
      ])],
    ], [
      legacyMutation(
        'ambiguous-bean-create',
        userOne,
        'bean',
        'create',
        localBeanId,
        beanCreatePayload(userOne, 'ambiguous local bean'),
      ),
      legacyMutation(
        'related-brew-update-a',
        userOne,
        'brewLog',
        'update',
        cloudBrewId,
        { notes: 'related edit' },
        '2026-08-08T10:00:01.000Z',
      ),
      legacyMutation(
        'related-brew-update-b',
        userOne,
        'brewLog',
        'update',
        cloudBrewId,
        { rating: 4 },
        '2026-08-08T10:00:02.000Z',
      ),
    ])

    await migrateLegacyOfflineData(userOne, deviceId, 1)

    const outbox = await listOutbox(userOne)
    expect(outbox).toHaveLength(3)
    expect(outbox.every(
      (mutation) =>
        mutation.status === 'needs_attention' &&
        mutation.lastErrorCode === 'LEGACY_CREATE_REQUIRES_CONFIRMATION' &&
        mutation.lastErrorMessage === legacyCreateAttentionMessage,
    )).toBe(true)
    expect(selectSendableMutationBatch(outbox)).toEqual([])
  })

  it('preserves every pending write for conservative send-time compaction', async () => {
    const bean = legacyBean(userOne, cloudBeanId, 'baseline')
    await seedVersionTwoDatabase([
      ['beans', legacySnapshot(userOne, [bean], '2026-08-08T10:00:04.000Z')],
    ], [
      legacyMutation(
        'first-update',
        userOne,
        'bean',
        'update',
        cloudBeanId,
        { notes: 'first pending edit' },
        '2026-08-08T10:00:01.000Z',
      ),
      legacyMutation(
        'second-update',
        userOne,
        'bean',
        'update',
        cloudBeanId,
        { name: 'final pending name' },
        '2026-08-08T10:00:02.000Z',
      ),
      legacyMutation(
        'final-delete',
        userOne,
        'bean',
        'delete',
        cloudBeanId,
        undefined,
        '2026-08-08T10:00:03.000Z',
      ),
    ])

    await migrateLegacyOfflineData(userOne, deviceId, 1)

    expect(await listLocalEntities('beans', userOne)).toEqual([
      expect.objectContaining({
        name: 'final pending name',
        notes: 'first pending edit',
        deleted_at: '2026-08-08T10:00:03.000Z',
      }),
    ])
    const outbox = await listOutbox(userOne)
    expect(outbox.map((mutation) => mutation.operation)).toEqual([
      'upsert',
      'upsert',
      'delete',
    ])
    for (const mutation of outbox.slice(0, 2)) {
      expect(mutation).toEqual(expect.objectContaining({
        entityType: 'bean',
        operation: 'upsert',
        payload: expect.objectContaining({
          name: 'final pending name',
          notes: 'first pending edit',
          bean_type: 'single_origin',
          schema_version: 1,
        }),
      }))
    }

    const batch = selectSendableMutationBatch(outbox)
    expect(batch.map((selection) => selection.mutation.operation)).toEqual([
      'upsert',
      'delete',
    ])
    expect(batch.flatMap((selection) => selection.coveredMutationIds)).toEqual(
      outbox.map((mutation) => mutation.mutationId),
    )
  })

  it('applies an equal-time delete over an active snapshot', async () => {
    const bean = legacyBean(userOne, cloudBeanId, 'delete at equal time')
    await seedVersionTwoDatabase([
      ['beans', legacySnapshot(userOne, [bean], fixedTime)],
    ], [
      legacyMutation(
        'equal-delete',
        userOne,
        'bean',
        'delete',
        cloudBeanId,
        undefined,
        fixedTime,
      ),
    ])

    await migrateLegacyOfflineData(userOne, deviceId, 1)

    expect(await listLocalEntities('beans', userOne)).toEqual([
      expect.objectContaining({ deleted_at: fixedTime }),
    ])
    expect(await listOutbox(userOne)).toEqual([
      expect.objectContaining({ operation: 'delete', entityId: cloudBeanId }),
    ])
  })

  it('applies an equal-time update over a tombstoned snapshot', async () => {
    const bean = {
      ...legacyBean(userOne, cloudBeanId, 'tombstone at equal time'),
      deleted_at: fixedTime,
    }
    await seedVersionTwoDatabase([
      ['beans', legacySnapshot(userOne, [bean], fixedTime)],
    ], [
      legacyMutation(
        'equal-update-revive',
        userOne,
        'bean',
        'update',
        cloudBeanId,
        { name: 'equal update revives' },
        fixedTime,
      ),
    ])

    await migrateLegacyOfflineData(userOne, deviceId, 1)

    expect(await listLocalEntities('beans', userOne)).toEqual([
      expect.objectContaining({
        name: 'equal update revives',
        deleted_at: null,
      }),
    ])
    expect(await listOutbox(userOne)).toEqual([
      expect.objectContaining({ operation: 'upsert' }),
    ])
  })

  it.each([
    [
      'bean snapshot',
      2,
      () => ({
        snapshots: [[
          'beans',
          legacySnapshot(userOne, [{
            ...legacyBean(userOne, cloudBeanId, 'future bean snapshot'),
            schema_version: 2,
            future_field: 'must survive',
          }]),
        ]] as LegacySnapshotEntry[],
        pending: [],
      }),
    ],
    [
      'brew snapshot',
      999,
      () => ({
        snapshots: [[
          'brewLogs',
          legacySnapshot(userOne, [{
            ...legacyBrew(
              userOne,
              '00000000-0000-4000-8000-0000000000c4',
              cloudBeanId,
            ),
            schema_version: 999,
            future_field: 'must survive',
          }]),
        ]] as LegacySnapshotEntry[],
        pending: [],
      }),
    ],
    [
      'bean pending create',
      2,
      () => ({
        snapshots: [] as LegacySnapshotEntry[],
        pending: [legacyMutation(
          'future-bean-create',
          userOne,
          'bean',
          'create',
          'local-bean-future-schema',
          {
            ...beanCreatePayload(userOne, 'future bean pending'),
            schema_version: 2,
            future_field: 'must survive',
          },
        )],
      }),
    ],
    [
      'brew pending create',
      999,
      () => ({
        snapshots: [] as LegacySnapshotEntry[],
        pending: [legacyMutation(
          'future-brew-create',
          userOne,
          'brewLog',
          'create',
          'local-brew-future-schema',
          {
            ...brewCreatePayload(userOne, cloudBeanId),
            schema_version: 999,
            future_field: 'must survive',
          },
        )],
      }),
    ],
  ])('requires recovery for unsupported schema_version in a %s', async (_case, schemaVersion, buildInput) => {
    const input = buildInput()
    await seedVersionTwoDatabase(input.snapshots, input.pending)
    const sourcesBeforeMigration = await readLegacySources()
    const targetsBeforeMigration = await readTargetRows()

    await expect(
      migrateLegacyOfflineData(userOne, deviceId, 1),
    ).rejects.toMatchObject({
      code: 'LEGACY_MIGRATION_RECOVERY_REQUIRED',
      message: expect.stringMatching(/exportLegacyRecoveryData/),
    })

    expect(await readLegacySources()).toEqual(sourcesBeforeMigration)
    expect(await readTargetRows()).toEqual(targetsBeforeMigration)
    const recoveryJson = JSON.stringify(await exportLegacyRecoveryData(userOne))
    expect(recoveryJson).toContain(`"schema_version":${schemaVersion}`)
    expect(recoveryJson).toContain(`"future_field":"must survive"`)
  })

  it.each([
    [
      'bean snapshot row',
      () => {
        const bean = legacyBean(userOne, cloudBeanId, 'missing snapshot version') as Record<string, unknown>
        delete bean.schema_version
        return {
          snapshots: [['beans', legacySnapshot(userOne, [bean])]] as LegacySnapshotEntry[],
          pending: [],
        }
      },
    ],
    [
      'brew snapshot row',
      () => {
        const brew = legacyBrew(
          userOne,
          '00000000-0000-4000-8000-0000000000c7',
          cloudBeanId,
        ) as Record<string, unknown>
        delete brew.schema_version
        return {
          snapshots: [['brewLogs', legacySnapshot(userOne, [brew])]] as LegacySnapshotEntry[],
          pending: [],
        }
      },
    ],
  ])('requires recovery when schema_version is missing from a %s', async (_case, buildInput) => {
    const input = buildInput()
    await seedVersionTwoDatabase(input.snapshots, input.pending)
    const sourcesBeforeMigration = await readLegacySources()
    const targetsBeforeMigration = await readTargetRows()

    await expect(
      migrateLegacyOfflineData(userOne, deviceId, 1),
    ).rejects.toMatchObject({
      code: 'LEGACY_MIGRATION_RECOVERY_REQUIRED',
      message: expect.stringMatching(/exportLegacyRecoveryData/),
    })

    expect(await readLegacySources()).toEqual(sourcesBeforeMigration)
    expect(await readTargetRows()).toEqual(targetsBeforeMigration)
    expect(await exportLegacyRecoveryData(userOne)).toEqual(expect.objectContaining({
      userId: userOne,
    }))
  })

  it('migrates real v2 bean and brew insert/update payloads without schema_version', async () => {
    const localBean = 'local-bean-real-v2-insert'
    const localBrew = 'local-brew-real-v2-insert'
    const cloudBrew = '00000000-0000-4000-8000-0000000000c8'
    const beanInsert: BeanInsertPayload = beanCreatePayload(userOne, 'real bean insert')
    const { user_id: beanInsertOwner, ...beanUpdate } = beanCreatePayload(
      userOne,
      'real bean update',
    )
    const typedBeanUpdate: BeanUpdatePayload = beanUpdate
    const brewInsert: BrewLogInsertPayload = brewCreatePayload(userOne, localBean)
    const { user_id: brewInsertOwner, ...brewUpdate } = brewCreatePayload(
      userOne,
      cloudBeanId,
    )
    const typedBrewUpdate: BrewLogUpdatePayload = brewUpdate
    expect(beanInsertOwner).toBe(userOne)
    expect(brewInsertOwner).toBe(userOne)
    const pending = [
      rawLegacyMutation('real-bean-insert', 'bean', 'create', localBean, beanInsert),
      rawLegacyMutation('real-bean-update', 'bean', 'update', cloudBeanId, typedBeanUpdate),
      rawLegacyMutation('real-brew-insert', 'brewLog', 'create', localBrew, brewInsert),
      rawLegacyMutation('real-brew-update', 'brewLog', 'update', cloudBrew, typedBrewUpdate),
    ]
    expect(
      pending.every((mutation) => !Object.hasOwn(mutation.payload, 'schema_version')),
    ).toBe(true)
    await seedVersionTwoDatabase([
      ['beans', legacySnapshot(userOne, [
        legacyBean(userOne, cloudBeanId, 'bean update baseline'),
      ])],
      ['brewLogs', legacySnapshot(userOne, [
        legacyBrew(userOne, cloudBrew, cloudBeanId),
      ])],
    ], pending)
    const sourcesBeforeMigration = await readLegacySources()

    const result = await migrateLegacyOfflineData(userOne, deviceId, 1)

    expect(result.counts).toEqual(expect.objectContaining({
      sourceMutations: 4,
      migratedMutations: 4,
    }))
    expect(await listLocalEntities('beans', userOne)).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'real bean insert', schema_version: 1 }),
      expect.objectContaining({ id: cloudBeanId, name: 'real bean update', schema_version: 1 }),
    ]))
    expect(await listLocalEntities('brewLogs', userOne)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: result.idMap[localBrew], schema_version: 1 }),
      expect.objectContaining({ id: cloudBrew, schema_version: 1 }),
    ]))
    expect(await listOutbox(userOne)).toEqual([
      expect.objectContaining({ operation: 'upsert', payload: expect.objectContaining({ schema_version: 1 }) }),
      expect.objectContaining({ operation: 'upsert', payload: expect.objectContaining({ schema_version: 1 }) }),
      expect.objectContaining({ operation: 'upsert', payload: expect.objectContaining({ schema_version: 1 }) }),
      expect.objectContaining({ operation: 'upsert', payload: expect.objectContaining({ schema_version: 1 }) }),
    ])
    expect(await readLegacySources()).toEqual(sourcesBeforeMigration)
  })

  it.each([
    [
      'snapshot row',
      [['beans', legacySnapshot(userOne, [{
        ...legacyBean(userOne, cloudBeanId, 'unknown snapshot field'),
        future_field: 'must remain recoverable',
      }])]] as LegacySnapshotEntry[],
      [],
    ],
    [
      'unversioned pending payload',
      [['beans', legacySnapshot(userOne, [
        legacyBean(userOne, cloudBeanId, 'unknown pending baseline'),
      ])]] as LegacySnapshotEntry[],
      [rawLegacyMutation(
        'unknown-pending-field',
        'bean',
        'update',
        cloudBeanId,
        {
          ...beanCreatePayload(userOne, 'unknown pending field'),
          future_field: 'must remain recoverable',
        } as BeanInsertPayload,
      )],
    ],
  ])('requires recovery instead of dropping an unknown field from a %s', async (_case, snapshots, pending) => {
    await seedVersionTwoDatabase(snapshots, pending)
    const sourcesBeforeMigration = await readLegacySources()
    const targetsBeforeMigration = await readTargetRows()

    await expect(
      migrateLegacyOfflineData(userOne, deviceId, 1),
    ).rejects.toMatchObject({
      code: 'LEGACY_MIGRATION_RECOVERY_REQUIRED',
      message: expect.stringMatching(/exportLegacyRecoveryData/),
    })

    expect(await readLegacySources()).toEqual(sourcesBeforeMigration)
    expect(await readTargetRows()).toEqual(targetsBeforeMigration)
    expect(JSON.stringify(await exportLegacyRecoveryData(userOne))).toContain(
      'must remain recoverable',
    )
  })

  it.each([
    [
      'snapshot blend component',
      [['beans', legacySnapshot(userOne, [{
        ...legacyBean(userOne, cloudBeanId, 'nested snapshot field'),
        bean_type: 'blend',
        blend_components: [{
          ...blendComponent(),
          future_nested_field: 'must remain recoverable',
        }],
      }])]] as LegacySnapshotEntry[],
      [],
    ],
    [
      'pending blend component',
      [['beans', legacySnapshot(userOne, [
        legacyBean(userOne, cloudBeanId, 'nested pending baseline'),
      ])]] as LegacySnapshotEntry[],
      [legacyMutation(
        'nested-pending-field',
        userOne,
        'bean',
        'update',
        cloudBeanId,
        {
          bean_type: 'blend',
          blend_components: [{
            ...blendComponent(),
            future_nested_field: 'must remain recoverable',
          }],
        },
      )],
    ],
    [
      'unversioned pending blend component without a baseline',
      [] as LegacySnapshotEntry[],
      [{
        id: 'nested-pending-without-baseline',
        userId: userOne,
        entity: 'bean',
        action: 'update',
        entityId: cloudBeanId,
        payload: {
          blend_components: [{
            ...blendComponent(),
            future_nested_field: 'must remain recoverable',
          }],
        },
        createdAt: fixedTime,
        attempts: 0,
        lastError: null,
      }],
    ],
  ])('requires recovery for an unknown field in a %s', async (_case, snapshots, pending) => {
    await seedVersionTwoDatabase(snapshots, pending)
    const sourcesBeforeMigration = await readLegacySources()
    const targetsBeforeMigration = await readTargetRows()

    await expect(
      migrateLegacyOfflineData(userOne, deviceId, 1),
    ).rejects.toMatchObject({
      code: 'LEGACY_MIGRATION_RECOVERY_REQUIRED',
      message: expect.stringMatching(/exportLegacyRecoveryData/),
    })

    expect(await readLegacySources()).toEqual(sourcesBeforeMigration)
    expect(await readTargetRows()).toEqual(targetsBeforeMigration)
    expect(JSON.stringify(await exportLegacyRecoveryData(userOne))).toContain(
      'future_nested_field',
    )
  })

  it.each([
    ['Date', () => new Date('2026-08-08T10:00:00.000Z')],
    ['Map', () => new Map([['key', 'value']])],
    ['Set', () => new Set(['value'])],
    ['ArrayBuffer', () => Uint8Array.from([1, 2, 3]).buffer],
    ['typed array', () => new Uint8Array(0)],
    ['undefined', () => undefined],
    ['NaN', () => Number.NaN],
    ['negative zero', () => -0],
    ['circular object', () => {
      const value: Record<string, unknown> = {}
      value.self = value
      return value
    }],
  ])('detects a completed source rewrite from an ordinary object to %s', async (_case, createPayload) => {
    const baseMutation = {
      id: 'structured-clone-fingerprint',
      userId: userOne,
      entity: 'bean',
      action: 'update',
      entityId: cloudBeanId,
      payload: {},
      createdAt: fixedTime,
      attempts: 0,
      lastError: null,
    }
    await seedVersionTwoDatabase([
      ['beans', legacySnapshot(userOne, [
        legacyBean(userOne, cloudBeanId, 'structured clone baseline'),
      ])],
    ], [baseMutation])
    await migrateLegacyOfflineData(userOne, deviceId, 1)
    await putLegacyPendingMutation({
      ...baseMutation,
      payload: createPayload(),
    })
    const sourcesBeforeRetry = await readLegacySources()
    const targetsBeforeRetry = await readTargetRows()

    await expect(
      migrateLegacyOfflineData(userOne, deviceId, 999),
    ).rejects.toMatchObject({
      code: 'LEGACY_MIGRATION_SOURCE_CHANGED',
      message: expect.stringMatching(/exportLegacyRecoveryData/),
    })

    expect(await readLegacySources()).toEqual(sourcesBeforeRetry)
    expect(await readTargetRows()).toEqual(targetsBeforeRetry)
  })

  it('fingerprints circular structured-clone source content deterministically', async () => {
    const circularAudit: Record<string, unknown> = { label: 'stable cycle' }
    circularAudit.self = circularAudit
    const snapshot = {
      ...legacySnapshot(userOne, [
        legacyBean(userOne, cloudBeanId, 'circular fingerprint baseline'),
      ]),
      audit: circularAudit,
    }
    await seedVersionTwoDatabase([
      ['beans', snapshot],
    ], [])

    const first = await migrateLegacyOfflineData(userOne, deviceId, 1)
    const targetsAfterFirst = await readTargetRows()
    const repeated = await migrateLegacyOfflineData(userOne, deviceId, 999)

    expect(repeated).toEqual(first)
    expect(await readTargetRows()).toEqual(targetsAfterFirst)
  })

  it.each([
    ['append', 'appended-fingerprint-mutation'],
    ['rewrite', 'fingerprint-base-mutation'],
    ['delete', 'fingerprint-base-mutation'],
  ])('rejects a completed migration after a legacy source %s', async (change, changedId) => {
    const baseMutation = legacyMutation(
      'fingerprint-base-mutation',
      userOne,
      'bean',
      'update',
      cloudBeanId,
      { notes: 'original fingerprint payload' },
    )
    await seedVersionTwoDatabase([
      ['beans', legacySnapshot(userOne, [
        legacyBean(userOne, cloudBeanId, 'fingerprint baseline'),
      ])],
    ], [baseMutation])
    await migrateLegacyOfflineData(userOne, deviceId, 1)

    if (change === 'append') {
      await putLegacyPendingMutation(legacyMutation(
        changedId,
        userOne,
        'bean',
        'delete',
        '00000000-0000-4000-8000-0000000000c5',
        undefined,
        '2026-08-08T10:00:01.000Z',
      ))
    } else if (change === 'rewrite') {
      await putLegacyPendingMutation({
        ...baseMutation,
        payload: { notes: 'rewritten fingerprint payload' },
      })
    } else {
      await deleteLegacyPendingMutation(changedId)
    }
    const sourcesBeforeRetry = await readLegacySources()
    const targetsBeforeRetry = await readTargetRows()

    await expect(
      migrateLegacyOfflineData(userOne, deviceId, 999),
    ).rejects.toMatchObject({
      code: 'LEGACY_MIGRATION_SOURCE_CHANGED',
      message: expect.stringMatching(/exportLegacyRecoveryData/),
    })

    expect(await readLegacySources()).toEqual(sourcesBeforeRetry)
    expect(await readTargetRows()).toEqual(targetsBeforeRetry)
    const recovery = await exportLegacyRecoveryData(userOne)
    if (change === 'append') {
      expect(recovery.pendingMutations).toHaveLength(2)
    } else if (change === 'rewrite') {
      expect(JSON.stringify(recovery)).toContain('rewritten fingerprint payload')
    } else {
      expect(recovery.pendingMutations).toEqual([])
    }
  })

  it.each([
    [
      'cross-user inner row',
      legacyBean(
        userTwo,
        '00000000-0000-4000-8000-0000000000c6',
        'cross-user source change secret',
      ),
    ],
    ['malformed inner row', { malformed: true, secret: 'malformed source change secret' }],
  ])('detects a completed migration source change from an appended %s', async (_case, appendedRow) => {
    const baseline = legacyBean(userOne, cloudBeanId, 'inner source baseline')
    await seedVersionTwoDatabase([
      ['beans', legacySnapshot(userOne, [baseline])],
    ], [])
    await migrateLegacyOfflineData(userOne, deviceId, 1)
    await putLegacySnapshot('beans', legacySnapshot(userOne, [baseline, appendedRow]))
    const sourcesBeforeRetry = await readLegacySources()
    const targetsBeforeRetry = await readTargetRows()

    await expect(
      migrateLegacyOfflineData(userOne, deviceId, 999),
    ).rejects.toMatchObject({
      code: 'LEGACY_MIGRATION_SOURCE_CHANGED',
      message: expect.stringMatching(/exportLegacyRecoveryData/),
    })

    expect(await readLegacySources()).toEqual(sourcesBeforeRetry)
    expect(await readTargetRows()).toEqual(targetsBeforeRetry)
    expect(JSON.stringify(await exportLegacyRecoveryData(userOne))).not.toContain(
      (appendedRow as Record<string, unknown>).secret,
    )
  })

  it('fingerprints a current-user pending record before recovery ownership filtering', async () => {
    const baseline = legacyBean(userOne, cloudBeanId, 'pending envelope baseline')
    await seedVersionTwoDatabase([
      ['beans', legacySnapshot(userOne, [baseline])],
    ], [])
    await migrateLegacyOfflineData(userOne, deviceId, 1)
    await putLegacyPendingMutation(legacyMutation(
      'cross-user-inner-pending',
      userOne,
      'bean',
      'update',
      cloudBeanId,
      {
        user_id: userTwo,
        notes: 'cross-user pending source change secret',
      },
    ))
    const sourcesBeforeRetry = await readLegacySources()
    const targetsBeforeRetry = await readTargetRows()

    await expect(
      migrateLegacyOfflineData(userOne, deviceId, 999),
    ).rejects.toMatchObject({
      code: 'LEGACY_MIGRATION_SOURCE_CHANGED',
      message: expect.stringMatching(/exportLegacyRecoveryData/),
    })

    expect(await readLegacySources()).toEqual(sourcesBeforeRetry)
    expect(await readTargetRows()).toEqual(targetsBeforeRetry)
    expect(JSON.stringify(await exportLegacyRecoveryData(userOne))).not.toContain(
      'cross-user pending source change secret',
    )
  })

  it.each([
    ['a missing version and compacted mutation counts', undefined, 2],
    ['an older version and coincidentally equal mutation counts', 8, 3],
    ['the current version but compacted mutation counts', 9, 2],
  ])('rejects completed migration metadata with %s without changing data', async (_case, migrationVersion, migratedMutations) => {
    const bean = legacyBean(userOne, cloudBeanId, 'old migration baseline')
    const pending = [
      legacyMutation(
        'old-update-a',
        userOne,
        'bean',
        'update',
        cloudBeanId,
        { notes: 'first old edit' },
        '2026-08-08T10:00:01.000Z',
      ),
      legacyMutation(
        'old-update-b',
        userOne,
        'bean',
        'update',
        cloudBeanId,
        { name: 'second old edit' },
        '2026-08-08T10:00:02.000Z',
      ),
      legacyMutation(
        'old-delete-c',
        userOne,
        'bean',
        'delete',
        cloudBeanId,
        undefined,
        '2026-08-08T10:00:03.000Z',
      ),
    ]
    await seedVersionTwoDatabase([
      ['beans', legacySnapshot(userOne, [bean])],
    ], pending)
    const currentResult = await migrateLegacyOfflineData(userOne, deviceId, 1)
    const oldResult = structuredClone(currentResult) as unknown as Record<string, unknown>
    if (migrationVersion === undefined) {
      delete oldResult.migrationVersion
    } else {
      oldResult.migrationVersion = migrationVersion
    }
    const oldCounts = oldResult.counts as Record<string, unknown>
    oldCounts.migratedMutations = migratedMutations
    const metaKey = entityKey(userOne, 'legacyMigration')
    await putEnvelope('migrationMeta', {
      key: metaKey,
      userId: userOne,
      value: oldResult,
    })
    const sourcesBeforeRetry = await readLegacySources()
    const targetsBeforeRetry = await readTargetRows()

    await expect(
      migrateLegacyOfflineData(userOne, deviceId, 999),
    ).rejects.toMatchObject({
      code: 'LEGACY_MIGRATION_UPGRADE_REQUIRED',
      message: expect.stringMatching(/exportLegacyRecoveryData/),
    })

    expect(await readLegacySources()).toEqual(sourcesBeforeRetry)
    expect(await readTargetRows()).toEqual(targetsBeforeRetry)
    const recovery = await exportLegacyRecoveryData(userOne)
    expect(recovery.pendingMutations).toEqual(expect.arrayContaining(pending))
    expect(recovery.pendingMutations).toHaveLength(3)
  })

  it.each([
    [
      'local bean row',
      'local-bean-orphaned-snapshot',
      [['beans', legacySnapshot(userOne, [
        legacyBean(userOne, 'local-bean-orphaned-snapshot', 'orphaned bean'),
      ])]] as LegacySnapshotEntry[],
    ],
    [
      'local brew row',
      'local-brew-orphaned-snapshot',
      [['brewLogs', legacySnapshot(userOne, [
        legacyBrew(userOne, 'local-brew-orphaned-snapshot', cloudBeanId),
      ])]] as LegacySnapshotEntry[],
    ],
    [
      'local bean reference in a brew row',
      'local-bean-orphaned-reference',
      [['brewLogs', legacySnapshot(userOne, [
        legacyBrew(
          userOne,
          '00000000-0000-4000-8000-0000000000c3',
          'local-bean-orphaned-reference',
        ),
      ])]] as LegacySnapshotEntry[],
    ],
  ])('requires recovery for an unproven %s', async (_case, localId, snapshots) => {
    await seedVersionTwoDatabase(snapshots, [])
    const foreignTarget = currentBean(
      userTwo,
      '00000000-0000-4000-8000-0000000000f3',
      'foreign target remains',
    )
    await putEnvelope('beans', {
      key: entityKey(userTwo, foreignTarget.id),
      userId: userTwo,
      value: foreignTarget,
    })
    const sourcesBeforeMigration = await readLegacySources()
    const targetsBeforeMigration = await readTargetRows()

    await expect(
      migrateLegacyOfflineData(userOne, deviceId, 1),
    ).rejects.toMatchObject({
      code: 'LEGACY_MIGRATION_RECOVERY_REQUIRED',
      message: expect.stringMatching(/exportLegacyRecoveryData/),
    })

    expect(await readLegacySources()).toEqual(sourcesBeforeMigration)
    expect(await readTargetRows()).toEqual(targetsBeforeMigration)
    const recovery = await exportLegacyRecoveryData(userOne)
    expect(JSON.stringify(recovery)).toContain(localId)
  })

  it('retries entity and mutation UUID collisions without overwriting existing data', async () => {
    const localCollisionId = 'local-bean-collision-source'
    const mappedEntityId = '00000000-0000-4000-8000-0000000000a6'
    const foreignMutationId = '00000000-0000-4000-8000-0000000000d4'
    const generatedMutationId = '00000000-0000-4000-8000-0000000000a7'
    await seedVersionTwoDatabase([
      ['beans', legacySnapshot(userOne, [
        legacyBean(userOne, cloudBeanId, 'existing UUID source'),
        legacyBean(userOne, localCollisionId, 'local source'),
      ])],
    ], [
      legacyMutation(
        'create-collision-source',
        userOne,
        'bean',
        'create',
        localCollisionId,
        beanCreatePayload(userOne, 'local source'),
      ),
    ])
    const foreignMutation = currentDeleteMutation(
      userTwo,
      foreignMutationId,
      '00000000-0000-4000-8000-0000000000f4',
    )
    await putEnvelope('outbox', {
      key: foreignMutationId,
      userId: userTwo,
      value: foreignMutation,
    })
    const foreignOutboxBefore = await listOutbox(userTwo)
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(cloudBeanId)
      .mockReturnValueOnce(mappedEntityId)
      .mockReturnValueOnce(foreignMutationId)
      .mockReturnValueOnce(generatedMutationId)

    const result = await migrateLegacyOfflineData(userOne, deviceId, 1)

    expect(result.idMap[localCollisionId]).toBe(mappedEntityId)
    expect(
      (await listLocalEntities('beans', userOne)).map((bean) => bean.id).sort(),
    ).toEqual([cloudBeanId, mappedEntityId].sort())
    expect((await listOutbox(userOne)).map((mutation) => mutation.mutationId)).toEqual([
      generatedMutationId,
    ])
    expect(await listOutbox(userTwo)).toEqual(foreignOutboxBefore)
  })

  it('rolls back when permanent entity UUID collisions exhaust the retry limit', async () => {
    const localCollisionId = 'local-bean-permanent-collision'
    await seedVersionTwoDatabase([
      ['beans', legacySnapshot(userOne, [
        legacyBean(userOne, cloudBeanId, 'reserved cloud UUID'),
        legacyBean(userOne, localCollisionId, 'cannot allocate'),
      ])],
    ], [
      legacyMutation(
        'create-permanent-collision',
        userOne,
        'bean',
        'create',
        localCollisionId,
        beanCreatePayload(userOne, 'cannot allocate'),
      ),
    ])
    const sourcesBeforeMigration = await readLegacySources()
    const targetsBeforeMigration = await readTargetRows()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(cloudBeanId)

    await expect(
      migrateLegacyOfflineData(userOne, deviceId, 1),
    ).rejects.toThrow(/unique entity id/i)

    expect(await readLegacySources()).toEqual(sourcesBeforeMigration)
    expect(await readTargetRows()).toEqual(targetsBeforeMigration)
  })

  it('rolls back when global Outbox UUID collisions exhaust the retry limit', async () => {
    const foreignMutationId = '00000000-0000-4000-8000-0000000000d5'
    await seedVersionTwoDatabase([
      ['beans', legacySnapshot(userOne, [
        legacyBean(userOne, cloudBeanId, 'cloud source'),
      ])],
    ], [
      legacyMutation(
        'update-with-colliding-mutation-id',
        userOne,
        'bean',
        'update',
        cloudBeanId,
        { notes: 'pending edit' },
      ),
    ])
    const foreignMutation = currentDeleteMutation(
      userTwo,
      foreignMutationId,
      '00000000-0000-4000-8000-0000000000f5',
    )
    await putEnvelope('outbox', {
      key: foreignMutationId,
      userId: userTwo,
      value: foreignMutation,
    })
    const sourcesBeforeMigration = await readLegacySources()
    const targetsBeforeMigration = await readTargetRows()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(foreignMutationId)

    await expect(
      migrateLegacyOfflineData(userOne, deviceId, 1),
    ).rejects.toThrow(/unique mutation id/i)

    expect(await readLegacySources()).toEqual(sourcesBeforeMigration)
    expect(await readTargetRows()).toEqual(targetsBeforeMigration)
  })

  it('retries UUID collisions so every legacy local id gets a distinct permanent id', async () => {
    const firstId = '00000000-0000-4000-8000-0000000000a1'
    const secondId = '00000000-0000-4000-8000-0000000000a2'
    const firstMutationId = '00000000-0000-4000-8000-0000000000b1'
    const secondMutationId = '00000000-0000-4000-8000-0000000000b2'
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(firstId)
      .mockReturnValueOnce(firstId)
      .mockReturnValueOnce(secondId)
      .mockReturnValueOnce(firstMutationId)
      .mockReturnValueOnce(secondMutationId)
    await seedVersionTwoDatabase([
      ['beans', legacySnapshot(userOne, [
        legacyBean(userOne, 'local-bean-first', 'first'),
        legacyBean(userOne, 'local-bean-second', 'second'),
      ])],
    ], [
      legacyMutation('create-first', userOne, 'bean', 'create', 'local-bean-first', beanCreatePayload(userOne, 'first')),
      legacyMutation('create-second', userOne, 'bean', 'create', 'local-bean-second', beanCreatePayload(userOne, 'second')),
    ])

    const result = await migrateLegacyOfflineData(userOne, deviceId, 1)

    expect(new Set(Object.values(result.idMap))).toEqual(new Set([firstId, secondId]))
    expect(await listLocalEntities('beans', userOne)).toHaveLength(2)
  })

  it('aborts all v3 writes on a validation failure while preserving every legacy row', async () => {
    const valid = legacyBean(userOne, localBeanId, 'valid first')
    const invalid = legacyBean(userOne, 'local-bean-invalid', '')
    await seedVersionTwoDatabase([
      ['beans', legacySnapshot(userOne, [valid, invalid])],
    ], [
      legacyMutation('create-valid', userOne, 'bean', 'create', localBeanId, beanCreatePayload(userOne, 'valid first')),
      legacyMutation('create-invalid', userOne, 'bean', 'create', 'local-bean-invalid', beanCreatePayload(userOne, '')),
    ])
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
    const ownBean = legacyBean(userOne, localBeanId, 'recover me')
    const crossUserBean = {
      ...legacyBean(userTwo, 'local-bean-cross-user-secret', 'must not export'),
      secret: 'cross-user snapshot secret',
    }
    const ownSnapshot = legacySnapshot(userOne, [ownBean, crossUserBean])
    const foreignSnapshot = legacySnapshot(userTwo, [legacyBrew(userTwo, 'local-brew-secret', null)])
    const ownMutation = legacyMutation('own-recovery', userOne, 'bean', 'delete', cloudBeanId)
    const ownUpdateWithoutPayloadOwner = legacyMutation(
      'own-ownerless-update',
      userOne,
      'bean',
      'update',
      cloudBeanId,
      { notes: 'recover ownerless update' },
    )
    const crossUserPayload = legacyMutation(
      'cross-user-payload',
      userOne,
      'bean',
      'create',
      localBeanId,
      { user_id: userTwo, secret: 'cross-user payload secret' },
    )
    const foreignMutation = legacyMutation('foreign-recovery', userTwo, 'bean', 'delete', '00000000-0000-4000-8000-000000000099', { secret: 'do not export' })
    await seedVersionTwoDatabase([
      ['beans', ownSnapshot],
      ['brewLogs', foreignSnapshot],
    ], [
      ownMutation,
      ownUpdateWithoutPayloadOwner,
      crossUserPayload,
      foreignMutation,
    ])
    const before = await readLegacySourcesUnversioned()

    const exported = await exportLegacyRecoveryData(userOne)

    expect(exported.userId).toBe(userOne)
    expect(exported.exportedAt).toMatch(canonicalTimePattern)
    expect(exported.snapshots).toEqual([
      {
        key: 'beans',
        value: { ...ownSnapshot, rows: [ownBean] },
      },
    ])
    expect(exported.pendingMutations).toHaveLength(2)
    expect(exported.pendingMutations).toEqual(
      expect.arrayContaining([ownMutation, ownUpdateWithoutPayloadOwner]),
    )
    expect(JSON.stringify(exported)).not.toContain('do not export')
    expect(JSON.stringify(exported)).not.toContain('local-brew-secret')
    expect(JSON.stringify(exported)).not.toContain('cross-user snapshot secret')
    expect(JSON.stringify(exported)).not.toContain('cross-user payload secret')
    expect(await readLegacySourcesUnversioned()).toEqual(before)
  })
})

type LegacySnapshotEntry = [key: 'beans' | 'brewLogs', value: unknown]

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const canonicalTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

function legacySnapshot(userId: string, rows: unknown[], updatedAt = fixedTime) {
  return { userId, updatedAt, rows }
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

function currentDeleteMutation(
  userId: string,
  mutationId: string,
  entityId: string,
) {
  return {
    mutationId,
    deviceId,
    entityType: 'bean' as const,
    entityId,
    userId,
    operation: 'delete' as const,
    payload: {},
    baseSyncEpoch: 1,
    queuedAt: fixedTime,
    attemptCount: 0,
    status: 'pending' as const,
    lastErrorCode: null,
    lastErrorMessage: null,
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
    schema_version: 1,
  }
}

function beanCreatePayload(userId: string, name: string): BeanInsertPayload {
  return {
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
    bean_type: 'single_origin',
    blend_components: [],
    blend_notes: null,
    notes: null,
  }
}

function brewCreatePayload(userId: string, beanId: string): BrewLogInsertPayload {
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

function blendComponent() {
  return {
    origin: 'Ethiopia',
    process: 'washed',
    variety: 'Heirloom',
    percentage: 100,
    role: 'base',
    notes: '',
  }
}

function rawLegacyMutation(
  id: string,
  entity: 'bean' | 'brewLog',
  action: 'create' | 'update',
  entityId: string,
  payload: BeanInsertPayload | BeanUpdatePayload | BrewLogInsertPayload | BrewLogUpdatePayload,
) {
  return {
    id,
    userId: userOne,
    entity,
    action,
    entityId,
    payload,
    createdAt: fixedTime,
    attempts: 0,
    lastError: null,
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
  const versionedPayload =
    action !== 'delete' &&
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload)
      ? { schema_version: 1, ...payload as Record<string, unknown> }
      : payload
  return {
    id,
    userId,
    entity,
    action,
    entityId,
    ...(versionedPayload === undefined ? {} : { payload: versionedPayload }),
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

async function putLegacyPendingMutation(mutation: unknown) {
  await mutateLegacyPendingStore((store) => store.put(mutation))
}

async function putLegacySnapshot(key: 'beans' | 'brewLogs', value: unknown) {
  const database = await openSyncDatabase()
  try {
    await transactionComplete(
      database.transaction('snapshots', 'readwrite'),
      (transaction) => {
        transaction.objectStore('snapshots').put(value, key)
      },
    )
  } finally {
    database.close()
  }
}

async function deleteLegacyPendingMutation(mutationId: string) {
  await mutateLegacyPendingStore((store) => store.delete(mutationId))
}

async function mutateLegacyPendingStore(
  mutate: (store: IDBObjectStore) => IDBRequest,
) {
  const database = await openSyncDatabase()
  try {
    await transactionComplete(
      database.transaction('pendingMutations', 'readwrite'),
      (transaction) => {
        mutate(transaction.objectStore('pendingMutations'))
      },
    )
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
