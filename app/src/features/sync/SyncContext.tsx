/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { createBeanRepository } from '../beans/beanRepository'
import { createBrewLogRepository } from '../brews/brewLogRepository'
import { createBrewTemplateRepository } from '../brewTemplates/brewTemplateRepository'
import { createRecommendationRepository } from '../recommendations/recommendationRepository'
import { createUserSettingsRepository } from '../settings/userSettingsRepository'
import { migrateLegacyOfflineData } from './legacyMigration'
import { createLocalRepository, type LocalRepository } from './localRepository'
import { createSyncApi } from './syncApi'
import { withSyncLock } from './syncLock'
import {
  createSyncManager,
  type RetryMutationResult,
} from './syncManager'
import { subscribeToSyncWakeups } from './syncRealtime'
import type { RepositoryContext } from './repositoryContext'
import type { SyncMutation, SyncState } from './syncTypes'
import {
  aggregateCurrentUserOutbox,
  completeDiscardAndRefresh,
  createRuntimeGeneration,
  createRuntimeSuspensionController,
  type EntitySyncStatus,
} from './syncRuntimeModel'

const deviceIdStorageKey = 'kaday:sync-device-id'

export type SyncRepositories = {
  beans: ReturnType<typeof createBeanRepository>
  brewLogs: ReturnType<typeof createBrewLogRepository>
  brewTemplates: ReturnType<typeof createBrewTemplateRepository>
  recommendations: ReturnType<typeof createRecommendationRepository>
  userSettings: ReturnType<typeof createUserSettingsRepository>
}

export type SyncRuntimeValue = {
  repositories: SyncRepositories | null
  state: SyncState
  run: () => Promise<void>
  pendingCount: number
  outboxLoaded: boolean
  attentionItems: SyncMutation[]
  statusByEntityId: Readonly<Record<string, EntitySyncStatus>>
  retryMutation: (
    mutationId: string,
    options?: { confirmLegacyCreate?: boolean },
  ) => Promise<RetryMutationResult>
  discardMutation: (mutationId: string) => Promise<void>
  suspendForSignOut: () => () => void
  initializationError: string | null
}

type RuntimeManager = ReturnType<typeof createSyncManager>

const initialState: SyncState = {
  kind: 'retrying',
  pendingCount: 0,
  message: '正在准备本地同步',
}

const unavailable = async (): Promise<never> => {
  throw new Error('同步服务仍在初始化，请稍后再试。')
}

const SyncRuntimeContext = createContext<SyncRuntimeValue | null>(null)

export function SyncProvider({
  session,
  supabase,
  children,
}: {
  session: Session
  supabase: SupabaseClient
  children: ReactNode
}) {
  const sessionGenerationKey = `${session.user.id}:${session.expires_at ?? 'active'}`
  return (
    <SessionSyncProvider key={sessionGenerationKey} userId={session.user.id} supabase={supabase}>
      {children}
    </SessionSyncProvider>
  )
}

function SessionSyncProvider({
  userId,
  supabase,
  children,
}: {
  userId: string
  supabase: SupabaseClient
  children: ReactNode
}) {
  const [repositories, setRepositories] = useState<SyncRepositories | null>(null)
  const [state, setState] = useState<SyncState>(initialState)
  const [outboxView, setOutboxView] = useState(() =>
    aggregateCurrentUserOutbox(userId, []),
  )
  const [initializationError, setInitializationError] = useState<string | null>(null)
  const [outboxLoaded, setOutboxLoaded] = useState(false)
  const [runtimeGenerationId, setRuntimeGenerationId] = useState(0)
  const managerRef = useRef<RuntimeManager | null>(null)
  const refreshRef = useRef<() => Promise<void>>(async () => undefined)
  const stopRuntimeRef = useRef<() => void>(() => undefined)
  const [suspensionController] = useState(() =>
    createRuntimeSuspensionController({
      restart: () => setRuntimeGenerationId((current) => current + 1),
    }),
  )

  useEffect(() => {
    suspensionController.mount()
    return () => suspensionController.unmount()
  }, [suspensionController])

  useEffect(() => {
    if (suspensionController.isSuspended()) return
    let current = true
    let unsubscribeState: (() => void) | null = null
    const localRepository = createLocalRepository()
    const migrationController = new AbortController()
    let deviceId = ''

    const refreshOutbox = async () => {
      try {
        const outbox = await localRepository.listOutbox(userId)
        if (current) {
          setOutboxView(aggregateCurrentUserOutbox(userId, outbox))
          setOutboxLoaded(true)
        }
      } catch (error) {
        if (current) {
          setOutboxLoaded(false)
          setInitializationError(toSafeInitializationMessage(error))
          setState({ kind: 'needs_attention', pendingCount: 0, attentionCount: 1 })
        }
      }
    }
    refreshRef.current = refreshOutbox

    const generation = createRuntimeGeneration({
      migrate: async () => {
        deviceId = readOrCreateDeviceId(window.localStorage)
        const epoch = await localRepository.readSyncEpoch(userId)
        if (!current) return
        await migrateLegacyOfflineData(
          userId,
          deviceId,
          epoch,
          {},
          migrationController.signal,
        )
      },
      createManager: () => {
        const api = createSyncApi(supabase)
        const repositoryContext: RepositoryContext = {
          userId,
          deviceId,
          getSyncEpoch: () => localRepository.readSyncEpoch(userId),
          now: () => new Date(),
        }
        const nextRepositories = createRepositories(localRepository, repositoryContext)
        const manager = createSyncManager({
          userId,
          deviceId,
          api,
          storage: localRepository,
          lock: withSyncLock,
          now: () => new Date(),
          online: () => navigator.onLine,
          schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
          cancelSchedule: (id) => window.clearTimeout(id),
          events: createBrowserSyncEvents(),
          subscribeWakeups: (ownerId, wake) =>
            subscribeToSyncWakeups(supabase, ownerId, wake),
        })
        if (current) setRepositories(nextRepositories)
        return manager
      },
      cancelMigration: () => migrationController.abort(),
      onReady: (readyManager) => {
        if (!current) return
        managerRef.current = readyManager
        setState(readyManager.getState())
        unsubscribeState = readyManager.subscribe((next) => {
          if (!current) return
          setState(next)
          void refreshOutbox()
        })
        void readyManager.run()
        void refreshOutbox()
      },
      onError: (error) => {
        if (!current) return
        if (isMigrationCancellation(error)) return
        setInitializationError(toSafeInitializationMessage(error))
        setState({ kind: 'needs_attention', pendingCount: 0, attentionCount: 1 })
      },
    })
    const stopRuntime = () => {
      if (!current) return
      current = false
      unsubscribeState?.()
      unsubscribeState = null
      generation.stop()
      managerRef.current = null
    }
    stopRuntimeRef.current = stopRuntime
    void generation.start()

    return () => {
      stopRuntime()
      if (stopRuntimeRef.current === stopRuntime) {
        stopRuntimeRef.current = () => undefined
      }
    }
  }, [runtimeGenerationId, supabase, suspensionController, userId])

  const run = useCallback(async () => {
    const manager = managerRef.current
    if (!manager) return unavailable()
    await manager.run()
    await refreshRef.current()
  }, [])
  const retryMutation = useCallback(
    async (mutationId: string, options?: { confirmLegacyCreate?: boolean }) => {
      const manager = managerRef.current
      if (!manager) return unavailable()
      const result = await manager.retryMutation(mutationId, options)
      await refreshRef.current()
      return result
    },
    [],
  )
  const discardMutation = useCallback(async (mutationId: string) => {
    const manager = managerRef.current
    if (!manager) return unavailable()
    await completeDiscardAndRefresh(manager, mutationId, refreshRef.current)
  }, [])
  const suspendForSignOut = useCallback(
    () => suspensionController.suspend(() => stopRuntimeRef.current()),
    [suspensionController],
  )

  const value = useMemo<SyncRuntimeValue>(() => ({
    repositories,
    state,
    run,
    pendingCount: outboxView.pendingCount,
    outboxLoaded,
    attentionItems: outboxView.attentionItems,
    statusByEntityId: outboxView.statusByEntityId,
    retryMutation,
    discardMutation,
    suspendForSignOut,
    initializationError,
  }), [
    discardMutation,
    initializationError,
    outboxView,
    outboxLoaded,
    repositories,
    retryMutation,
    run,
    state,
    suspendForSignOut,
  ])

  return <SyncRuntimeContext.Provider value={value}>{children}</SyncRuntimeContext.Provider>
}

export function useSyncRuntime() {
  const value = useContext(SyncRuntimeContext)
  if (value === null) {
    throw new Error('useSyncRuntime 必须在已认证的 SyncProvider 内使用。')
  }
  return value
}

function createRepositories(
  localRepository: LocalRepository,
  context: RepositoryContext,
): SyncRepositories {
  return {
    beans: createBeanRepository(localRepository, context),
    brewLogs: createBrewLogRepository(localRepository, context),
    brewTemplates: createBrewTemplateRepository(localRepository, context),
    recommendations: createRecommendationRepository(localRepository, context),
    userSettings: createUserSettingsRepository(localRepository, context),
  }
}

function readOrCreateDeviceId(storage: Storage) {
  const stored = storage.getItem(deviceIdStorageKey)
  if (stored && isUuid(stored)) return stored
  const deviceId = crypto.randomUUID()
  storage.setItem(deviceIdStorageKey, deviceId)
  return deviceId
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function createBrowserSyncEvents() {
  return {
    subscribeOnline(callback: () => void) {
      window.addEventListener('online', callback)
      return () => window.removeEventListener('online', callback)
    },
    subscribeVisibility(callback: () => void) {
      document.addEventListener('visibilitychange', callback)
      return () => document.removeEventListener('visibilitychange', callback)
    },
    isVisible: () => document.visibilityState !== 'hidden',
  }
}

function toSafeInitializationMessage(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : ''
  if (code.startsWith('LEGACY_MIGRATION_')) {
    return '旧版离线数据需要先恢复处理；原数据仍保留在本机。'
  }
  if (error instanceof Error && /indexeddb/i.test(error.message)) {
    return '此浏览器暂时无法使用本地安全存储；没有清除任何本地数据。'
  }
  return '本地同步暂时无法启动；没有清除任何本地数据。'
}

function isMigrationCancellation(error: unknown) {
  return typeof error === 'object' && error !== null &&
    'code' in error && error.code === 'LEGACY_MIGRATION_CANCELLED'
}
