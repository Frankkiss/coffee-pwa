import type { SyncMutation } from './syncTypes'

export type EntitySyncStatus = 'synced' | 'pending' | 'needs_attention'

type RuntimeGenerationOptions<Manager extends { start(): void; stop(): void }> = {
  migrate: () => Promise<unknown>
  createManager: () => Manager
  cancelMigration?: () => void
  onReady: (manager: Manager) => void
  onError: (error: unknown) => void
}

export function createRuntimeGeneration<
  Manager extends { start(): void; stop(): void },
>(options: RuntimeGenerationOptions<Manager>) {
  let active = true
  let manager: Manager | null = null
  let initialization: Promise<void> | null = null

  return {
    start() {
      if (initialization !== null) return initialization
      initialization = (async () => {
        try {
          await options.migrate()
          if (!active) return
          manager = options.createManager()
          if (!active) {
            manager = null
            return
          }
          manager.start()
          options.onReady(manager)
        } catch (error) {
          if (active) options.onError(error)
        }
      })()
      return initialization
    },
    stop() {
      if (!active) return
      active = false
      options.cancelMigration?.()
      const current = manager
      manager = null
      current?.stop()
    },
  }
}

export function aggregateCurrentUserOutbox(
  userId: string,
  outbox: SyncMutation[],
) {
  const owned = outbox.filter((item) => item.userId === userId)
  const attentionItems = owned.filter((item) => item.status === 'needs_attention')
  const pendingCount = owned.filter(
    (item) => item.status === 'pending' || item.status === 'syncing',
  ).length
  const statusByEntityId: Record<string, EntitySyncStatus> = {}
  for (const item of owned) {
    const next = item.status === 'needs_attention' ? 'needs_attention' : 'pending'
    if (
      next === 'needs_attention' ||
      statusByEntityId[item.entityId] !== 'needs_attention'
    ) {
      statusByEntityId[item.entityId] = next
    }
  }
  return { pendingCount, attentionItems, statusByEntityId }
}

export async function completeDiscardAndRefresh(
  manager: {
    discardMutation(mutationId: string): Promise<void>
    run(): Promise<void>
  },
  mutationId: string,
  refresh: () => Promise<void>,
) {
  await manager.discardMutation(mutationId)
  await manager.run()
  await refresh()
}
