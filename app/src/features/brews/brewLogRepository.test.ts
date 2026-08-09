import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteTestDatabase } from '../../test/setupIndexedDb'
import { createLocalRepository } from '../sync/localRepository'
import { syncDatabaseName } from '../sync/syncDatabase'
import type { BrewLog } from './brewTypes'
import { createBrewLogRepository, type BrewLogWriteInput } from './brewLogRepository'

const userId = '00000000-0000-4000-8000-000000000001'
const otherUserId = '00000000-0000-4000-8000-000000000002'
const deviceId = '10000000-0000-4000-8000-000000000001'
const beanId = '20000000-0000-4000-8000-000000000001'
const nowIso = '2026-08-09T03:04:05.006Z'
const laterIso = '2026-08-09T04:05:06.007Z'

const input: BrewLogWriteInput = {
  bean_id: beanId, brewed_at: nowIso, method: 'pour-over', dripper: 'V60',
  filter_paper: 'CAFEC', grinder: 'C40', grind_setting: '24', coffee_grams: 15,
  water_grams: 250, ratio: '1:16.7', water_temperature_c: 92,
  total_time_seconds: 165, pour_steps: [{ water: 50 }], rating: 4,
  acidity: 4, sweetness: 5, bitterness: 1, astringency: 1, body: 3,
  aftertaste: 4, flavor_tags: ['floral'], is_pinned_recipe: true, notes: null,
}

describe('brewLogRepository', () => {
  beforeEach(async () => deleteTestDatabase(syncDatabaseName))
  afterEach(async () => deleteTestDatabase(syncDatabaseName))

  it('creates a complete brew row, preserves the caller bean UUID, and queues one full upsert', async () => {
    const local = createLocalRepository()
    const repository = createBrewLogRepository(local, { userId, deviceId, getSyncEpoch: async () => 4, now: () => new Date(nowIso) })

    const brew = await repository.createBrewLog(input)

    expect(brew.bean_id).toBe(beanId)
    expect(brew).toEqual({ id: brew.id, user_id: userId, ...input, created_at: nowIso, updated_at: nowIso, deleted_at: null, schema_version: 1 })
    expect(await repository.listBrewLogs()).toEqual([brew])
    const outbox = await local.listOutbox(userId)
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({ entityId: brew.id, entityType: 'brewLog', operation: 'upsert', baseSyncEpoch: 4, queuedAt: nowIso })
    expect(outbox[0].payload).toEqual({ ...input, schema_version: 1 })
  })

  it('updates an active row as a complete record without replacing bean_id', async () => {
    const local = createLocalRepository()
    let now = nowIso
    const repository = createBrewLogRepository(local, { userId, deviceId, getSyncEpoch: async () => 5, now: () => new Date(now) })
    const created = await repository.createBrewLog(input)
    await local.acknowledgeMutations(userId, (await local.listOutbox(userId)).map((item) => item.mutationId))
    now = laterIso

    const updated = await repository.updateBrewLog(created.id, { ...input, rating: 5 })

    expect(updated).toMatchObject({ id: created.id, bean_id: beanId, rating: 5, created_at: nowIso, updated_at: laterIso })
    expect((await local.listOutbox(userId))[0].payload).toEqual({ ...input, rating: 5, schema_version: 1 })
  })

  it('soft-deletes with an empty payload and hides the tombstone', async () => {
    const local = createLocalRepository({ now: () => new Date('2030-01-01T00:00:00.000Z') })
    const repository = createBrewLogRepository(local, { userId, deviceId, getSyncEpoch: async () => 6, now: () => new Date(laterIso) })
    const created = await repository.createBrewLog(input)
    await local.acknowledgeMutations(userId, (await local.listOutbox(userId)).map((item) => item.mutationId))

    const deleted = await Reflect.apply(repository.deleteBrewLog, repository, [created.id, { bean_id: 'evil', user_id: otherUserId }])

    expect(deleted.deleted_at).toBe(laterIso)
    expect(await repository.listBrewLogs()).toEqual([])
    const mutation = (await local.listOutbox(userId))[0]
    expect(Object.keys(mutation.payload)).toHaveLength(0)
    expect(mutation.payload).not.toHaveProperty('bean_id')
  })

  it('rejects cross-user, missing, and soft-deleted targets without synthesizing rows', async () => {
    const local = createLocalRepository()
    const current = createBrewLogRepository(local, { userId, deviceId, getSyncEpoch: async () => 1, now: () => new Date(nowIso) })
    const other = createBrewLogRepository(local, { userId: otherUserId, deviceId, getSyncEpoch: async () => 1, now: () => new Date(nowIso) })
    const foreign = await other.createBrewLog(input)

    await expect(current.updateBrewLog(foreign.id, input)).rejects.toMatchObject({ code: 'LOCAL_ENTITY_NOT_FOUND' })
    await expect(current.deleteBrewLog(foreign.id)).rejects.toMatchObject({ code: 'LOCAL_ENTITY_NOT_FOUND' })
    const owned = await current.createBrewLog(input)
    await current.deleteBrewLog(owned.id)
    const before = await local.listOutbox(userId)
    await expect(current.updateBrewLog(owned.id, input)).rejects.toMatchObject({ code: 'LOCAL_ENTITY_NOT_FOUND' })
    await expect(current.updateBrewLog('30000000-0000-4000-8000-000000000001', input)).rejects.toMatchObject({ code: 'LOCAL_ENTITY_NOT_FOUND' })
    expect(await local.listOutbox(userId)).toEqual(before)
    expect((await local.listLocalEntities('brewLogs', userId)).filter((row: BrewLog) => row.id !== owned.id)).toEqual([])
  })
})
