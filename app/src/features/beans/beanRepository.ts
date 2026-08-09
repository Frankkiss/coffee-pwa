import type { LocalRepository } from '../sync/localRepository'
import {
  listActiveLocalEntities,
  prepareRepositoryWrite,
  requireActiveLocalEntity,
  type RepositoryContext,
} from '../sync/repositoryContext'
import {
  createDeletePayload,
  createEntityId,
  type BeanUpsertPayload,
  type SyncMutation,
} from '../sync/syncTypes'
import type { BeanUpdatePayload, ServerBeanRow } from './beanTypes'

type BeanMutation = Extract<SyncMutation, { entityType: 'bean' }>

export function createBeanRepository(
  localRepository: LocalRepository,
  context: RepositoryContext,
) {
  return {
    async listBeans() {
      return listActiveLocalEntities(localRepository, 'beans', context.userId)
    },

    async createBean(input: BeanUpdatePayload) {
      const id = createEntityId()
      const write = await prepareRepositoryWrite(context)
      const entity: ServerBeanRow = {
        ...input,
        id,
        user_id: context.userId,
        image_url: null,
        created_at: write.queuedAt,
        updated_at: write.queuedAt,
        deleted_at: null,
        schema_version: 1,
      }
      await saveBean(localRepository, entity, write)
      return entity
    },

    async updateBean(entityId: string, input: BeanUpdatePayload) {
      const current = await requireActiveLocalEntity(
        localRepository, 'beans', context.userId, entityId, 'bean',
      )
      const write = await prepareRepositoryWrite(context)
      const entity: ServerBeanRow = {
        ...current,
        ...input,
        id: current.id,
        user_id: context.userId,
        image_url: current.image_url,
        created_at: current.created_at,
        updated_at: write.queuedAt,
        deleted_at: null,
        schema_version: current.schema_version,
      }
      await saveBean(localRepository, entity, write)
      return entity
    },

    async deleteBean(entityId: string) {
      const current = await requireActiveLocalEntity(
        localRepository, 'beans', context.userId, entityId, 'bean',
      )
      const write = await prepareRepositoryWrite(context)
      const mutation: BeanMutation = {
        ...write,
        entityId,
        entityType: 'bean',
        operation: 'delete',
        payload: createDeletePayload(),
      }
      return localRepository.softDeleteLocalEntity(
        'beans', context.userId, current, mutation, write.queuedAt,
      )
    },
  }
}

async function saveBean(
  localRepository: LocalRepository,
  entity: ServerBeanRow,
  write: Awaited<ReturnType<typeof prepareRepositoryWrite>>,
) {
  const payload: BeanUpsertPayload = {
    name: entity.name,
    roaster: entity.roaster,
    origin: entity.origin,
    farm_or_station: entity.farm_or_station,
    process: entity.process,
    variety: entity.variety,
    altitude_meters: entity.altitude_meters,
    roast_date: entity.roast_date,
    roast_level: entity.roast_level,
    flavor_tags: entity.flavor_tags,
    flavor_notes: entity.flavor_notes,
    net_weight_grams: entity.net_weight_grams,
    price: entity.price,
    purchase_date: entity.purchase_date,
    source_url: entity.source_url,
    image_url: entity.image_url,
    bean_type: entity.bean_type,
    blend_components: entity.blend_components,
    blend_notes: entity.blend_notes,
    notes: entity.notes,
    schema_version: entity.schema_version,
  }
  const mutation: BeanMutation = {
    ...write,
    entityId: entity.id,
    entityType: 'bean',
    operation: 'upsert',
    payload,
  }
  await localRepository.saveLocalEntity('beans', entity.user_id, entity, mutation)
}
