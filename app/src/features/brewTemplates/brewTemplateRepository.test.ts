import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteTestDatabase } from '../../test/setupIndexedDb'
import { createLocalRepository } from '../sync/localRepository'
import { syncDatabaseName } from '../sync/syncDatabase'
import { createBrewTemplateRepository, type BrewTemplateWriteInput } from './brewTemplateRepository'

const userId = '00000000-0000-4000-8000-000000000001'
const otherUserId = '00000000-0000-4000-8000-000000000002'
const deviceId = '10000000-0000-4000-8000-000000000001'
const nowIso = '2026-08-09T05:06:07.008Z'
const laterIso = '2026-08-09T06:07:08.009Z'
const input: BrewTemplateWriteInput = {
  name: 'Complete V60', category: 'daily-pourover', difficulty: 'advanced',
  brewer: 'V60', filter: 'paper', dose_grams: 15, water_grams: 250,
  ratio: '1:16.7', water_temperature_min: 90, water_temperature_max: 94,
  grind_size: 'medium-fine', target_time_min: 150, target_time_max: 180,
  pour_steps: [{ order: 1, startSeconds: 0, endSeconds: 40, targetWaterGrams: 50, label: 'Bloom', action: 'pour' }],
  suitable_for: ['light'], avoid_for: ['dark'], flavor_goal: 'floral',
  adjustment_rules: ['grind finer'], source_notes: 'own recipe', source_urls: ['https://example.com'],
  is_champion_reference: false, copied_from_template_id: null,
  brew_mode: 'iced_pourover', brew_variant: null, ice_grams: 75,
  beverage_grams: null,
}

describe('brewTemplateRepository', () => {
  beforeEach(async () => deleteTestDatabase(syncDatabaseName))
  afterEach(async () => deleteTestDatabase(syncDatabaseName))

  it('notifies current-user subscribers after a committed template write', async () => {
    const local = createLocalRepository()
    const repository = createBrewTemplateRepository(local, { userId, deviceId, getSyncEpoch: async () => 1, now: () => new Date(nowIso) })
    const listener = vi.fn()
    const unsubscribe = repository.subscribe(listener)
    await repository.createBrewTemplate(input)
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
  })

  it('creates and lists a complete template row with enums, steps, and one full upsert', async () => {
    const local = createLocalRepository()
    const repository = createBrewTemplateRepository(local, { userId, deviceId, getSyncEpoch: async () => 3, now: () => new Date(nowIso) })
    const template = await repository.createBrewTemplate(input)

    expect(template).toEqual({ id: template.id, user_id: userId, ...input, created_at: nowIso, updated_at: nowIso, deleted_at: null, schema_version: 1 })
    expect(await repository.listBrewTemplates()).toEqual([template])
    const outbox = await local.listOutbox(userId)
    expect(outbox).toHaveLength(1)
    expect(outbox[0].payload).toEqual({ ...input, schema_version: 1 })
    expect(outbox[0].payload).toMatchObject({
      brew_mode: 'iced_pourover', ice_grams: 75, beverage_grams: null,
    })
  })

  it('updates a current active template as one complete upsert', async () => {
    const local = createLocalRepository()
    let now = nowIso
    const repository = createBrewTemplateRepository(local, { userId, deviceId, getSyncEpoch: async () => 4, now: () => new Date(now) })
    const created = await repository.createBrewTemplate(input)
    await local.acknowledgeMutations(userId, (await local.listOutbox(userId)).map((item) => item.mutationId))
    now = laterIso
    const updated = await repository.updateBrewTemplate(created.id, { ...input, difficulty: 'easy', pour_steps: [...input.pour_steps, { order: 2, startSeconds: 40, endSeconds: null, targetWaterGrams: 250, label: 'Main', action: 'pour' }] })

    expect(updated).toMatchObject({ id: created.id, difficulty: 'easy', created_at: nowIso, updated_at: laterIso })
    expect((await local.listOutbox(userId))[0].payload).toMatchObject({ difficulty: 'easy', pour_steps: updated.pour_steps, schema_version: 1 })
  })

  it('soft-deletes with only a branded empty payload', async () => {
    const local = createLocalRepository({ now: () => new Date('2030-01-01T00:00:00.000Z') })
    const repository = createBrewTemplateRepository(local, { userId, deviceId, getSyncEpoch: async () => 5, now: () => new Date(laterIso) })
    const created = await repository.createBrewTemplate(input)
    await local.acknowledgeMutations(userId, (await local.listOutbox(userId)).map((item) => item.mutationId))
    const deleted = await Reflect.apply(repository.deleteBrewTemplate, repository, [created.id, { schema_version: 99, user_id: otherUserId }])

    expect(Date.parse(deleted.deleted_at ?? '')).toBeGreaterThan(
      Date.parse(laterIso),
    )
    expect(deleted.updated_at).toBe(deleted.deleted_at)
    expect(await repository.listBrewTemplates()).toEqual([])
    const mutation = (await local.listOutbox(userId))[0]
    expect(Object.keys(mutation.payload)).toHaveLength(0)
    expect(mutation.payload).not.toHaveProperty('schema_version')
  })

  it('rejects missing, deleted, and cross-user targets without an outbox write', async () => {
    const local = createLocalRepository()
    const current = createBrewTemplateRepository(local, { userId, deviceId, getSyncEpoch: async () => 1, now: () => new Date(nowIso) })
    const other = createBrewTemplateRepository(local, { userId: otherUserId, deviceId, getSyncEpoch: async () => 1, now: () => new Date(nowIso) })
    const foreign = await other.createBrewTemplate(input)
    await expect(current.updateBrewTemplate(foreign.id, input)).rejects.toMatchObject({ code: 'LOCAL_ENTITY_NOT_FOUND' })
    const owned = await current.createBrewTemplate(input)
    await current.deleteBrewTemplate(owned.id)
    const before = await local.listOutbox(userId)
    await expect(current.deleteBrewTemplate(owned.id)).rejects.toMatchObject({ code: 'LOCAL_ENTITY_NOT_FOUND' })
    await expect(current.updateBrewTemplate('30000000-0000-4000-8000-000000000001', input)).rejects.toMatchObject({ code: 'LOCAL_ENTITY_NOT_FOUND' })
    expect(await local.listOutbox(userId)).toEqual(before)
  })
})
