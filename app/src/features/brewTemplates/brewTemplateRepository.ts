import type { LocalRepository } from '../sync/localRepository'
import { listActiveLocalEntities, prepareRepositoryWrite, requireActiveLocalEntity, type RepositoryContext } from '../sync/repositoryContext'
import { createDeletePayload, createEntityId, type BrewTemplateUpsertPayload, type SyncMutation } from '../sync/syncTypes'
import type { UserBrewTemplateRow } from './brewTemplateTypes'

export type BrewTemplateWriteInput = Omit<
  UserBrewTemplateRow,
  'id' | 'user_id' | 'created_at' | 'updated_at' | 'deleted_at' | 'schema_version'
>

type BrewTemplateMutation = Extract<SyncMutation, { entityType: 'brewTemplate' }>

export function createBrewTemplateRepository(localRepository: LocalRepository, context: RepositoryContext) {
  return {
    async listBrewTemplates() {
      return listActiveLocalEntities(localRepository, 'brewTemplates', context.userId)
    },
    async createBrewTemplate(input: BrewTemplateWriteInput) {
      const write = await prepareRepositoryWrite(context)
      const entity: UserBrewTemplateRow = {
        ...input, id: createEntityId(), user_id: context.userId,
        created_at: write.queuedAt, updated_at: write.queuedAt,
        deleted_at: null, schema_version: 1,
      }
      await saveBrewTemplate(localRepository, entity, write)
      return entity
    },
    async updateBrewTemplate(entityId: string, input: BrewTemplateWriteInput) {
      const current = await requireActiveLocalEntity(localRepository, 'brewTemplates', context.userId, entityId, 'brew template')
      const write = await prepareRepositoryWrite(context)
      const entity: UserBrewTemplateRow = {
        ...current, ...input, id: current.id, user_id: context.userId,
        created_at: current.created_at, updated_at: write.queuedAt,
        deleted_at: null, schema_version: current.schema_version,
      }
      await saveBrewTemplate(localRepository, entity, write)
      return entity
    },
    async deleteBrewTemplate(entityId: string) {
      const current = await requireActiveLocalEntity(localRepository, 'brewTemplates', context.userId, entityId, 'brew template')
      const write = await prepareRepositoryWrite(context)
      const mutation: BrewTemplateMutation = { ...write, entityId, entityType: 'brewTemplate', operation: 'delete', payload: createDeletePayload() }
      return localRepository.softDeleteLocalEntity('brewTemplates', context.userId, current, mutation, write.queuedAt)
    },
  }
}

async function saveBrewTemplate(localRepository: LocalRepository, entity: UserBrewTemplateRow, write: Awaited<ReturnType<typeof prepareRepositoryWrite>>) {
  const payload: BrewTemplateUpsertPayload = {
    name: entity.name, category: entity.category, difficulty: entity.difficulty,
    brewer: entity.brewer, filter: entity.filter, dose_grams: entity.dose_grams,
    water_grams: entity.water_grams, ratio: entity.ratio,
    water_temperature_min: entity.water_temperature_min,
    water_temperature_max: entity.water_temperature_max, grind_size: entity.grind_size,
    target_time_min: entity.target_time_min, target_time_max: entity.target_time_max,
    pour_steps: entity.pour_steps, suitable_for: entity.suitable_for, avoid_for: entity.avoid_for,
    flavor_goal: entity.flavor_goal, adjustment_rules: entity.adjustment_rules,
    source_notes: entity.source_notes, source_urls: entity.source_urls,
    is_champion_reference: entity.is_champion_reference,
    copied_from_template_id: entity.copied_from_template_id, schema_version: entity.schema_version,
  }
  const mutation: BrewTemplateMutation = { ...write, entityId: entity.id, entityType: 'brewTemplate', operation: 'upsert', payload }
  await localRepository.saveLocalEntity('brewTemplates', entity.user_id, entity, mutation)
}
