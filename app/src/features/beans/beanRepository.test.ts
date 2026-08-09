import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteTestDatabase } from '../../test/setupIndexedDb'
import { createLocalRepository } from '../sync/localRepository'
import { syncDatabaseName } from '../sync/syncDatabase'
import type { BeanUpdatePayload } from './beanTypes'
import { createBeanRepository } from './beanRepository'

const userId = '00000000-0000-4000-8000-000000000001'
const otherUserId = '00000000-0000-4000-8000-000000000002'
const deviceId = '10000000-0000-4000-8000-000000000001'
const firstNow = '2026-08-09T01:02:03.004Z'
const secondNow = '2026-08-09T02:03:04.005Z'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const beanInput: BeanUpdatePayload = {
  name: 'Ethiopia Blend',
  roaster: null,
  origin: 'Ethiopia',
  farm_or_station: null,
  process: 'washed',
  variety: null,
  altitude_meters: 1950,
  roast_date: null,
  roast_level: 'light',
  flavor_tags: ['jasmine'],
  flavor_notes: null,
  net_weight_grams: 200,
  price: null,
  purchase_date: null,
  source_url: null,
  bean_type: 'blend',
  blend_components: [{ origin: 'Ethiopia', process: 'washed', variety: '74110', percentage: null, role: '', notes: '' }],
  blend_notes: null,
  notes: null,
}

describe('beanRepository', () => {
  beforeEach(async () => deleteTestDatabase(syncDatabaseName))
  afterEach(async () => deleteTestDatabase(syncDatabaseName))

  it('creates a complete local row with permanent UUID and one validated full upsert', async () => {
    const local = createLocalRepository()
    const getSyncEpoch = vi.fn(async () => 7)
    const repository = createBeanRepository(local, {
      userId, deviceId, getSyncEpoch, now: () => new Date(firstNow),
    })

    const bean = await repository.createBean(beanInput)

    expect(bean.id).toMatch(uuidPattern)
    expect(bean.id).not.toMatch(/^local-/)
    expect(bean).toEqual({
      id: bean.id, user_id: userId, ...beanInput,
      image_url: null, created_at: firstNow, updated_at: firstNow,
      deleted_at: null, schema_version: 1,
    })
    expect(await repository.listBeans()).toEqual([bean])
    const outbox = await local.listOutbox(userId)
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({
      mutationId: expect.stringMatching(uuidPattern), deviceId,
      entityId: bean.id, entityType: 'bean', operation: 'upsert',
      userId, baseSyncEpoch: 7, queuedAt: firstNow,
      status: 'pending', attemptCount: 0,
    })
    expect(outbox[0].payload).toEqual({ ...beanInput, image_url: null, schema_version: 1 })
    expect(outbox[0].payload).not.toHaveProperty('id')
    expect(outbox[0].payload).not.toHaveProperty('user_id')
    expect(outbox[0].payload).not.toHaveProperty('created_at')
    expect(getSyncEpoch).toHaveBeenCalledOnce()
  })

  it('updates only an active current-user row and preserves its server fields', async () => {
    const local = createLocalRepository()
    let now = firstNow
    const repository = createBeanRepository(local, {
      userId, deviceId, getSyncEpoch: async () => 8, now: () => new Date(now),
    })
    const created = await repository.createBean(beanInput)
    await local.acknowledgeMutations(userId, (await local.listOutbox(userId)).map((item) => item.mutationId))
    now = secondNow

    const updated = await repository.updateBean(created.id, { ...beanInput, name: 'Edited', notes: 'kept complete' })

    expect(updated).toMatchObject({ id: created.id, user_id: userId, name: 'Edited', created_at: firstNow, updated_at: secondNow })
    expect((await local.listOutbox(userId))[0].payload).toEqual({ ...beanInput, name: 'Edited', notes: 'kept complete', image_url: null, schema_version: 1 })
  })

  it('soft-deletes atomically with the context time and a newly branded empty payload', async () => {
    const local = createLocalRepository({ now: () => new Date('2030-01-01T00:00:00.000Z') })
    const repository = createBeanRepository(local, {
      userId, deviceId, getSyncEpoch: async () => 9, now: () => new Date(secondNow),
    })
    const created = await repository.createBean(beanInput)
    await local.acknowledgeMutations(userId, (await local.listOutbox(userId)).map((item) => item.mutationId))

    const deleted = await Reflect.apply(repository.deleteBean, repository, [created.id, { user_id: otherUserId, secret: 'must-not-leak' }])

    expect(deleted).toMatchObject({ deleted_at: secondNow, updated_at: secondNow })
    expect(await repository.listBeans()).toEqual([])
    const mutation = (await local.listOutbox(userId))[0]
    expect(mutation.operation).toBe('delete')
    expect(Object.keys(mutation.payload)).toHaveLength(0)
    expect(mutation.payload).not.toHaveProperty('secret')
  })

  it('rejects missing, soft-deleted, and cross-user updates without any half-write', async () => {
    const local = createLocalRepository()
    const current = createBeanRepository(local, { userId, deviceId, getSyncEpoch: async () => 2, now: () => new Date(firstNow) })
    const other = createBeanRepository(local, { userId: otherUserId, deviceId, getSyncEpoch: async () => 2, now: () => new Date(firstNow) })
    const foreign = await other.createBean(beanInput)
    await other.deleteBean(foreign.id)

    await expect(current.updateBean(foreign.id, beanInput)).rejects.toMatchObject({ code: 'LOCAL_ENTITY_NOT_FOUND' })
    await expect(current.deleteBean(foreign.id)).rejects.toMatchObject({ code: 'LOCAL_ENTITY_NOT_FOUND' })
    expect(await local.listOutbox(userId)).toEqual([])

    const owned = await current.createBean(beanInput)
    await current.deleteBean(owned.id)
    const count = (await local.listOutbox(userId)).length
    await expect(current.updateBean(owned.id, beanInput)).rejects.toMatchObject({ code: 'LOCAL_ENTITY_NOT_FOUND' })
    expect(await local.listOutbox(userId)).toHaveLength(count)
  })

  it('does not write when time or epoch acquisition fails', async () => {
    const local = createLocalRepository()
    const badTime = createBeanRepository(local, { userId, deviceId, getSyncEpoch: async () => 1, now: () => new Date(Number.NaN) })
    await expect(badTime.createBean(beanInput)).rejects.toThrow()
    const badEpoch = createBeanRepository(local, { userId, deviceId, getSyncEpoch: async () => { throw new Error('epoch unavailable') }, now: () => new Date(firstNow) })
    await expect(badEpoch.createBean(beanInput)).rejects.toThrow('epoch unavailable')
    expect(await local.listLocalEntities('beans', userId)).toEqual([])
    expect(await local.listOutbox(userId)).toEqual([])
  })
})
