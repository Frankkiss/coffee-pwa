import type { LocalEntityStoreName, LocalRepository } from './localRepository'
import { createMutationId } from './syncTypes'

export type RepositoryContext = {
  userId: string
  deviceId: string
  getSyncEpoch: () => Promise<number>
  now: () => Date
}

export class LocalEntityNotFoundError extends Error {
  readonly code = 'LOCAL_ENTITY_NOT_FOUND'

  constructor(entityType: string, entityId: string) {
    super(`Active current-user ${entityType} was not found: ${entityId}`)
    this.name = 'LocalEntityNotFoundError'
  }
}

export async function prepareRepositoryWrite(context: RepositoryContext) {
  const queuedAt = context.now().toISOString()
  const baseSyncEpoch = await context.getSyncEpoch()

  return {
    mutationId: createMutationId(),
    deviceId: context.deviceId,
    userId: context.userId,
    baseSyncEpoch,
    queuedAt,
    attemptCount: 0 as const,
    status: 'pending' as const,
    lastErrorCode: null,
    lastErrorMessage: null,
  }
}

export async function listActiveLocalEntities<
  Store extends LocalEntityStoreName,
>(localRepository: LocalRepository, storeName: Store, userId: string) {
  const rows = await localRepository.listLocalEntities(storeName, userId)
  return rows.filter((row) => !('deleted_at' in row) || row.deleted_at === null)
}

export async function requireActiveLocalEntity<
  Store extends LocalEntityStoreName,
>(
  localRepository: LocalRepository,
  storeName: Store,
  userId: string,
  entityId: string,
  entityType: string,
) {
  const rows = await listActiveLocalEntities(localRepository, storeName, userId)
  const row = rows.find((candidate) =>
    storeName === 'userSettings'
      ? candidate.user_id === entityId
      : 'id' in candidate && candidate.id === entityId,
  )
  if (row === undefined) {
    throw new LocalEntityNotFoundError(entityType, entityId)
  }
  return row
}
