import type { ServerBeanRow } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import type { UserBrewTemplateRow } from '../brewTemplates/brewTemplateTypes'
import type { SavedRecommendationRow } from '../recommendations/savedRecommendationList'
import type { UserSettingsRow } from '../settings/userSettingsTypes'

export type SyncEntityType =
  | 'bean'
  | 'brewLog'
  | 'brewTemplate'
  | 'userSettings'

export type SyncOperation = 'upsert' | 'delete'

export type OutboxStatus = 'pending' | 'syncing' | 'needs_attention'

type ServerOwnedFields =
  | 'id'
  | 'user_id'
  | 'created_at'
  | 'updated_at'
  | 'deleted_at'

export type ForbiddenServerFields<Keys extends PropertyKey> = {
  readonly [Key in Keys]?: never
}

declare const deletePayloadBrand: unique symbol

export type EmptyJsonObject = {
  readonly [deletePayloadBrand]: true
  readonly [key: string]: never
}

export type BeanUpsertPayload = Omit<ServerBeanRow, ServerOwnedFields> &
  ForbiddenServerFields<ServerOwnedFields>

export type BrewLogUpsertPayload = Omit<BrewLog, ServerOwnedFields> &
  ForbiddenServerFields<ServerOwnedFields>

export type BrewTemplateUpsertPayload = Omit<
  UserBrewTemplateRow,
  ServerOwnedFields
> &
  ForbiddenServerFields<ServerOwnedFields>

export type UserSettingsUpsertPayload = Omit<
  UserSettingsRow,
  'user_id' | 'created_at' | 'updated_at'
> &
  ForbiddenServerFields<ServerOwnedFields>

type SyncRpcOperationBase = {
  mutationId: string
  deviceId: string
  entityId: string
}

type BeanSyncRpcOperation =
  | {
      entityType: 'bean'
      operation: 'upsert'
      payload: BeanUpsertPayload
    }
  | {
      entityType: 'bean'
      operation: 'delete'
      payload: EmptyJsonObject
    }

type BrewLogSyncRpcOperation =
  | {
      entityType: 'brewLog'
      operation: 'upsert'
      payload: BrewLogUpsertPayload
    }
  | {
      entityType: 'brewLog'
      operation: 'delete'
      payload: EmptyJsonObject
    }

type BrewTemplateSyncRpcOperation =
  | {
      entityType: 'brewTemplate'
      operation: 'upsert'
      payload: BrewTemplateUpsertPayload
    }
  | {
      entityType: 'brewTemplate'
      operation: 'delete'
      payload: EmptyJsonObject
    }

type UserSettingsSyncRpcOperation = {
  entityType: 'userSettings'
  operation: 'upsert'
  payload: UserSettingsUpsertPayload
}

export type SyncRpcOperation = SyncRpcOperationBase &
  (
    | BeanSyncRpcOperation
    | BrewLogSyncRpcOperation
    | BrewTemplateSyncRpcOperation
    | UserSettingsSyncRpcOperation
  )

export type SyncMutation = SyncRpcOperation & {
  userId: string
  baseSyncEpoch: number
  queuedAt: string
  attemptCount: number
  status: OutboxStatus
  lastErrorCode: string | null
  lastErrorMessage: string | null
}

export type SyncSnapshot = {
  syncEpoch: number
  serverTime: string
  beans: ServerBeanRow[]
  brewLogs: BrewLog[]
  brewTemplates: UserBrewTemplateRow[]
  userSettings: UserSettingsRow | null
  aiRecommendations: SavedRecommendationRow[]
}

export type ApplySyncResult = {
  syncEpoch: number
  serverTime: string
  results: Array<{
    mutationId: string
    deviceId: string
    entityType: SyncEntityType
    entityId: string
    operation: SyncOperation
    committedAt: string
    status: 'applied' | 'duplicate'
  }>
}

export type SyncStorage = {
  listOutbox(userId: string): Promise<SyncMutation[]>
  acknowledgeMutations(
    userId: string,
    mutationIds: string[],
  ): Promise<void>
  acknowledgeMutationsAndReplaceSnapshot(
    userId: string,
    mutationIds: string[],
    snapshot: SyncSnapshot,
  ): Promise<void>
  markMutationsSyncing(userId: string, mutationIds: string[]): Promise<void>
  recordRetryableFailure(
    userId: string,
    mutationIds: string[],
    code: string,
    message: string,
  ): Promise<void>
  markMutationAttention(
    userId: string,
    mutationIds: string[],
    code: string,
    message: string,
  ): Promise<void>
  markMutationPending(userId: string, mutationId: string): Promise<void>
  releaseLegacyCreateChain(
    userId: string,
    mutationId: string,
    expectedMutationIds: string[],
    currentEpoch: number,
  ): Promise<void>
  discardMutationAndReplaceSnapshot(
    userId: string,
    mutationId: string,
    snapshot: SyncSnapshot,
  ): Promise<void>
  quarantineOlderEpoch(
    userId: string,
    currentEpoch: number,
    code: string,
    message: string,
  ): Promise<void>
  replaceServerSnapshot(userId: string, snapshot: SyncSnapshot): Promise<void>
  readSyncEpoch(userId: string): Promise<number>
  writeSyncMeta(
    userId: string,
    input: { syncEpoch: number; lastSyncedAt: string },
  ): Promise<void>
}

export type SyncState =
  | { kind: 'synced'; lastSyncedAt: string }
  | { kind: 'syncing'; pendingCount: number }
  | { kind: 'offline'; pendingCount: number }
  | { kind: 'retrying'; pendingCount: number; message: string }
  | {
      kind: 'needs_attention'
      pendingCount: number
      attentionCount: number
    }

export function createEntityId() {
  return crypto.randomUUID()
}

export function createMutationId() {
  return crypto.randomUUID()
}

export function createDeletePayload(): EmptyJsonObject {
  // The unique-symbol brand exists only at compile time; wire JSON stays `{}`.
  return {} as EmptyJsonObject
}
