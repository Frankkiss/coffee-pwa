import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteTestDatabase } from '../../test/setupIndexedDb'
import { createLocalRepository } from '../sync/localRepository'
import { syncDatabaseName } from '../sync/syncDatabase'
import { createUserSettingsRepository, type UserSettingsWriteInput } from './userSettingsRepository'

const userId = '00000000-0000-4000-8000-000000000001'
const deviceId = '10000000-0000-4000-8000-000000000001'
const nowIso = '2026-08-09T07:08:09.010Z'
const laterIso = '2026-08-09T08:09:10.011Z'
const input: UserSettingsWriteInput = {
  preferred_units: { weight: 'grams' }, default_gear: { grinder: 'C40' },
  taste_preferences: { acidity: 4 }, backup_reminder_days: 14,
}

describe('userSettingsRepository', () => {
  beforeEach(async () => deleteTestDatabase(syncDatabaseName))
  afterEach(async () => deleteTestDatabase(syncDatabaseName))

  it('creates settings under the stable current-user entity ID with one complete upsert', async () => {
    const local = createLocalRepository()
    const repository = createUserSettingsRepository(local, { userId, deviceId, getSyncEpoch: async () => 11, now: () => new Date(nowIso) })

    const settings = await repository.createUserSettings(input)

    expect(settings).toEqual({ user_id: userId, ...input, created_at: nowIso, updated_at: nowIso, schema_version: 1 })
    expect(await repository.listUserSettings()).toEqual([settings])
    expect(await repository.getUserSettings()).toEqual(settings)
    const outbox = await local.listOutbox(userId)
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({ entityId: userId, entityType: 'userSettings', operation: 'upsert', baseSyncEpoch: 11 })
    expect(outbox[0].payload).toEqual({ ...input, schema_version: 1 })
  })

  it('updates only existing current-user settings and keeps a complete payload', async () => {
    const local = createLocalRepository()
    let now = nowIso
    const repository = createUserSettingsRepository(local, { userId, deviceId, getSyncEpoch: async () => 12, now: () => new Date(now) })
    const created = await repository.createUserSettings(input)
    await local.acknowledgeMutations(userId, (await local.listOutbox(userId)).map((item) => item.mutationId))
    now = laterIso

    const updated = await repository.updateUserSettings({ ...input, backup_reminder_days: 30 })

    expect(updated).toEqual({ ...created, backup_reminder_days: 30, updated_at: laterIso })
    expect((await local.listOutbox(userId))[0].payload).toEqual({ ...input, backup_reminder_days: 30, schema_version: 1 })
    expect('deleteUserSettings' in repository).toBe(false)
  })

  it('rejects update when current-user settings are absent without writing', async () => {
    const local = createLocalRepository()
    const repository = createUserSettingsRepository(local, { userId, deviceId, getSyncEpoch: async () => 1, now: () => new Date(nowIso) })
    await expect(repository.updateUserSettings(input)).rejects.toMatchObject({ code: 'LOCAL_ENTITY_NOT_FOUND' })
    expect(await local.listLocalEntities('userSettings', userId)).toEqual([])
    expect(await local.listOutbox(userId)).toEqual([])
  })
})
