import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteTestDatabase } from '../../test/setupIndexedDb'
import type { BeanUpdatePayload } from '../beans/beanTypes'
import { createBeanRepository } from '../beans/beanRepository'
import { createLocalRepository } from '../sync/localRepository'
import { selectSendableMutationBatch } from '../sync/outboxModel'
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
  brew_mode: 'hot_pourover', brew_variant: null,
  ice_grams: null, beverage_grams: null,
  bean_id: beanId, brewed_at: nowIso, method: 'pour-over', dripper: 'V60',
  filter_paper: 'CAFEC', grinder: 'C40', grind_setting: '24', coffee_grams: 15,
  water_grams: 250, ratio: '1:16.7', water_temperature_c: 92,
  total_time_seconds: 165, pour_steps: [{ water: 50 }], rating: 4,
  acidity: 4, sweetness: 5, bitterness: 1, astringency: 1, body: 3,
  aftertaste: 4, flavor_tags: ['floral'], is_pinned_recipe: true, notes: null,
}

const beanInput: BeanUpdatePayload = {
  name: 'Offline bean', roaster: null, origin: 'Ethiopia',
  farm_or_station: null, process: 'washed', variety: null,
  altitude_meters: null, roast_date: null, roast_level: 'light',
  flavor_tags: ['floral'], flavor_notes: null, net_weight_grams: 200, remaining_grams: 200,
  price: null, purchase_date: null, source_url: null, bean_type: 'single_origin',
  blend_components: [], blend_notes: null, notes: null,
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

  it('subscribes only to current-user brew changes', async () => {
    const local = createLocalRepository()
    const repository = createBrewLogRepository(local, {
      userId, deviceId, getSyncEpoch: async () => 1, now: () => new Date(nowIso),
    })
    const changes: string[] = []
    const unsubscribe = repository.subscribe(() => changes.push('brew'))
    await createBeanRepository(local, {
      userId, deviceId, getSyncEpoch: async () => 1, now: () => new Date(nowIso),
    }).createBean(beanInput)
    await repository.createBrewLog(input)
    expect(changes).toEqual(['brew'])
    unsubscribe()
  })

  it('lists local brews newest-first with a stable id tie-breaker', async () => {
    const local = createLocalRepository()
    let now = nowIso
    const repository = createBrewLogRepository(local, {
      userId, deviceId, getSyncEpoch: async () => 1, now: () => new Date(now),
    })
    await repository.createBrewLog({ ...input, brewed_at: nowIso, notes: 'older' })
    now = laterIso
    await repository.createBrewLog({ ...input, brewed_at: laterIso, notes: 'newer-a' })
    await repository.createBrewLog({ ...input, brewed_at: laterIso, notes: 'newer-b' })

    const rows = await repository.listBrewLogs()
    expect(rows.map((row) => row.brewed_at)).toEqual([laterIso, laterIso, nowIso])
    expect(rows.slice(0, 2).map((row) => row.id)).toEqual(
      rows.slice(0, 2).map((row) => row.id).toSorted(),
    )
  })

  it('keeps newest-first brew ordering after a server snapshot refresh', async () => {
    const local = createLocalRepository()
    const row = (id: string, brewedAt: string): BrewLog => ({
      ...input, id, user_id: userId, brewed_at: brewedAt,
      created_at: brewedAt, updated_at: brewedAt, deleted_at: null, schema_version: 1,
    })
    const sameA = row('30000000-0000-4000-8000-000000000011', laterIso)
    const older = row('30000000-0000-4000-8000-000000000010', nowIso)
    const sameB = row('30000000-0000-4000-8000-000000000012', laterIso)
    await local.replaceServerSnapshot(userId, {
      syncEpoch: 1, serverTime: laterIso, beans: [], brewLogs: [sameB, older, sameA],
      brewTemplates: [], userSettings: null, aiRecommendations: [],
    })
    const repository = createBrewLogRepository(local, {
      userId, deviceId, getSyncEpoch: async () => 1, now: () => new Date(laterIso),
    })

    expect((await repository.listBrewLogs()).map((item) => item.id)).toEqual([
      sameA.id, sameB.id, older.id,
    ])
  })

  it('keeps one permanent bean relationship after offline edits compress for sending', async () => {
    const local = createLocalRepository()
    let now = '2026-08-09T01:00:00.000Z'
    const beanRepository = createBeanRepository(local, {
      userId, deviceId, getSyncEpoch: async () => 1, now: () => new Date(now),
    })
    const brewRepository = createBrewLogRepository(local, {
      userId, deviceId, getSyncEpoch: async () => 1, now: () => new Date(now),
    })
    const bean = await beanRepository.createBean(beanInput)
    now = '2026-08-09T01:00:01.000Z'
    const brew = await brewRepository.createBrewLog({ ...input, bean_id: bean.id })
    now = '2026-08-09T01:00:02.000Z'
    await beanRepository.updateBean(bean.id, { ...beanInput, name: 'Offline edited bean' })
    now = '2026-08-09T01:00:03.000Z'
    await brewRepository.updateBrewLog(brew.id, { ...input, bean_id: bean.id, notes: 'offline edit' })

    expect(bean.id).not.toMatch(/^local-/)
    const selections = selectSendableMutationBatch(await local.listOutbox(userId))
    expect(selections).toHaveLength(2)
    expect(selections.map(({ mutation }) => mutation.entityType)).toEqual(['bean', 'brewLog'])
    expect(selections[1].mutation.payload).toMatchObject({ bean_id: bean.id, notes: 'offline edit' })
    expect(selections.every(({ mutation }) => mutation.operation === 'upsert')).toBe(true)
  })

  it('sends a newly created bean before its brew despite a cross-entity clock rollback', async () => {
    const local = createLocalRepository()
    const beanRepository = createBeanRepository(local, {
      userId, deviceId, getSyncEpoch: async () => 1,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    })
    const bean = await beanRepository.createBean(beanInput)
    const brewRepository = createBrewLogRepository(local, {
      userId, deviceId, getSyncEpoch: async () => 1,
      now: () => new Date('2020-01-01T00:00:00.000Z'),
    })

    await brewRepository.createBrewLog({ ...input, bean_id: bean.id })

    const outbox = await local.listOutbox(userId)
    expect(outbox.map((item) => item.entityType)).toEqual(['brewLog', 'bean'])
    const selections = selectSendableMutationBatch(outbox)
    expect(selections.map((item) => item.mutation.entityType)).toEqual([
      'bean',
      'brewLog',
    ])
    expect(selections.map((item) => item.coveredMutationIds)).toEqual(
      selections.map((item) => [item.mutation.mutationId]),
    )
  })

  it('sends a brew before its bean delete despite a cross-entity clock jump', async () => {
    const local = createLocalRepository()
    const createBean = createBeanRepository(local, {
      userId, deviceId, getSyncEpoch: async () => 1,
      now: () => new Date('2020-01-01T00:00:00.000Z'),
    })
    const bean = await createBean.createBean(beanInput)
    await local.acknowledgeMutations(
      userId,
      (await local.listOutbox(userId)).map((item) => item.mutationId),
    )
    const brewRepository = createBrewLogRepository(local, {
      userId, deviceId, getSyncEpoch: async () => 1,
      now: () => new Date('2030-01-01T00:00:00.000Z'),
    })
    await brewRepository.createBrewLog({ ...input, bean_id: bean.id })
    const deleteBean = createBeanRepository(local, {
      userId, deviceId, getSyncEpoch: async () => 1,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    })
    await deleteBean.deleteBean(bean.id)

    const outbox = await local.listOutbox(userId)
    expect(outbox.map((item) => [item.entityType, item.operation])).toEqual([
      ['bean', 'delete'],
      ['brewLog', 'upsert'],
    ])
    const selections = selectSendableMutationBatch(outbox)
    expect(
      selections.map((item) => [
        item.mutation.entityType,
        item.mutation.operation,
      ]),
    ).toEqual([
      ['brewLog', 'upsert'],
      ['bean', 'delete'],
    ])
    expect(selections.map((item) => item.coveredMutationIds)).toEqual(
      selections.map((item) => [item.mutation.mutationId]),
    )
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

    expect(Date.parse(deleted.deleted_at ?? '')).toBeGreaterThan(
      Date.parse(laterIso),
    )
    expect(deleted.updated_at).toBe(deleted.deleted_at)
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
