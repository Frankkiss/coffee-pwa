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

export class LocalTimestampProgressionError extends Error {
  readonly code = 'LOCAL_TIMESTAMP_PROGRESSION_FAILED'

  constructor() {
    super('Unable to create a strictly later local entity timestamp')
    this.name = 'LocalTimestampProgressionError'
  }
}

export function snapshotRepositoryInput<Input>(input: Input): Input {
  return structuredClone(input)
}

export function createMonotonicProvisionalTimestamp(
  now: Date,
  currentUpdatedAt: string,
) {
  const nowMilliseconds = now.getTime()
  const currentMilliseconds = Date.parse(currentUpdatedAt)
  if (
    !Number.isFinite(nowMilliseconds) ||
    !isTimezoneQualifiedIsoTime(currentUpdatedAt) ||
    !Number.isFinite(currentMilliseconds)
  ) {
    throw new LocalTimestampProgressionError()
  }

  const nextMilliseconds = Math.max(
    nowMilliseconds,
    currentMilliseconds + 1,
  )
  try {
    const result = new Date(nextMilliseconds).toISOString()
    if (!isTimezoneQualifiedIsoTime(result)) {
      throw new LocalTimestampProgressionError()
    }
    return result
  } catch {
    throw new LocalTimestampProgressionError()
  }
}

function isTimezoneQualifiedIsoTime(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(
    value,
  )
}

export async function prepareRepositoryWrite(
  context: RepositoryContext,
  resolveQueuedAt: (now: Date) => string = (now) => now.toISOString(),
) {
  const now = context.now()
  const queuedAt = resolveQueuedAt(now)
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
