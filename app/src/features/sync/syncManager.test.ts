import { describe, expect, it, vi } from 'vitest'
import { SyncApiError } from './syncApi'
import { createSyncManager, type SyncManagerDependencies } from './syncManager'
import type { SyncLockGuard } from './syncLock'
import type { SyncMutation, SyncSnapshot, SyncStorage } from './syncTypes'

const ids = {
  user: '11111111-1111-4111-8111-111111111111',
  device: '22222222-2222-4222-8222-222222222222',
  bean: '33333333-3333-4333-8333-333333333333',
  first: '44444444-4444-4444-8444-444444444444',
  second: '55555555-5555-4555-8555-555555555555',
  brew: '66666666-6666-4666-8666-666666666666',
  brewMutation: '77777777-7777-4777-8777-777777777777',
  invalidBean: '88888888-8888-4888-8888-888888888888',
  validBean: '99999999-9999-4999-8999-999999999999',
  validMutation: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
}
const firstTime = '2026-08-09T10:00:00.000Z'
const secondTime = '2026-08-09T10:01:00.000Z'

function payload(name = 'bean') {
  return {
    name, roaster: null, origin: null, farm_or_station: null, process: null,
    variety: null, altitude_meters: null, roast_date: null, roast_level: null,
    flavor_tags: [], flavor_notes: null, net_weight_grams: null, price: null,
    purchase_date: null, source_url: null, image_url: null,
    bean_type: 'single_origin' as const, blend_components: [], blend_notes: null,
    notes: null, schema_version: 1,
  }
}

function brewPayload(beanId: string) {
  return {
    bean_id: beanId, brewed_at: firstTime, method: null, dripper: null,
    filter_paper: null, grinder: null, grind_setting: null,
    coffee_grams: null, water_grams: null, ratio: null,
    water_temperature_c: null, total_time_seconds: null, pour_steps: [],
    rating: null, acidity: null, sweetness: null, bitterness: null,
    astringency: null, body: null, aftertaste: null, flavor_tags: [],
    is_pinned_recipe: false, notes: null, schema_version: 1,
  }
}

function mutation(overrides: Partial<SyncMutation> = {}): SyncMutation {
  return {
    mutationId: ids.first, deviceId: ids.device, entityType: 'bean',
    entityId: ids.bean, operation: 'upsert', payload: payload(), userId: ids.user,
    baseSyncEpoch: 1, queuedAt: firstTime, attemptCount: 0, status: 'pending',
    lastErrorCode: null, lastErrorMessage: null, ...overrides,
  } as SyncMutation
}

function snapshot(epoch = 1): SyncSnapshot {
  return {
    syncEpoch: epoch, serverTime: secondTime,
    beans: [{ id: ids.bean, user_id: ids.user, ...payload('cloud'), created_at: firstTime, updated_at: secondTime, deleted_at: null }],
    brewLogs: [], brewTemplates: [], userSettings: null, aiRecommendations: [],
  }
}

function receipt(item: SyncMutation) {
  return {
    mutationId: item.mutationId, deviceId: item.deviceId,
    entityType: item.entityType, entityId: item.entityId,
    operation: item.operation, committedAt: secondTime,
    status: 'applied' as const,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function harness(initial: SyncMutation[] = []) {
  let outbox = [...initial]
  const storage: SyncStorage = {
    listOutbox: vi.fn(async () => structuredClone(outbox)),
    acknowledgeMutations: vi.fn(async (_user, mutationIds) => {
      outbox = outbox.filter((item) => !mutationIds.includes(item.mutationId))
    }),
    acknowledgeMutationsAndReplaceSnapshot: vi.fn(async (_user, mutationIds) => {
      outbox = outbox.filter((item) => !mutationIds.includes(item.mutationId))
    }),
    markMutationsSyncing: vi.fn(async (_user, mutationIds) => {
      outbox = outbox.map((item) => mutationIds.includes(item.mutationId) ? { ...item, status: 'syncing' } : item)
    }),
    recordRetryableFailure: vi.fn(async (_user, mutationIds, code, message) => {
      outbox = outbox.map((item) => mutationIds.includes(item.mutationId) ? { ...item, status: 'pending', lastErrorCode: code, lastErrorMessage: message } : item)
    }),
    markMutationAttention: vi.fn(async (_user, mutationIds, code, message) => {
      outbox = outbox.map((item) => mutationIds.includes(item.mutationId) ? { ...item, status: 'needs_attention', lastErrorCode: code, lastErrorMessage: message } : item)
    }),
    markMutationPending: vi.fn(async (_user, mutationId) => {
      outbox = outbox.map((item) => item.mutationId === mutationId ? { ...item, status: 'pending', lastErrorCode: null, lastErrorMessage: null } : item)
    }),
    releaseLegacyCreateChain: vi.fn(async (_user, _target, expected, epoch) => {
      outbox = outbox.map((item) => expected.includes(item.mutationId) ? { ...item, status: 'pending', baseSyncEpoch: epoch, lastErrorCode: null, lastErrorMessage: null } : item)
    }),
    discardMutationAndReplaceSnapshot: vi.fn(async (_user, target) => {
      outbox = outbox.filter((item) => item.mutationId !== target)
    }),
    quarantineOlderEpoch: vi.fn(async (_user, epoch, code, message) => {
      outbox = outbox.map((item) => item.baseSyncEpoch < epoch ? { ...item, status: 'needs_attention', lastErrorCode: code, lastErrorMessage: message } : item)
    }),
    replaceServerSnapshot: vi.fn(async () => undefined),
    readSyncEpoch: vi.fn(async () => 1),
    writeSyncMeta: vi.fn(async () => undefined),
  }
  const api = {
    applyBatch: vi.fn(async (_epoch, operations) => ({
      syncEpoch: 1, serverTime: secondTime,
      results: operations.map(receipt),
    })),
    getSnapshot: vi.fn(async () => snapshot()),
  }
  let lockHeld = true
  const lockController = new AbortController()
  const guard: SyncLockGuard = {
    signal: lockController.signal,
    assertHeld: vi.fn(async () => {
      if (!lockHeld) {
        throw Object.assign(new Error('lost'), { code: 'SYNC_LOCK_LOST' })
      }
    }),
  }
  const lock = vi.fn(async (
    _userId: string,
    action: (guard: SyncLockGuard) => Promise<void>,
  ) => action(guard))
  const timers: Array<{ id: number; callback: () => void; cancelled: boolean }> = []
  const cleanOnline = vi.fn()
  const cleanVisibility = vi.fn()
  const cleanWakeups = vi.fn()
  const callbacks: { online?: () => void; visibility?: () => void; wake?: () => void } = {}
  const subscribeOnline = vi.fn((callback: () => void) => { callbacks.online = callback; return cleanOnline })
  const subscribeVisibility = vi.fn((callback: () => void) => { callbacks.visibility = callback; return cleanVisibility })
  const subscribeWakeups = vi.fn((_userId: string, callback: () => void) => { callbacks.wake = callback; return cleanWakeups })
  let online = true
  let visible = true
  const deps: SyncManagerDependencies = {
    userId: ids.user, deviceId: ids.device, api, storage, lock,
    now: () => new Date(secondTime), online: () => online,
    schedule(callback) {
      const item = { id: timers.length + 1, callback, cancelled: false }
      timers.push(item)
      return item.id
    },
    cancelSchedule(id) { const item = timers[id - 1]; if (item) item.cancelled = true },
    events: {
      subscribeOnline,
      subscribeVisibility,
      isVisible: () => visible,
    },
    subscribeWakeups,
  }
  return { deps, api, storage, lock, timers, callbacks, cleanOnline,
    cleanVisibility, cleanWakeups, setOnline(value: boolean) { online = value },
    setVisible(value: boolean) { visible = value }, getOutbox: () => outbox,
    guard,
    setLockHeld(value: boolean) {
      lockHeld = value
      if (!value) lockController.abort()
    },
    setOutbox(value: SyncMutation[]) { outbox = value },
  }
}

describe('SyncManager cycles', () => {
  it('uploads compacted operations, marks and acknowledges every covered source ID, then pulls', async () => {
    const first = mutation()
    const second = mutation({ mutationId: ids.second, queuedAt: secondTime, payload: payload('latest') })
    const h = harness([first, second])
    h.api.applyBatch.mockResolvedValueOnce({ syncEpoch: 1, serverTime: secondTime, results: [receipt(second)] })
    const manager = createSyncManager(h.deps)

    await manager.run()

    expect(h.storage.markMutationsSyncing).toHaveBeenCalledWith(ids.user, [ids.first, ids.second])
    expect(h.api.applyBatch).toHaveBeenCalledWith(1, [{
      mutationId: ids.second, deviceId: ids.device, entityType: 'bean',
      entityId: ids.bean, operation: 'upsert', payload: payload('latest'),
    }])
    expect(h.storage.acknowledgeMutationsAndReplaceSnapshot).toHaveBeenCalledWith(
      ids.user,
      [ids.first, ids.second],
      snapshot(),
    )
    expect(h.storage.acknowledgeMutations).not.toHaveBeenCalled()
    expect(h.api.getSnapshot).toHaveBeenCalledOnce()
    expect(h.storage.replaceServerSnapshot).not.toHaveBeenCalled()
    expect(manager.getState()).toEqual({ kind: 'synced', lastSyncedAt: secondTime })
  })

  it('isolates an invalid selection, reselects dependencies, and still sends unrelated valid work', async () => {
    const invalid = mutation({
      mutationId: ids.second,
      entityId: ids.invalidBean,
      payload: { ...payload('invalid'), schema_version: 2 },
    } as Partial<SyncMutation>)
    const valid = mutation({
      mutationId: ids.validMutation,
      entityId: ids.validBean,
      payload: payload('valid'),
    })
    const dependent = mutation({
      mutationId: ids.brewMutation,
      entityId: ids.brew,
      entityType: 'brewLog',
      payload: brewPayload(ids.invalidBean),
    } as Partial<SyncMutation>)
    const h = harness([invalid, valid, dependent])
    const manager = createSyncManager(h.deps)

    await manager.run()

    expect(h.storage.markMutationAttention).toHaveBeenCalledWith(
      ids.user,
      [ids.second],
      'INVALID_SYNC_OPERATION',
      expect.any(String),
    )
    expect(h.storage.markMutationsSyncing).toHaveBeenCalledTimes(1)
    expect(h.storage.markMutationsSyncing).toHaveBeenCalledWith(
      ids.user,
      [ids.validMutation],
    )
    expect(h.api.applyBatch).toHaveBeenCalledWith(1, [{
      mutationId: ids.validMutation,
      deviceId: ids.device,
      entityType: 'bean',
      entityId: ids.validBean,
      operation: 'upsert',
      payload: payload('valid'),
    }])
    expect(h.storage.acknowledgeMutationsAndReplaceSnapshot).toHaveBeenCalledWith(
      ids.user,
      [ids.validMutation],
      snapshot(),
    )
    expect(h.getOutbox()).toEqual([
      expect.objectContaining({
        mutationId: ids.second,
        status: 'needs_attention',
        lastErrorCode: 'INVALID_SYNC_OPERATION',
      }),
      expect.objectContaining({
        mutationId: ids.brewMutation,
        status: 'pending',
      }),
    ])

    await manager.run()

    expect(h.storage.markMutationAttention).toHaveBeenCalledTimes(1)
    expect(h.storage.markMutationsSyncing).toHaveBeenCalledTimes(1)
    expect(h.api.applyBatch).toHaveBeenCalledTimes(1)
  })

  it('pulls even when the Outbox is empty', async () => {
    const h = harness()
    await createSyncManager(h.deps).run()
    expect(h.api.applyBatch).not.toHaveBeenCalled()
    expect(h.api.getSnapshot).toHaveBeenCalledOnce()
    expect(h.storage.replaceServerSnapshot).toHaveBeenCalledOnce()
  })

  it('restores interrupted syncing rows, reloads, and safely resends', async () => {
    const item = mutation({ status: 'syncing' })
    const h = harness([item])
    await createSyncManager(h.deps).run()
    expect(h.storage.markMutationPending).toHaveBeenCalledWith(ids.user, ids.first)
    expect(h.storage.listOutbox).toHaveBeenCalledTimes(2)
    expect(h.api.applyBatch).toHaveBeenCalledOnce()
  })

  it('records response-loss retry without acknowledging covered IDs', async () => {
    const h = harness([mutation()])
    h.api.applyBatch.mockRejectedValueOnce(new SyncApiError('503', 'lost', true))
    await createSyncManager(h.deps).run()
    expect(h.storage.recordRetryableFailure).toHaveBeenCalledWith(ids.user, [ids.first], '503', 'lost')
    expect(h.storage.acknowledgeMutations).not.toHaveBeenCalled()
    expect(h.api.getSnapshot).not.toHaveBeenCalled()
  })

  it('keeps validated acknowledgements when the following snapshot fails', async () => {
    const h = harness([mutation()])
    h.api.getSnapshot.mockRejectedValueOnce(new SyncApiError('503', 'pull failed', true))
    await createSyncManager(h.deps).run()
    expect(h.storage.acknowledgeMutations).toHaveBeenCalledWith(ids.user, [ids.first])
    expect(h.storage.replaceServerSnapshot).not.toHaveBeenCalled()
    expect(h.storage.recordRetryableFailure).not.toHaveBeenCalled()
  })

  it('does not acknowledge or replace on an invalid apply response', async () => {
    const h = harness([mutation()])
    h.api.applyBatch.mockRejectedValueOnce(new SyncApiError('INVALID_SYNC_RESPONSE', 'malformed', false))
    const manager = createSyncManager(h.deps)
    await manager.run()
    expect(h.storage.acknowledgeMutations).not.toHaveBeenCalled()
    expect(h.storage.replaceServerSnapshot).not.toHaveBeenCalled()
    expect(manager.getState().kind).toBe('needs_attention')
  })

  it('does not overwrite cache when a post-apply snapshot is malformed', async () => {
    const h = harness([mutation()])
    h.api.getSnapshot.mockRejectedValueOnce(new SyncApiError('INVALID_SYNC_RESPONSE', 'bad snapshot', false))
    const manager = createSyncManager(h.deps)
    await manager.run()
    expect(h.storage.acknowledgeMutations).toHaveBeenCalledOnce()
    expect(h.storage.replaceServerSnapshot).not.toHaveBeenCalled()
    expect(manager.getState().kind).toBe('needs_attention')
  })

  it('uses a fresh snapshot epoch to quarantine stale mutations before replacing cache', async () => {
    const h = harness([mutation()])
    h.api.applyBatch.mockRejectedValueOnce(new SyncApiError('STALE_SYNC_EPOCH', 'stale', false))
    h.api.getSnapshot.mockResolvedValueOnce(snapshot(4))
    await createSyncManager(h.deps).run()
    expect(h.storage.quarantineOlderEpoch).toHaveBeenCalledWith(ids.user, 4, 'STALE_SYNC_EPOCH', 'stale')
    expect(h.storage.replaceServerSnapshot).toHaveBeenCalledWith(ids.user, snapshot(4))
    expect(h.storage.acknowledgeMutations).not.toHaveBeenCalled()
  })

  it('stays offline without taking the lock or calling APIs', async () => {
    const h = harness([mutation()])
    h.setOnline(false)
    const manager = createSyncManager(h.deps)
    await manager.run()
    expect(h.lock).not.toHaveBeenCalled()
    expect(h.api.applyBatch).not.toHaveBeenCalled()
    expect(manager.getState()).toEqual({ kind: 'offline', pendingCount: 1 })
  })

  it('deduplicates concurrent run calls', async () => {
    const h = harness()
    const waiting = deferred<SyncSnapshot>()
    h.api.getSnapshot.mockReturnValueOnce(waiting.promise)
    const manager = createSyncManager(h.deps)
    const first = manager.run()
    const second = manager.run()
    expect(first).toBe(second)
    waiting.resolve(snapshot())
    await first
    expect(h.lock).toHaveBeenCalledOnce()
  })

  it('suppresses stale generation writes after stop', async () => {
    const h = harness()
    const waiting = deferred<SyncSnapshot>()
    h.api.getSnapshot.mockReturnValueOnce(waiting.promise)
    const manager = createSyncManager(h.deps)
    const running = manager.run()
    await vi.waitFor(() => expect(h.api.getSnapshot).toHaveBeenCalledOnce())
    manager.stop()
    waiting.resolve(snapshot())
    await running
    expect(h.storage.replaceServerSnapshot).not.toHaveBeenCalled()
  })

  it('stops all post-RPC writes and publications after the lease is lost', async () => {
    const h = harness([mutation()])
    const applying = deferred<Awaited<ReturnType<typeof h.api.applyBatch>>>()
    h.api.applyBatch.mockReturnValueOnce(applying.promise)
    const manager = createSyncManager(h.deps)
    const published: unknown[] = []
    manager.subscribe((next) => published.push(next))
    const running = manager.run()
    await vi.waitFor(() => expect(h.api.applyBatch).toHaveBeenCalledOnce())
    const publicationsBeforeLoss = published.length
    h.setLockHeld(false)
    applying.resolve({
      syncEpoch: 1,
      serverTime: secondTime,
      results: [receipt(mutation())],
    })
    await running

    expect(h.api.getSnapshot).not.toHaveBeenCalled()
    expect(h.storage.acknowledgeMutations).not.toHaveBeenCalled()
    expect(h.storage.replaceServerSnapshot).not.toHaveBeenCalled()
    expect(h.storage.markMutationAttention).not.toHaveBeenCalled()
    expect(h.storage.recordRetryableFailure).not.toHaveBeenCalled()
    expect(published).toHaveLength(publicationsBeforeLoss)
  })

  it('starts a new generation without waiting for an obsolete in-flight run', async () => {
    const h = harness()
    const obsolete = deferred<SyncSnapshot>()
    h.api.getSnapshot.mockReturnValueOnce(obsolete.promise)
    const manager = createSyncManager(h.deps)
    manager.start()
    await vi.waitFor(() => expect(h.api.getSnapshot).toHaveBeenCalledTimes(1))
    manager.stop()
    manager.start()
    await vi.waitFor(() => expect(h.api.getSnapshot).toHaveBeenCalledTimes(2))
    obsolete.resolve(snapshot())
    manager.stop()
  })

  it.each(['LOCAL_SYNC_DATA_CORRUPT', 'STALE_LOCAL_SNAPSHOT'])('stops safely for %s', async (code) => {
    const h = harness([mutation()])
    const error = Object.assign(new Error(code), { code })
    if (code === 'LOCAL_SYNC_DATA_CORRUPT') h.storage.listOutbox = vi.fn(async () => { throw error })
    else h.storage.acknowledgeMutationsAndReplaceSnapshot = vi.fn(async () => { throw error })
    const manager = createSyncManager(h.deps)
    await manager.run()
    expect(h.storage.acknowledgeMutations).not.toHaveBeenCalled()
    if (code === 'LOCAL_SYNC_DATA_CORRUPT') expect(h.api.applyBatch).not.toHaveBeenCalled()
    expect(manager.getState().kind).toBe('needs_attention')
  })
})

describe('SyncManager lifecycle and user actions', () => {
  it('injects event/wakeup adapters and cleans each generation idempotently', async () => {
    const h = harness()
    const manager = createSyncManager(h.deps)
    manager.start()
    manager.start()
    expect(h.timers[0]).toMatchObject({ id: 1, cancelled: false })
    expect(h.deps.events.subscribeOnline).toHaveBeenCalledOnce()
    expect(h.deps.events.subscribeVisibility).toHaveBeenCalledOnce()
    expect(h.deps.subscribeWakeups).toHaveBeenCalledOnce()
    h.setVisible(false)
    h.timers[0].callback()
    expect(h.timers).toHaveLength(2)
    manager.stop()
    manager.stop()
    expect(h.cleanOnline).toHaveBeenCalledOnce()
    expect(h.cleanVisibility).toHaveBeenCalledOnce()
    expect(h.cleanWakeups).toHaveBeenCalledOnce()
    expect(h.timers[1].cancelled).toBe(true)
  })

  it('wakes on online, visible, and Realtime signals', async () => {
    const h = harness()
    const manager = createSyncManager(h.deps)
    manager.start()
    await vi.waitFor(() => expect(h.api.getSnapshot).toHaveBeenCalled())
    h.callbacks.online?.()
    h.callbacks.visibility?.()
    h.callbacks.wake?.()
    await vi.waitFor(() => expect(h.lock.mock.calls.length).toBeGreaterThanOrEqual(2))
    manager.stop()
  })

  it('cleans already-created subscriptions if start registration fails', () => {
    const h = harness()
    h.deps.events.subscribeVisibility = vi.fn(() => { throw new Error('registration failed') })
    const manager = createSyncManager(h.deps)
    expect(() => manager.start()).toThrow('registration failed')
    expect(h.cleanOnline).toHaveBeenCalledOnce()
    manager.stop()
    expect(h.cleanOnline).toHaveBeenCalledOnce()
  })

  it('discard validates a snapshot then calls the atomic user-scoped operation once', async () => {
    const h = harness([mutation({ status: 'needs_attention' })])
    await createSyncManager(h.deps).discardMutation(ids.first)
    expect(h.api.getSnapshot).toHaveBeenCalledOnce()
    expect(h.storage.discardMutationAndReplaceSnapshot).toHaveBeenCalledOnce()
    expect(h.storage.discardMutationAndReplaceSnapshot).toHaveBeenCalledWith(ids.user, ids.first, snapshot())
  })

  it('normal retry is user-scoped and runs only after leaving the lock', async () => {
    const h = harness([mutation({ status: 'needs_attention', lastErrorCode: 'INVALID' })])
    const manager = createSyncManager(h.deps)
    await expect(manager.retryMutation(ids.first)).resolves.toEqual({ status: 'retried' })
    expect(h.storage.markMutationPending).toHaveBeenCalledWith(ids.user, ids.first)
    expect(h.api.applyBatch).toHaveBeenCalledOnce()
  })

  it('previews a legacy chain from a fresh snapshot with zero queue writes', async () => {
    const beanAttention = mutation({ status: 'needs_attention', lastErrorCode: 'LEGACY_CREATE_REQUIRES_CONFIRMATION', lastErrorMessage: 'confirm' })
    const brewAttention = mutation({
      mutationId: ids.brewMutation, entityType: 'brewLog', entityId: ids.brew,
      payload: { bean_id: ids.bean }, status: 'needs_attention',
      lastErrorCode: 'LEGACY_CREATE_REQUIRES_CONFIRMATION', lastErrorMessage: 'confirm',
    } as Partial<SyncMutation>)
    const h = harness([beanAttention, brewAttention])
    const result = await createSyncManager(h.deps).retryMutation(ids.first)
    expect(result).toMatchObject({
      status: 'confirmation_required',
      preview: { target: { mutationId: ids.first, entityType: 'bean', entityId: ids.bean }, relatedMutationIds: [ids.first, ids.brewMutation] },
    })
    expect((result as { preview: { cloudCandidates: unknown[] } }).preview.cloudCandidates).toHaveLength(1)
    expect(h.api.getSnapshot).toHaveBeenCalledOnce()
    expect(h.api.getSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      (h.storage.listOutbox as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
    )
    expect(h.storage.markMutationPending).not.toHaveBeenCalled()
    expect(h.storage.releaseLegacyCreateChain).not.toHaveBeenCalled()
    expect(h.api.applyBatch).not.toHaveBeenCalled()
  })

  it('confirms the exact legacy chain atomically at the fresh epoch before running', async () => {
    const attention = mutation({ status: 'needs_attention', lastErrorCode: 'LEGACY_CREATE_REQUIRES_CONFIRMATION', lastErrorMessage: 'confirm' })
    const h = harness([attention])
    h.api.getSnapshot.mockResolvedValueOnce(snapshot(8))
    await expect(createSyncManager(h.deps).retryMutation(ids.first, { confirmLegacyCreate: true })).resolves.toEqual({ status: 'retried' })
    expect(h.storage.releaseLegacyCreateChain).toHaveBeenCalledWith(ids.user, ids.first, [ids.first], 8)
    expect(h.api.applyBatch).toHaveBeenCalledOnce()
  })

  it('traces a targeted brew attention row back to its local bean root', async () => {
    const attention = {
      status: 'needs_attention' as const,
      lastErrorCode: 'LEGACY_CREATE_REQUIRES_CONFIRMATION',
      lastErrorMessage: 'confirm',
    }
    const beanAttention = mutation(attention)
    const brewAttention = mutation({
      ...attention,
      mutationId: ids.brewMutation,
      entityType: 'brewLog',
      entityId: ids.brew,
      payload: { bean_id: ids.bean },
    } as Partial<SyncMutation>)
    const h = harness([beanAttention, brewAttention])
    const result = await createSyncManager(h.deps).retryMutation(ids.brewMutation)
    expect(result).toMatchObject({
      status: 'confirmation_required',
      preview: { relatedMutationIds: [ids.first, ids.brewMutation] },
    })
  })

  it('does not run when atomic legacy confirmation detects a concurrent change', async () => {
    const attention = mutation({ status: 'needs_attention', lastErrorCode: 'LEGACY_CREATE_REQUIRES_CONFIRMATION' })
    const h = harness([attention])
    h.storage.releaseLegacyCreateChain = vi.fn(async () => { throw Object.assign(new Error('changed'), { code: 'LEGACY_CREATE_CHAIN_CHANGED' }) })
    await expect(createSyncManager(h.deps).retryMutation(ids.first, { confirmLegacyCreate: true })).rejects.toMatchObject({ code: 'LEGACY_CREATE_CHAIN_CHANGED' })
    expect(h.api.applyBatch).not.toHaveBeenCalled()
  })
})
