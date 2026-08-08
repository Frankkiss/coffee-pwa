import type { Bean } from '../beans/beanTypes'
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

export type SyncMutation = {
  mutationId: string
  userId: string
  deviceId: string
  baseSyncEpoch: number
  entityType: SyncEntityType
  entityId: string
  operation: SyncOperation
  payload: Record<string, unknown> | null
  queuedAt: string
  attemptCount: number
  status: OutboxStatus
  lastErrorCode: string | null
  lastErrorMessage: string | null
}

export type SyncSnapshot = {
  syncEpoch: number
  serverTime: string
  beans: Bean[]
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
    status: 'applied' | 'duplicate'
  }>
}

export type SyncStorage = {
  listOutbox(userId: string): Promise<SyncMutation[]>
  acknowledgeMutations(mutationIds: string[]): Promise<void>
  markMutationAttention(
    mutationIds: string[],
    code: string,
    message: string,
  ): Promise<void>
  markMutationPending(mutationId: string): Promise<void>
  discardMutation(mutationId: string): Promise<void>
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
