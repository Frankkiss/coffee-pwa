import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { deleteTestDatabase } from '../../test/setupIndexedDb'
import { createLocalRepository } from '../sync/localRepository'
import { syncDatabaseName } from '../sync/syncDatabase'
import type { SyncSnapshot } from '../sync/syncTypes'
import type { SavedRecommendationRow } from './savedRecommendationList'
import { createRecommendationRepository } from './recommendationRepository'

const userId = '00000000-0000-4000-8000-000000000001'
const otherUserId = '00000000-0000-4000-8000-000000000002'
const recommendationId = '20000000-0000-4000-8000-000000000001'
const deviceId = '10000000-0000-4000-8000-000000000001'
const nowIso = '2026-08-09T09:10:11.012Z'

const context = {
  userId,
  deviceId,
  getSyncEpoch: async () => 1,
  now: () => new Date(nowIso),
}

function recommendation(owner: string, id = recommendationId): SavedRecommendationRow {
  return { id, user_id: owner, bean_id: null, input_context: { target: 'bean' }, recommendation: { rule: 'v60' }, model_name: null, accepted: null, created_at: nowIso, updated_at: nowIso, deleted_at: null, schema_version: 1 }
}

function snapshot(rows: SavedRecommendationRow[]): SyncSnapshot {
  return { syncEpoch: 2, serverTime: nowIso, beans: [], brewLogs: [], brewTemplates: [], userSettings: null, aiRecommendations: rows }
}

describe('recommendationRepository', () => {
  beforeEach(async () => deleteTestDatabase(syncDatabaseName))
  afterEach(async () => deleteTestDatabase(syncDatabaseName))

  it('notifies current-user subscribers when the saved cache changes', async () => {
    const local = createLocalRepository()
    const repository = createRecommendationRepository(local, context)
    const listener = vi.fn()
    const unsubscribe = repository.subscribe(listener)
    await local.replaceServerSnapshot(userId, snapshot([recommendation(userId)]))
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
  })

  it('exposes only current-user local list/get reads and never enqueues', async () => {
    const local = createLocalRepository()
    const owned = recommendation(userId)
    const foreign = recommendation(otherUserId, '20000000-0000-4000-8000-000000000002')
    await local.replaceServerSnapshot(userId, snapshot([owned]))
    await local.replaceServerSnapshot(otherUserId, snapshot([foreign]))
    const repository = createRecommendationRepository(local, context)

    expect(await repository.listRecommendations()).toEqual([owned])
    expect(await repository.getRecommendation(owned.id)).toEqual(owned)
    expect(await repository.getRecommendation(foreign.id)).toBeNull()
    expect(Object.keys(repository).sort()).toEqual(['getRecommendation', 'listRecommendations', 'subscribe'])
    expect('createRecommendation' in repository).toBe(false)
    expect('updateRecommendation' in repository).toBe(false)
    expect('deleteRecommendation' in repository).toBe(false)
    expectTypeOf(repository).not.toHaveProperty('createRecommendation')
    expectTypeOf(repository).not.toHaveProperty('updateRecommendation')
    expectTypeOf(repository).not.toHaveProperty('deleteRecommendation')
    expect(await local.listOutbox(userId)).toEqual([])
    expect(await local.listOutbox(otherUserId)).toEqual([])
  })

  it('hides soft-deleted saved recommendations', async () => {
    const local = createLocalRepository()
    const deleted = { ...recommendation(userId), deleted_at: nowIso }
    await local.replaceServerSnapshot(userId, snapshot([deleted]))
    const repository = createRecommendationRepository(local, context)
    expect(await repository.listRecommendations()).toEqual([])
    expect(await repository.getRecommendation(deleted.id)).toBeNull()
  })
})
