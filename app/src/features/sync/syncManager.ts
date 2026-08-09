import { toSyncRpcOperation, SyncApiError } from './syncApi'
import { selectSendableMutationBatch } from './outboxModel'
import type { SyncLockGuard } from './syncLock'
import type {
  ApplySyncResult,
  SyncMutation,
  SyncRpcOperation,
  SyncSnapshot,
  SyncState,
  SyncStorage,
} from './syncTypes'

type SyncApi = {
  applyBatch(syncEpoch: number, operations: SyncRpcOperation[]): Promise<ApplySyncResult>
  getSnapshot(): Promise<SyncSnapshot>
}

type SyncLock = (
  userId: string,
  action: (guard: SyncLockGuard) => Promise<void>,
) => Promise<void>

export type SyncManagerDependencies = {
  userId: string
  deviceId: string
  api: SyncApi
  storage: SyncStorage
  lock: SyncLock
  now: () => Date
  online: () => boolean
  schedule: (callback: () => void, delayMs: number) => number
  cancelSchedule: (id: number) => void
  events: {
    subscribeOnline: (callback: () => void) => () => void
    subscribeVisibility: (callback: () => void) => () => void
    isVisible: () => boolean
  }
  subscribeWakeups: (userId: string, wake: () => void) => () => void
}

export type LegacyCreateCandidate = {
  entityType: SyncMutation['entityType']
  id: string
  label: string
  updatedAt: string
  deletedAt: string | null
}

export type RetryMutationResult =
  | { status: 'retried' }
  | {
      status: 'confirmation_required'
      preview: {
        target: Pick<SyncMutation, 'mutationId' | 'entityType' | 'entityId' | 'operation'>
        relatedMutationIds: string[]
        cloudCandidates: LegacyCreateCandidate[]
      }
    }

const pollIntervalMs = 60_000
const legacyCode = 'LEGACY_CREATE_REQUIRES_CONFIRMATION'

export function createSyncManager(deps: SyncManagerDependencies) {
  let state: SyncState = {
    kind: 'retrying',
    pendingCount: 0,
    message: '尚未完成首次同步',
  }
  let generation = 0
  let started = false
  let runningPromise: Promise<void> | null = null
  let runningGeneration: number | null = null
  let pollTimer: number | null = null
  let cleanups: Array<() => void> = []
  const listeners = new Set<(state: SyncState) => void>()

  const isCurrent = (token: number) => token === generation
  const canContinue = async (token: number, guard: SyncLockGuard) => {
    if (!isCurrent(token) || guard.signal.aborted) return false
    try {
      await guard.assertHeld()
    } catch {
      return false
    }
    return isCurrent(token) && !guard.signal.aborted
  }
  const publish = (token: number, next: SyncState) => {
    if (!isCurrent(token)) return
    state = next
    for (const listener of listeners) listener(state)
  }

  const publishAttention = (
    token: number,
    outbox: SyncMutation[],
    globalIssue = false,
  ) => {
    const attentionCount = outbox.filter((item) => item.status === 'needs_attention').length
    publish(token, {
      kind: 'needs_attention',
      pendingCount: outbox.length - attentionCount,
      attentionCount: Math.max(attentionCount, globalIssue ? 1 : 0),
    })
  }

  const run = (): Promise<void> => {
    const token = generation
    if (runningPromise !== null && runningGeneration === token) {
      return runningPromise
    }
    const operation = runGeneration(token)
    runningPromise = operation
    runningGeneration = token
    void operation.finally(() => {
      if (runningPromise === operation) {
        runningPromise = null
        runningGeneration = null
      }
    })
    return operation
  }

  async function runGeneration(token: number): Promise<void> {
    if (!deps.online()) {
      try {
        const outbox = await deps.storage.listOutbox(deps.userId)
        if (!isCurrent(token)) return
        publish(token, { kind: 'offline', pendingCount: outbox.length })
      } catch {
        if (isCurrent(token)) publishAttention(token, [], true)
      }
      return
    }

    try {
      await deps.lock(deps.userId, async (guard) => {
        if (!(await canContinue(token, guard))) return
        await cycleInsideLock(token, guard)
      })
    } catch (error) {
      if (errorCode(error) === 'SYNC_LOCK_LOST') return
      if (isCurrent(token)) {
        publish(token, {
          kind: 'retrying',
          pendingCount: 0,
          message: '同步锁暂时不可用',
        })
      }
    }
  }

  async function cycleInsideLock(token: number, guard: SyncLockGuard) {
    let outbox: SyncMutation[] = []
    let markedIds: string[] = []
    let confirmedIds: string[] = []
    let applyValidated = false
    let phase: 'read' | 'apply' | 'snapshot-fetch' | 'snapshot-replace' | 'ack' = 'read'

    try {
      if (!(await canContinue(token, guard))) return
      outbox = await deps.storage.listOutbox(deps.userId)
      if (!(await canContinue(token, guard))) return
      const interrupted = outbox.filter((item) => item.status === 'syncing')
      for (const item of interrupted) {
        if (!(await canContinue(token, guard))) return
        await deps.storage.markMutationPending(deps.userId, item.mutationId)
        if (!(await canContinue(token, guard))) return
      }
      if (interrupted.length > 0) {
        if (!(await canContinue(token, guard))) return
        outbox = await deps.storage.listOutbox(deps.userId)
        if (!(await canContinue(token, guard))) return
      }

      if (!(await canContinue(token, guard))) return
      publish(token, { kind: 'syncing', pendingCount: outbox.length })
      const selected = selectSendableMutationBatch(outbox)
      let snapshot: SyncSnapshot
      if (selected.length > 0) {
        if (!(await canContinue(token, guard))) return
        const epoch = await deps.storage.readSyncEpoch(deps.userId)
        if (!(await canContinue(token, guard))) return
        markedIds = selected.flatMap((item) => item.coveredMutationIds)
        if (!(await canContinue(token, guard))) return
        await deps.storage.markMutationsSyncing(deps.userId, markedIds)
        if (!(await canContinue(token, guard))) return
        const wire = selected.map((item) => toSyncRpcOperation(item.mutation))
        phase = 'apply'
        if (!(await canContinue(token, guard))) return
        const result = await deps.api.applyBatch(epoch, wire)
        if (!(await canContinue(token, guard))) return
        confirmedIds = confirmedCoveredIds(result, selected, wire)
        applyValidated = true
        phase = 'snapshot-fetch'
        try {
          if (!(await canContinue(token, guard))) return
          snapshot = await deps.api.getSnapshot()
        } catch (error) {
          if (!(await canContinue(token, guard))) return
          await acknowledgeConfirmed(token, guard, confirmedIds)
          if (!(await canContinue(token, guard))) return
          publishFailure(token, withoutIds(outbox, confirmedIds), error)
          return
        }
        if (!(await canContinue(token, guard))) return
        phase = 'snapshot-replace'
        if (!(await canContinue(token, guard))) return
        await deps.storage.acknowledgeMutationsAndReplaceSnapshot(
          deps.userId,
          confirmedIds,
          snapshot,
        )
        if (!(await canContinue(token, guard))) return
        phase = 'ack'
      } else {
        phase = 'snapshot-fetch'
        if (!(await canContinue(token, guard))) return
        snapshot = await deps.api.getSnapshot()
        if (!(await canContinue(token, guard))) return
        phase = 'snapshot-replace'
        if (!(await canContinue(token, guard))) return
        await deps.storage.replaceServerSnapshot(deps.userId, snapshot)
        if (!(await canContinue(token, guard))) return
      }

      const remaining = withoutIds(outbox, confirmedIds)
      const attention = remaining.filter((item) => item.status === 'needs_attention').length
      if (!(await canContinue(token, guard))) return
      if (attention > 0) publishAttention(token, remaining)
      else if (remaining.length > 0) {
        publish(token, { kind: 'retrying', pendingCount: remaining.length, message: '等待同步' })
      } else {
        publish(token, { kind: 'synced', lastSyncedAt: snapshot.serverTime })
      }
    } catch (error) {
      if (!(await canContinue(token, guard))) return
      if (isLocalSafetyError(error)) {
        publishAttention(token, outbox, true)
        return
      }
      if (phase === 'apply' && errorCode(error) === 'STALE_SYNC_EPOCH') {
        await recoverStaleEpoch(token, guard, outbox, error)
        return
      }
      if (phase === 'apply' && markedIds.length > 0) {
        if (errorCode(error) === 'INVALID_SYNC_RESPONSE') {
          publishAttention(token, outbox, true)
          return
        }
        if (isRetryable(error)) {
          if (!(await canContinue(token, guard))) return
          await deps.storage.recordRetryableFailure(
            deps.userId,
            markedIds,
            errorCode(error),
            errorMessage(error),
          )
          if (!(await canContinue(token, guard))) return
          publish(token, {
            kind: 'retrying',
            pendingCount: outbox.length,
            message: errorMessage(error),
          })
          return
        }
        if (!(await canContinue(token, guard))) return
        await deps.storage.markMutationAttention(
          deps.userId,
          markedIds,
          errorCode(error),
          errorMessage(error),
        )
        if (!(await canContinue(token, guard))) return
        publishAttention(token, markIdsAttention(outbox, markedIds))
        return
      }
      if (applyValidated && phase === 'snapshot-replace') {
        // A local integrity/monotonicity failure is handled above. Unknown
        // storage failures retain syncing rows for the next recovery cycle.
        publishFailure(token, outbox, error)
        return
      }
      publishFailure(token, outbox, error)
    }
  }

  async function acknowledgeConfirmed(
    token: number,
    guard: SyncLockGuard,
    ids: string[],
  ) {
    if (ids.length === 0 || !(await canContinue(token, guard))) return
    await deps.storage.acknowledgeMutations(deps.userId, ids)
  }

  async function recoverStaleEpoch(
    token: number,
    guard: SyncLockGuard,
    outbox: SyncMutation[],
    cause: unknown,
  ) {
    try {
      if (!(await canContinue(token, guard))) return
      const fresh = await deps.api.getSnapshot()
      if (!(await canContinue(token, guard))) return
      await deps.storage.quarantineOlderEpoch(
        deps.userId,
        fresh.syncEpoch,
        'STALE_SYNC_EPOCH',
        errorMessage(cause),
      )
      if (!(await canContinue(token, guard))) return
      await deps.storage.replaceServerSnapshot(deps.userId, fresh)
      if (!(await canContinue(token, guard))) return
      publishAttention(token, outbox, true)
    } catch (error) {
      if (await canContinue(token, guard)) {
        publishFailure(token, outbox, error)
      }
    }
  }

  function publishFailure(token: number, outbox: SyncMutation[], error: unknown) {
    if (errorCode(error) === 'INVALID_SYNC_RESPONSE' || isLocalSafetyError(error) || !isRetryable(error)) {
      publishAttention(token, outbox, true)
    } else {
      publish(token, {
        kind: 'retrying',
        pendingCount: outbox.length,
        message: errorMessage(error),
      })
    }
  }

  function schedulePoll(token: number) {
    pollTimer = deps.schedule(() => {
      if (!started || !isCurrent(token)) return
      if (deps.events.isVisible()) void run()
      schedulePoll(token)
    }, pollIntervalMs)
  }

  function start() {
    if (started) return
    started = true
    generation += 1
    const token = generation
    const wakeIfCurrent = () => {
      if (started && isCurrent(token) && deps.online()) void run()
    }
    const visibleWake = () => {
      if (deps.events.isVisible()) wakeIfCurrent()
    }
    const registered: Array<() => void> = []
    try {
      registered.push(once(deps.events.subscribeOnline(wakeIfCurrent)))
      registered.push(once(deps.events.subscribeVisibility(visibleWake)))
      registered.push(once(deps.subscribeWakeups(deps.userId, wakeIfCurrent)))
      cleanups = registered
      schedulePoll(token)
      wakeIfCurrent()
    } catch (error) {
      started = false
      generation += 1
      if (pollTimer !== null) {
        deps.cancelSchedule(pollTimer)
        pollTimer = null
      }
      for (const cleanup of registered.reverse()) cleanup()
      cleanups = []
      throw error
    }
  }

  function stop() {
    if (!started && cleanups.length === 0) {
      generation += 1
      return
    }
    started = false
    generation += 1
    if (pollTimer !== null) {
      deps.cancelSchedule(pollTimer)
      pollTimer = null
    }
    const pendingCleanups = cleanups
    cleanups = []
    for (const cleanup of pendingCleanups) cleanup()
  }

  async function retryMutation(
    mutationId: string,
    options: { confirmLegacyCreate?: boolean } = {},
  ): Promise<RetryMutationResult> {
    const token = generation
    let shouldRun = false
    let result: RetryMutationResult = { status: 'retried' }
    await deps.lock(deps.userId, async (guard) => {
      if (!(await canContinue(token, guard))) return
      const fresh = await deps.api.getSnapshot()
      if (!(await canContinue(token, guard))) return
      const current = await deps.storage.listOutbox(deps.userId)
      if (!(await canContinue(token, guard))) return
      const target = current.find((item) => item.mutationId === mutationId)
      if (!target) throw mutationNotFound()
      if (target.lastErrorCode !== legacyCode) {
        if (!(await canContinue(token, guard))) return
        await deps.storage.markMutationPending(deps.userId, mutationId)
        if (await canContinue(token, guard)) shouldRun = true
        return
      }
      if (target.status !== 'needs_attention') {
        throw legacyChainChanged()
      }
      const relatedMutationIds = findLegacyChain(current, target)
      if (!options.confirmLegacyCreate) {
        result = {
          status: 'confirmation_required',
          preview: {
            target: {
              mutationId: target.mutationId,
              entityType: target.entityType,
              entityId: target.entityId,
              operation: target.operation,
            },
            relatedMutationIds,
            cloudCandidates: cloudCandidates(fresh, target.entityType, deps.userId),
          },
        }
        return
      }
      if (!(await canContinue(token, guard))) return
      await deps.storage.releaseLegacyCreateChain(
        deps.userId,
        mutationId,
        relatedMutationIds,
        fresh.syncEpoch,
      )
      if (await canContinue(token, guard)) shouldRun = true
    })
    if (shouldRun && isCurrent(token)) await run()
    return result
  }

  async function discardMutation(mutationId: string): Promise<void> {
    const token = generation
    await deps.lock(deps.userId, async (guard) => {
      if (!(await canContinue(token, guard))) return
      const fresh = await deps.api.getSnapshot()
      if (!(await canContinue(token, guard))) return
      await deps.storage.discardMutationAndReplaceSnapshot(
        deps.userId,
        mutationId,
        fresh,
      )
      await canContinue(token, guard)
    })
  }

  return {
    start,
    stop,
    run,
    retryMutation,
    discardMutation,
    getState: () => state,
    subscribe(listener: (state: SyncState) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

function confirmedCoveredIds(
  result: ApplySyncResult,
  selected: ReturnType<typeof selectSendableMutationBatch>,
  wire: SyncRpcOperation[],
) {
  const receipts = new Map(result.results.map((item) => [item.mutationId, item]))
  const ids: string[] = []
  for (let index = 0; index < selected.length; index += 1) {
    const operation = wire[index]
    const receipt = receipts.get(operation.mutationId)
    if (!receipt || (receipt.status !== 'applied' && receipt.status !== 'duplicate') ||
      receipt.deviceId !== operation.deviceId || receipt.entityType !== operation.entityType ||
      receipt.entityId !== operation.entityId || receipt.operation !== operation.operation) {
      throw new SyncApiError('INVALID_SYNC_RESPONSE', 'Apply receipts do not match requested operations', false)
    }
    ids.push(...selected[index].coveredMutationIds)
  }
  if (receipts.size !== selected.length) {
    throw new SyncApiError('INVALID_SYNC_RESPONSE', 'Apply receipt count mismatch', false)
  }
  return [...new Set(ids)]
}

function findLegacyChain(outbox: SyncMutation[], target: SyncMutation) {
  let root = target
  if (target.entityType === 'brewLog') {
    const brewUpsert = outbox.find((item) =>
      item.entityType === 'brewLog' && item.entityId === target.entityId &&
      item.operation === 'upsert')
    const beanId = brewUpsert ? referencedBeanId(brewUpsert) : null
    const beanRoot = beanId === null ? undefined : outbox.find((item) =>
      item.entityType === 'bean' && item.entityId === beanId)
    if (beanRoot) root = beanRoot
  }
  const keys = new Set([entityKey(root)])
  if (root.entityType === 'bean') {
    for (const item of outbox) {
      if (item.entityType === 'brewLog' && item.operation === 'upsert' && referencedBeanId(item) === root.entityId) {
        keys.add(entityKey(item))
      }
    }
  }
  const chain = outbox.filter((item) => keys.has(entityKey(item)))
  if (chain.length === 0 || chain.some((item) => item.status !== 'needs_attention' || item.lastErrorCode !== legacyCode)) {
    throw legacyChainChanged()
  }
  return chain.map((item) => item.mutationId)
}

function cloudCandidates(
  snapshot: SyncSnapshot,
  entityType: SyncMutation['entityType'],
  userId: string,
): LegacyCreateCandidate[] {
  switch (entityType) {
    case 'bean':
      return snapshot.beans.filter((row) => row.user_id === userId).map((row) => ({
        entityType, id: row.id, label: [row.name, row.roaster, row.origin].filter(Boolean).join(' / '),
        updatedAt: row.updated_at, deletedAt: row.deleted_at,
      }))
    case 'brewLog':
      return snapshot.brewLogs.filter((row) => row.user_id === userId).map((row) => ({
        entityType, id: row.id, label: [row.brewed_at, row.method].filter(Boolean).join(' / '),
        updatedAt: row.updated_at, deletedAt: row.deleted_at,
      }))
    case 'brewTemplate':
      return snapshot.brewTemplates.filter((row) => row.user_id === userId).map((row) => ({
        entityType, id: row.id, label: row.name,
        updatedAt: row.updated_at, deletedAt: row.deleted_at,
      }))
    case 'userSettings':
      return snapshot.userSettings?.user_id === userId ? [{
        entityType, id: snapshot.userSettings.user_id, label: 'User settings',
        updatedAt: snapshot.userSettings.updated_at, deletedAt: null,
      }] : []
  }
}

function entityKey(item: SyncMutation) {
  return `${item.entityType}:${item.entityId}`
}

function referencedBeanId(item: SyncMutation) {
  if (item.entityType !== 'brewLog' || item.operation !== 'upsert') return null
  return typeof (item.payload as Record<string, unknown>).bean_id === 'string'
    ? (item.payload as Record<string, unknown>).bean_id as string
    : null
}

function withoutIds(outbox: SyncMutation[], ids: string[]) {
  const removed = new Set(ids)
  return outbox.filter((item) => !removed.has(item.mutationId))
}

function markIdsAttention(outbox: SyncMutation[], ids: string[]) {
  const affected = new Set(ids)
  return outbox.map((item) => affected.has(item.mutationId)
    ? { ...item, status: 'needs_attention' as const }
    : item)
}

function errorCode(error: unknown) {
  if (typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code
  }
  return 'SYNC_FAILED'
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'Sync failed'
}

function isRetryable(error: unknown) {
  return typeof error === 'object' && error !== null && (error as { retryable?: unknown }).retryable === true
}

function isLocalSafetyError(error: unknown) {
  const code = errorCode(error)
  return code === 'LOCAL_SYNC_DATA_CORRUPT' || code === 'STALE_LOCAL_SNAPSHOT'
}

function once(cleanup: () => void) {
  let active = true
  return () => {
    if (!active) return
    active = false
    cleanup()
  }
}

function mutationNotFound() {
  return Object.assign(new Error('Sync mutation not found'), { code: 'LOCAL_SYNC_MUTATION_NOT_FOUND' })
}

function legacyChainChanged() {
  return Object.assign(new Error('Legacy create chain changed'), { code: 'LEGACY_CREATE_CHAIN_CHANGED' })
}
