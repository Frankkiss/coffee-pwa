import { describe, expect, it } from 'vitest'
import {
  createDeletePayload,
  type OutboxStatus,
  type SyncMutation,
} from './syncTypes'
import {
  compactMutations,
  deriveSyncState,
  isRetryableSyncError,
  nextRetryDelayMs,
  orderMutations,
  selectSendableMutationBatch,
  selectSendableMutations,
} from './outboxModel'

type MutationOverrides = {
  userId?: string
  entityId?: string
  entityType?: SyncMutation['entityType']
  operation?: SyncMutation['operation']
  payload?: unknown
  queuedAt?: string
  status?: OutboxStatus
  lastErrorCode?: string | null
  lastErrorMessage?: string | null
}

function mutation(
  mutationId: string,
  overrides: MutationOverrides = {},
): SyncMutation {
  const operation = overrides.operation ?? 'upsert'
  const entityType = overrides.entityType ?? 'bean'
  const payload =
    operation === 'delete'
      ? createDeletePayload()
      : { name: mutationId, schema_version: 1 }

  return {
    mutationId,
    deviceId: 'device-1',
    entityId: 'entity-1',
    entityType,
    operation,
    payload,
    userId: 'user-1',
    baseSyncEpoch: 1,
    queuedAt: '2026-08-08T10:00:00.000000Z',
    attemptCount: 0,
    status: 'pending',
    lastErrorCode: null,
    lastErrorMessage: null,
    ...overrides,
  } as unknown as SyncMutation
}

describe('compactMutations', () => {
  it('keeps the latest complete upsert for one user and entity', () => {
    const first = mutation('mutation-1')
    const latest = mutation('mutation-2', {
      payload: { name: 'latest', schema_version: 2 },
    })

    expect(compactMutations([first, latest])).toEqual([
      expect.objectContaining({
        mutationId: 'mutation-2',
        operation: 'upsert',
        payload: latest.payload,
      }),
    ])
  })

  it('conservatively keeps the latest upsert before a final delete', () => {
    const first = mutation('mutation-1')
    const latest = mutation('mutation-2', {
      payload: { name: 'latest', schema_version: 2 },
    })
    const deleted = mutation('mutation-3', { operation: 'delete' })

    expect(
      compactMutations([first, latest, deleted]).map((item) => ({
        mutationId: item.mutationId,
        operation: item.operation,
      })),
    ).toEqual([
      { mutationId: 'mutation-2', operation: 'upsert' },
      { mutationId: 'mutation-3', operation: 'delete' },
    ])
  })

  it('reduces delete then upsert to the final upsert and deletes to the last delete', () => {
    const deletedFirst = mutation('mutation-1', { operation: 'delete' })
    const restored = mutation('mutation-2')
    const deletedAgain = mutation('mutation-3', { operation: 'delete' })
    const finalDelete = mutation('mutation-4', { operation: 'delete' })

    expect(compactMutations([deletedFirst, restored])).toEqual([
      expect.objectContaining({ mutationId: 'mutation-2', operation: 'upsert' }),
    ])
    expect(compactMutations([deletedAgain, finalDelete])).toEqual([
      expect.objectContaining({ mutationId: 'mutation-4', operation: 'delete' }),
    ])
  })

  it('never compacts mutations across users', () => {
    const userOne = mutation('mutation-user-1', { userId: 'user-1' })
    const userTwo = mutation('mutation-user-2', { userId: 'user-2' })

    expect(compactMutations([userOne, userTwo]).map((item) => item.mutationId))
      .toEqual(['mutation-user-1', 'mutation-user-2'])
  })

  it('preserves attention and syncing boundaries without selecting them for upload', () => {
    const pending = mutation('mutation-pending', { entityId: 'entity-safe' })
    const attention = mutation('mutation-attention', {
      status: 'needs_attention',
      lastErrorCode: 'VALIDATION_ERROR',
      lastErrorMessage: 'Invalid bean',
    })
    const syncing = mutation('mutation-syncing', {
      entityId: 'entity-2',
      status: 'syncing',
    })

    expect(compactMutations([pending, attention, syncing])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mutationId: 'mutation-attention' }),
      ]),
    )
    expect(
      selectSendableMutations([pending, attention, syncing]).map(
        (item) => item.mutationId,
      ),
    ).toEqual(['mutation-pending'])
  })

  it('does not compact pending runs across attention or syncing boundaries', () => {
    const firstPending = mutation('pending-1')
    const attention = mutation('attention', { status: 'needs_attention' })
    const secondPending = mutation('pending-2')
    const syncing = mutation('syncing', { status: 'syncing' })
    const thirdPending = mutation('pending-3')

    expect(
      compactMutations([
        firstPending,
        attention,
        secondPending,
        syncing,
        thirdPending,
      ]).map((item) => item.mutationId),
    ).toEqual([
      'pending-1',
      'attention',
      'pending-2',
      'syncing',
      'pending-3',
    ])
  })

  it.each(['syncing', 'needs_attention'] as const)(
    'treats an unrelated %s mutation as a global compaction barrier',
    (status) => {
      const firstA = mutation('first-a', { entityId: 'entity-a' })
      const firstB = mutation('first-b', { entityId: 'entity-b' })
      const barrier = mutation('barrier', {
        entityId: 'entity-barrier',
        status,
      })
      const latestA = mutation('latest-a', { entityId: 'entity-a' })
      const latestB = mutation('latest-b', { entityId: 'entity-b' })

      expect(
        compactMutations([
          firstA,
          firstB,
          barrier,
          latestA,
          latestB,
        ]).map((item) => item.mutationId),
      ).toEqual(['first-a', 'first-b', 'barrier', 'latest-a', 'latest-b'])
    },
  )

  it('returns every source mutation id covered by each selected operation', () => {
    const first = mutation('mutation-1')
    const latest = mutation('mutation-2')
    const deleted = mutation('mutation-3', { operation: 'delete' })

    expect(selectSendableMutationBatch([first, latest, deleted])).toEqual([
      {
        mutation: expect.objectContaining({ mutationId: 'mutation-2' }),
        coveredMutationIds: ['mutation-1', 'mutation-2'],
      },
      {
        mutation: expect.objectContaining({ mutationId: 'mutation-3' }),
        coveredMutationIds: ['mutation-3'],
      },
    ])
  })

  it('blocks pending work that directly or transitively depends on attention', () => {
    const attentionEntity = mutation('attention-entity', {
      entityId: 'entity-attention',
      status: 'needs_attention',
    })
    const sameEntityPending = mutation('same-entity-pending', {
      entityId: 'entity-attention',
    })
    const attentionBean = mutation('attention-bean', {
      entityId: 'bean-attention',
      status: 'needs_attention',
    })
    const dependentBrew = mutation('dependent-brew', {
      entityId: 'brew-dependent',
      entityType: 'brewLog',
      payload: { bean_id: 'bean-attention', schema_version: 1 },
    })
    const downstreamBrew = mutation('downstream-brew', {
      entityId: 'brew-dependent',
      entityType: 'brewLog',
      payload: { bean_id: 'bean-attention', schema_version: 1 },
    })
    const attentionBrew = mutation('attention-brew', {
      entityId: 'brew-attention',
      entityType: 'brewLog',
      payload: { bean_id: 'bean-delete', schema_version: 1 },
      status: 'needs_attention',
    })
    const dependentBeanDelete = mutation('dependent-bean-delete', {
      entityId: 'bean-delete',
      operation: 'delete',
    })
    const independent = mutation('independent', { entityId: 'safe-bean' })

    expect(
      selectSendableMutations([
        attentionEntity,
        sameEntityPending,
        attentionBean,
        dependentBrew,
        downstreamBrew,
        attentionBrew,
        dependentBeanDelete,
        independent,
      ]).map((item) => item.mutationId),
    ).toEqual(['independent'])
  })

  it('does not create a reverse cycle for an early delete followed by bean recovery and brew', () => {
    const earlyDelete = mutation('early-delete', {
      entityId: 'bean-recovered',
      operation: 'delete',
      queuedAt: '2026-08-08T10:00:00.000001Z',
    })
    const barrier = mutation('barrier', {
      entityId: 'unrelated-attention',
      status: 'needs_attention',
      queuedAt: '2026-08-08T10:00:00.000002Z',
    })
    const recoveredBean = mutation('recovered-bean', {
      entityId: 'bean-recovered',
      queuedAt: '2026-08-08T10:00:00.000003Z',
    })
    const brew = mutation('brew-after-recovery', {
      entityId: 'brew-after-recovery',
      entityType: 'brewLog',
      payload: { bean_id: 'bean-recovered', schema_version: 1 },
      queuedAt: '2026-08-08T10:00:00.000004Z',
    })
    const unrelated = mutation('unrelated', {
      entityId: 'unrelated-bean',
      queuedAt: '2026-08-08T10:00:00.000005Z',
    })

    expect(() =>
      selectSendableMutations([
        earlyDelete,
        barrier,
        recoveredBean,
        brew,
        unrelated,
      ]),
    ).not.toThrow()
    expect(
      selectSendableMutations([
        earlyDelete,
        barrier,
        recoveredBean,
        brew,
        unrelated,
      ]).map((item) => item.mutationId),
    ).toEqual([
      'early-delete',
      'recovered-bean',
      'brew-after-recovery',
      'unrelated',
    ])
  })

  it('keeps an early brew before delete and later bean recovery without a cycle', () => {
    const earlyBrew = mutation('early-brew', {
      entityId: 'brew-before-delete',
      entityType: 'brewLog',
      payload: { bean_id: 'bean-recovered-later', schema_version: 1 },
      queuedAt: '2026-08-08T10:00:00.000001Z',
    })
    const beanDelete = mutation('bean-delete', {
      entityId: 'bean-recovered-later',
      operation: 'delete',
      queuedAt: '2026-08-08T10:00:00.000002Z',
    })
    const barrier = mutation('barrier', {
      entityId: 'unrelated-attention-2',
      status: 'needs_attention',
      queuedAt: '2026-08-08T10:00:00.000003Z',
    })
    const laterRecovery = mutation('later-recovery', {
      entityId: 'bean-recovered-later',
      queuedAt: '2026-08-08T10:00:00.000004Z',
    })
    const unrelated = mutation('unrelated-after-recovery', {
      entityId: 'another-bean',
      queuedAt: '2026-08-08T10:00:00.000005Z',
    })

    expect(() =>
      selectSendableMutations([
        earlyBrew,
        beanDelete,
        barrier,
        laterRecovery,
        unrelated,
      ]),
    ).not.toThrow()
    expect(
      selectSendableMutations([
        earlyBrew,
        beanDelete,
        barrier,
        laterRecovery,
        unrelated,
      ]).map((item) => item.mutationId),
    ).toEqual([
      'early-brew',
      'bean-delete',
      'later-recovery',
      'unrelated-after-recovery',
    ])
  })

  it('does not mutate inputs or share mutable payloads with its result', () => {
    const input = mutation('mutation-1', {
      payload: { name: 'original', tags: ['cocoa'], schema_version: 1 },
    })
    const before = structuredClone(input)

    const [compacted] = compactMutations([input])
    const outputPayload = compacted.payload as unknown as {
      name: string
      tags: string[]
    }
    outputPayload.name = 'changed'
    outputPayload.tags.push('orange')

    expect(input).toEqual(before)
  })
})

describe('orderMutations', () => {
  it('orders sendable work by dependency priority', () => {
    const brew = mutation('brew', { entityType: 'brewLog' })
    const settings = mutation('settings', {
      entityId: 'settings',
      entityType: 'userSettings',
    })
    const template = mutation('template', {
      entityId: 'template',
      entityType: 'brewTemplate',
    })
    const bean = mutation('bean')

    expect(
      orderMutations([brew, settings, template, bean]).map(
        (item) => item.entityType,
      ),
    ).toEqual(['bean', 'userSettings', 'brewTemplate', 'brewLog'])
  })

  it('preserves same-entity causal order even when timestamps would reverse it', () => {
    const upsert = mutation('z-upsert', {
      queuedAt: '2026-08-08T10:00:01Z',
    })
    const deleted = mutation('a-delete', {
      operation: 'delete',
      queuedAt: '2026-08-08T10:00:00Z',
    })

    expect(orderMutations([upsert, deleted]).map((item) => item.mutationId))
      .toEqual(['z-upsert', 'a-delete'])
  })

  it('does not let another entity create a comparator cycle that reverses operations', () => {
    const upsert = mutation('same-upsert', {
      queuedAt: '2026-08-08T10:00:03Z',
    })
    const otherEntity = mutation('other', {
      entityId: 'entity-2',
      queuedAt: '2026-08-08T10:00:02Z',
    })
    const deleted = mutation('same-delete', {
      operation: 'delete',
      queuedAt: '2026-08-08T10:00:01Z',
    })

    const orderedIds = orderMutations([upsert, otherEntity, deleted]).map(
      (item) => item.mutationId,
    )
    expect(orderedIds.indexOf('same-upsert')).toBeLessThan(
      orderedIds.indexOf('same-delete'),
    )
  })

  it('keeps unrelated mutations in precise time order between same-entity operations', () => {
    const upsert = mutation('same-upsert', {
      queuedAt: '2026-08-08T10:00:00.000001Z',
    })
    const unrelated = mutation('unrelated', {
      entityId: 'entity-2',
      queuedAt: '2026-08-08T10:00:00.000002Z',
    })
    const deleted = mutation('same-delete', {
      operation: 'delete',
      queuedAt: '2026-08-08T10:00:00.000003Z',
    })

    expect(
      orderMutations([upsert, unrelated, deleted]).map(
        (item) => item.mutationId,
      ),
    ).toEqual(['same-upsert', 'unrelated', 'same-delete'])
  })

  it('adds only real bean-to-brew dependencies over the base time order', () => {
    const referencedBean = mutation('referenced-bean', {
      entityId: 'bean-referenced',
      queuedAt: '2026-08-08T10:00:00.000003Z',
    })
    const dependentBrew = mutation('dependent-brew', {
      entityId: 'brew-dependent',
      entityType: 'brewLog',
      payload: { bean_id: 'bean-referenced', schema_version: 1 },
      queuedAt: '2026-08-08T10:00:00.000001Z',
    })
    const unrelatedBean = mutation('unrelated-bean', {
      entityId: 'bean-unrelated',
      queuedAt: '2026-08-08T10:00:00.000004Z',
    })
    const unrelatedBrew = mutation('unrelated-brew', {
      entityId: 'brew-unrelated',
      entityType: 'brewLog',
      payload: { bean_id: 'bean-other', schema_version: 1 },
      queuedAt: '2026-08-08T10:00:00.000002Z',
    })

    expect(
      orderMutations([
        referencedBean,
        dependentBrew,
        unrelatedBrew,
        unrelatedBean,
      ]).map((item) => item.mutationId),
    ).toEqual([
      'unrelated-brew',
      'referenced-bean',
      'dependent-brew',
      'unrelated-bean',
    ])
  })

  it('compares RFC 3339 fractional seconds without losing microseconds', () => {
    const later = mutation('a-later', {
      entityId: 'entity-later',
      queuedAt: '2026-08-08T10:00:00.000002Z',
    })
    const earlier = mutation('z-earlier', {
      entityId: 'entity-earlier',
      queuedAt: '2026-08-08T10:00:00.000001Z',
    })

    expect(orderMutations([later, earlier]).map((item) => item.mutationId))
      .toEqual(['z-earlier', 'a-later'])
  })

  it('keeps user partitions stable and retains attention rows while ordering', () => {
    const userTwoBrew = mutation('user-2-brew', {
      userId: 'user-2',
      entityType: 'brewLog',
    })
    const attention = mutation('attention', {
      entityId: 'attention',
      status: 'needs_attention',
    })
    const userOneBrew = mutation('user-1-brew', {
      userId: 'user-1',
      entityType: 'brewLog',
    })
    const userTwoBean = mutation('user-2-bean', { userId: 'user-2' })
    const userOneBean = mutation('user-1-bean', { userId: 'user-1' })

    expect(
      orderMutations([
        userTwoBrew,
        attention,
        userOneBrew,
        userTwoBean,
        userOneBean,
      ]).map((item) => item.mutationId),
    ).toEqual([
      'user-2-bean',
      'user-2-brew',
      'attention',
      'user-1-bean',
      'user-1-brew',
    ])
  })

  it('preserves same-entity order across syncing and attention boundaries', () => {
    const pendingBeforeSync = mutation('a-pending-before-sync', {
      queuedAt: '2026-08-08T10:00:03Z',
    })
    const syncing = mutation('a-syncing', {
      status: 'syncing',
      queuedAt: '2026-08-08T10:00:02Z',
    })
    const unrelated = mutation('b-unrelated', {
      entityId: 'entity-2',
      queuedAt: '2026-08-08T10:00:01Z',
    })
    const attention = mutation('a-attention', {
      status: 'needs_attention',
      queuedAt: '2026-08-08T10:00:00Z',
    })

    const orderedIds = orderMutations([
      pendingBeforeSync,
      syncing,
      unrelated,
      attention,
    ]).map((item) => item.mutationId)
    expect(orderedIds.indexOf('a-pending-before-sync')).toBeLessThan(
      orderedIds.indexOf('a-syncing'),
    )
    expect(orderedIds.indexOf('a-syncing')).toBeLessThan(
      orderedIds.indexOf('a-attention'),
    )
  })

  it('orders a referencing brew before deleting its bean', () => {
    const beanUpsert = mutation('bean-upsert', {
      entityId: 'bean-1',
      queuedAt: '2026-08-08T10:00:03Z',
    })
    const brewUpsert = mutation('brew-upsert', {
      entityId: 'brew-1',
      entityType: 'brewLog',
      payload: { bean_id: 'bean-1', schema_version: 1 },
      queuedAt: '2026-08-08T10:00:02Z',
    })
    const beanDelete = mutation('bean-delete', {
      entityId: 'bean-1',
      operation: 'delete',
      queuedAt: '2026-08-08T10:00:01Z',
    })

    expect(
      orderMutations([beanUpsert, brewUpsert, beanDelete]).map(
        (item) => item.mutationId,
      ),
    ).toEqual(['bean-upsert', 'brew-upsert', 'bean-delete'])
  })
})

describe('retry policy', () => {
  it('uses capped exponential delay and clamps abnormal attempts safely', () => {
    expect(nextRetryDelayMs(1)).toBe(1000)
    expect(nextRetryDelayMs(8)).toBe(60000)
    expect(nextRetryDelayMs(0)).toBe(1000)
    expect(nextRetryDelayMs(Number.NaN)).toBe(1000)
    expect(nextRetryDelayMs(Number.POSITIVE_INFINITY)).toBe(60000)
  })

  it('retries explicit retryable and common transient network errors', () => {
    expect(isRetryableSyncError({ retryable: true })).toBe(true)
    expect(
      isRetryableSyncError({
        retryable: true,
        status: 503,
        message: 'AUTH validation failed',
      }),
    ).toBe(true)
    expect(
      isRetryableSyncError({ status: 503, message: 'AUTH validation failed' }),
    ).toBe(true)
    expect(isRetryableSyncError({ code: 'ETIMEDOUT' })).toBe(true)
    expect(isRetryableSyncError({ status: 503 })).toBe(true)
    expect(isRetryableSyncError(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('does not retry validation, auth, stale, corruption, or unknown errors', () => {
    expect(
      isRetryableSyncError({
        retryable: false,
        status: 503,
        message: 'Failed to fetch',
      }),
    ).toBe(false)
    expect(isRetryableSyncError({ code: 'VALIDATION_ERROR' })).toBe(false)
    expect(isRetryableSyncError({ status: 401 })).toBe(false)
    expect(
      isRetryableSyncError({ status: 401, message: 'Failed to fetch' }),
    ).toBe(false)
    expect(isRetryableSyncError({ status: 403, code: 'ETIMEDOUT' })).toBe(
      false,
    )
    expect(isRetryableSyncError({ code: 'STALE_SYNC_EPOCH' })).toBe(false)
    expect(isRetryableSyncError({ code: 'LOCAL_DATA_CORRUPTION' })).toBe(false)
    expect(isRetryableSyncError({ status: Number.POSITIVE_INFINITY })).toBe(false)
    expect(isRetryableSyncError({ status: 600 })).toBe(false)
    expect(isRetryableSyncError(new Error('Something went wrong'))).toBe(false)
  })
})

describe('deriveSyncState', () => {
  const syncedAt = '2026-08-08T10:00:00Z'

  it('prioritizes attention, then running, offline, and retrying', () => {
    const pending = mutation('pending')
    const attention = mutation('attention', {
      entityId: 'attention',
      status: 'needs_attention',
    })

    expect(
      deriveSyncState({
        online: false,
        running: true,
        mutations: [pending, attention],
        lastSyncedAt: syncedAt,
        retryMessage: 'retry',
      }),
    ).toEqual({ kind: 'needs_attention', pendingCount: 1, attentionCount: 1 })
    expect(
      deriveSyncState({
        online: false,
        running: true,
        mutations: [pending],
        lastSyncedAt: syncedAt,
        retryMessage: 'retry',
      }),
    ).toEqual({ kind: 'syncing', pendingCount: 1 })
    expect(
      deriveSyncState({
        online: false,
        running: false,
        mutations: [pending],
        lastSyncedAt: syncedAt,
        retryMessage: 'retry',
      }),
    ).toEqual({ kind: 'offline', pendingCount: 1 })
    expect(
      deriveSyncState({
        online: true,
        running: false,
        mutations: [pending],
        lastSyncedAt: syncedAt,
        retryMessage: 'retry',
      }),
    ).toEqual({ kind: 'retrying', pendingCount: 1, message: 'retry' })
  })

  it('reports synced only after a successful sync timestamp exists', () => {
    expect(
      deriveSyncState({
        online: true,
        running: false,
        mutations: [],
        lastSyncedAt: syncedAt,
        retryMessage: null,
      }),
    ).toEqual({ kind: 'synced', lastSyncedAt: syncedAt })

    expect(
      deriveSyncState({
        online: true,
        running: false,
        mutations: [],
        lastSyncedAt: null,
        retryMessage: null,
      }).kind,
    ).toBe('retrying')
  })
})
