import type { LocalEntityWritePrecondition, LocalRepository } from '../sync/localRepository'
import { createMonotonicProvisionalTimestamp, prepareRepositoryWrite, requireActiveLocalEntity, snapshotRepositoryInput, type RepositoryContext } from '../sync/repositoryContext'
import type { UserSettingsUpsertPayload, SyncMutation } from '../sync/syncTypes'
import type { UserSettingsRow } from './userSettingsTypes'

export type UserSettingsWriteInput = Omit<
  UserSettingsRow,
  'user_id' | 'created_at' | 'updated_at' | 'schema_version'
>

type UserSettingsMutation = Extract<SyncMutation, { entityType: 'userSettings' }>

export function createUserSettingsRepository(localRepository: LocalRepository, context: RepositoryContext) {
  async function listUserSettings() {
    return localRepository.listLocalEntities('userSettings', context.userId)
  }

  return {
    subscribe(listener: () => void) {
      return localRepository.subscribeEntityChanges(context.userId, 'userSettings', listener)
    },
    listUserSettings,
    async getUserSettings() {
      return (await listUserSettings())[0] ?? null
    },
    async createUserSettings(input: UserSettingsWriteInput) {
      const inputSnapshot = snapshotRepositoryInput(input)
      const write = await prepareRepositoryWrite(context)
      const entity: UserSettingsRow = {
        ...inputSnapshot, user_id: context.userId,
        created_at: write.queuedAt, updated_at: write.queuedAt, schema_version: 1,
      }
      await saveUserSettings(
        localRepository, entity, write, { kind: 'missing' },
      )
      return entity
    },
    async updateUserSettings(input: UserSettingsWriteInput) {
      const inputSnapshot = snapshotRepositoryInput(input)
      const current = await requireActiveLocalEntity(localRepository, 'userSettings', context.userId, context.userId, 'user settings')
      const write = await prepareRepositoryWrite(
        context,
        (now) => createMonotonicProvisionalTimestamp(now, current.updated_at),
      )
      const entity: UserSettingsRow = {
        ...current, ...inputSnapshot, user_id: context.userId,
        created_at: current.created_at, updated_at: write.queuedAt,
        schema_version: current.schema_version,
      }
      await saveUserSettings(localRepository, entity, write, {
        kind: 'active', expectedUpdatedAt: current.updated_at,
      })
      return entity
    },
  }
}

async function saveUserSettings(
  localRepository: LocalRepository,
  entity: UserSettingsRow,
  write: Awaited<ReturnType<typeof prepareRepositoryWrite>>,
  precondition: LocalEntityWritePrecondition,
) {
  const payload: UserSettingsUpsertPayload = {
    preferred_units: entity.preferred_units, default_gear: entity.default_gear,
    taste_preferences: entity.taste_preferences,
    backup_reminder_days: entity.backup_reminder_days, schema_version: entity.schema_version,
  }
  const mutation: UserSettingsMutation = { ...write, entityId: entity.user_id, entityType: 'userSettings', operation: 'upsert', payload }
  await localRepository.saveLocalEntity(
    'userSettings', entity.user_id, entity, mutation, precondition,
  )
}
