import { describe, expect, it, vi } from 'vitest'
import { createDeletePayload, type SyncMutation } from './syncTypes'
import {
  aggregateCurrentUserOutbox,
  completeDiscardAndRefresh,
  createRuntimeGeneration,
} from './syncRuntimeModel'

function mutation(
  mutationId: string,
  userId: string,
  entityId: string,
  status: SyncMutation['status'],
): SyncMutation {
  return {
    mutationId,
    deviceId: '20000000-0000-4000-8000-000000000001',
    userId,
    entityType: 'bean',
    entityId,
    operation: 'delete',
    payload: createDeletePayload(),
    baseSyncEpoch: 1,
    queuedAt: '2026-08-11T00:00:00.000Z',
    attemptCount: 0,
    status,
    lastErrorCode: status === 'needs_attention' ? 'SERVER_REJECTED' : null,
    lastErrorMessage: status === 'needs_attention' ? '请检查这条数据' : null,
  }
}

describe('aggregateCurrentUserOutbox', () => {
  it('isolates the current user and gives attention precedence per entity', () => {
    const result = aggregateCurrentUserOutbox('user-a', [
      mutation('pending', 'user-a', 'bean-1', 'pending'),
      mutation('attention', 'user-a', 'bean-1', 'needs_attention'),
      mutation('syncing', 'user-a', 'bean-2', 'syncing'),
      mutation('foreign', 'user-b', 'bean-3', 'needs_attention'),
    ])

    expect(result.pendingCount).toBe(2)
    expect(result.attentionItems.map((item) => item.mutationId)).toEqual(['attention'])
    expect(result.statusByEntityId).toEqual({
      'bean-1': 'needs_attention',
      'bean-2': 'pending',
    })
  })
})

describe('createRuntimeGeneration', () => {
  it('does not start a manager after the generation is cancelled during migration', async () => {
    let finishMigration!: () => void
    const migration = new Promise<void>((resolve) => { finishMigration = resolve })
    const manager = { start: vi.fn(), stop: vi.fn() }
    const generation = createRuntimeGeneration({
      migrate: () => migration,
      createManager: () => manager,
      onReady: vi.fn(),
      onError: vi.fn(),
    })

    const initialization = generation.start()
    generation.stop()
    finishMigration()
    await initialization

    expect(manager.start).not.toHaveBeenCalled()
    expect(manager.stop).not.toHaveBeenCalled()
  })

  it('starts one manager after migration and stops it exactly once', async () => {
    const manager = { start: vi.fn(), stop: vi.fn() }
    const generation = createRuntimeGeneration({
      migrate: vi.fn().mockResolvedValue(undefined),
      createManager: () => manager,
      onReady: vi.fn(),
      onError: vi.fn(),
    })

    await Promise.all([generation.start(), generation.start()])
    generation.stop()
    generation.stop()

    expect(manager.start).toHaveBeenCalledOnce()
    expect(manager.stop).toHaveBeenCalledOnce()
  })

  it('aborts migration before stopping an already-created manager', async () => {
    const order: string[] = []
    const manager = {
      start: vi.fn(),
      stop: vi.fn(() => { order.push('manager-stop') }),
    }
    const generation = createRuntimeGeneration({
      migrate: vi.fn().mockResolvedValue(undefined),
      createManager: () => manager,
      cancelMigration: () => { order.push('migration-abort') },
      onReady: vi.fn(),
      onError: vi.fn(),
    })
    await generation.start()

    generation.stop()

    expect(order).toEqual(['migration-abort', 'manager-stop'])
  })

  it('publishes migration failures without constructing a manager', async () => {
    const error = new Error('IndexedDB unavailable')
    const onError = vi.fn()
    const createManager = vi.fn()
    const generation = createRuntimeGeneration({
      migrate: vi.fn().mockRejectedValue(error),
      createManager,
      onReady: vi.fn(),
      onError,
    })

    await generation.start()

    expect(createManager).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(error)
  })
})

describe('completeDiscardAndRefresh', () => {
  it('publishes a fresh manager state only after atomic discard completes', async () => {
    const order: string[] = []
    const manager = {
      discardMutation: vi.fn(async () => { order.push('discard') }),
      run: vi.fn(async () => { order.push('run') }),
    }
    const refresh = vi.fn(async () => { order.push('refresh') })

    await completeDiscardAndRefresh(manager, 'mutation-1', refresh)

    expect(order).toEqual(['discard', 'run', 'refresh'])
  })
})
