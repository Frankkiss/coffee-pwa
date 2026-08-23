import type { LocalEntityWritePrecondition, LocalRepository } from '../sync/localRepository'
import { createMonotonicProvisionalTimestamp, listActiveLocalEntities, prepareRepositoryWrite, requireActiveLocalEntity, snapshotRepositoryInput, type RepositoryContext } from '../sync/repositoryContext'
import { createDeletePayload, createEntityId, type BrewLogUpsertPayload, type SyncMutation } from '../sync/syncTypes'
import type { BrewLog } from './brewTypes'

export type BrewLogWriteInput = Omit<
  BrewLog,
  'id' | 'user_id' | 'created_at' | 'updated_at' | 'deleted_at' | 'schema_version'
>

type BrewLogMutation = Extract<SyncMutation, { entityType: 'brewLog' }>

export function createBrewLogRepository(localRepository: LocalRepository, context: RepositoryContext) {
  return {
    subscribe(listener: () => void) {
      return localRepository.subscribeEntityChanges(context.userId, 'brewLogs', listener)
    },
    async listBrewLogs() {
      const brewLogs = await listActiveLocalEntities(localRepository, 'brewLogs', context.userId)
      return brewLogs.toSorted(
        (left, right) =>
          Date.parse(right.brewed_at) - Date.parse(left.brewed_at) ||
          left.id.localeCompare(right.id),
      )
    },
    async createBrewLog(input: BrewLogWriteInput) {
      const inputSnapshot = snapshotRepositoryInput(input)
      const write = await prepareRepositoryWrite(context)
      const entity: BrewLog = {
        ...inputSnapshot, id: createEntityId(), user_id: context.userId,
        created_at: write.queuedAt, updated_at: write.queuedAt,
        deleted_at: null, schema_version: 1,
      }
      await saveBrewLog(localRepository, entity, write, { kind: 'missing' })
      return entity
    },
    async updateBrewLog(entityId: string, input: BrewLogWriteInput) {
      const inputSnapshot = snapshotRepositoryInput(input)
      const current = await requireActiveLocalEntity(localRepository, 'brewLogs', context.userId, entityId, 'brew log')
      const write = await prepareRepositoryWrite(
        context,
        (now) => createMonotonicProvisionalTimestamp(now, current.updated_at),
      )
      const entity: BrewLog = {
        ...current, ...inputSnapshot, id: current.id, user_id: context.userId,
        created_at: current.created_at, updated_at: write.queuedAt,
        deleted_at: null, schema_version: current.schema_version,
      }
      await saveBrewLog(localRepository, entity, write, {
        kind: 'active', expectedUpdatedAt: current.updated_at,
      })
      return entity
    },
    async deleteBrewLog(entityId: string) {
      const current = await requireActiveLocalEntity(localRepository, 'brewLogs', context.userId, entityId, 'brew log')
      const write = await prepareRepositoryWrite(
        context,
        (now) => createMonotonicProvisionalTimestamp(now, current.updated_at),
      )
      const mutation: BrewLogMutation = { ...write, entityId, entityType: 'brewLog', operation: 'delete', payload: createDeletePayload() }
      return localRepository.softDeleteLocalEntity(
        'brewLogs', context.userId, current, mutation, write.queuedAt,
        { kind: 'active', expectedUpdatedAt: current.updated_at },
      )
    },
  }
}

async function saveBrewLog(
  localRepository: LocalRepository,
  entity: BrewLog,
  write: Awaited<ReturnType<typeof prepareRepositoryWrite>>,
  precondition: LocalEntityWritePrecondition,
) {
  const payload: BrewLogUpsertPayload = {
    bean_id: entity.bean_id, brewed_at: entity.brewed_at, method: entity.method,
    ...(entity.brew_mode !== undefined ? { brew_mode: entity.brew_mode } : {}),
    ...(entity.brew_variant !== undefined ? { brew_variant: entity.brew_variant } : {}),
    ...(entity.ice_grams !== undefined ? { ice_grams: entity.ice_grams } : {}),
    ...(entity.beverage_grams !== undefined ? { beverage_grams: entity.beverage_grams } : {}),
    dripper: entity.dripper, filter_paper: entity.filter_paper, grinder: entity.grinder,
    grind_setting: entity.grind_setting, coffee_grams: entity.coffee_grams,
    water_grams: entity.water_grams, ratio: entity.ratio,
    water_temperature_c: entity.water_temperature_c, total_time_seconds: entity.total_time_seconds,
    pour_steps: entity.pour_steps, rating: entity.rating, acidity: entity.acidity,
    sweetness: entity.sweetness, bitterness: entity.bitterness, astringency: entity.astringency,
    body: entity.body, aftertaste: entity.aftertaste, flavor_tags: entity.flavor_tags,
    is_pinned_recipe: entity.is_pinned_recipe, notes: entity.notes, schema_version: entity.schema_version,
  }
  const mutation: BrewLogMutation = { ...write, entityId: entity.id, entityType: 'brewLog', operation: 'upsert', payload }
  await localRepository.saveLocalEntity(
    'brewLogs', entity.user_id, entity, mutation, precondition,
  )
}
