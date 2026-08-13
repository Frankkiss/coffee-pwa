export type SyncBuildRolloutMode = 'pilot' | 'enabled' | 'protection'
export type EffectiveSyncMode = 'enabled' | 'protection'

export const syncPilotStorageKey = 'kaday:sync-pilot-enabled'

export class SyncProtectionModeError extends Error {
  readonly code = 'SYNC_PROTECTION_MODE'

  constructor() {
    super('同步写入已暂停；现有数据仍可查看与导出。')
    this.name = 'SyncProtectionModeError'
  }
}

export function resolveSyncRolloutMode({
  buildValue,
  localOverride,
}: {
  buildValue: unknown
  localOverride: string | null
}): EffectiveSyncMode {
  if (buildValue === 'enabled') return 'enabled'
  if (buildValue === 'protection') return 'protection'
  if (buildValue === 'pilot') {
    return localOverride === 'true' ? 'enabled' : 'protection'
  }
  return 'protection'
}

export function readSyncRolloutMode(
  buildValue: unknown,
  storage: Pick<Storage, 'getItem'>,
): EffectiveSyncMode {
  if (buildValue !== 'pilot') {
    return resolveSyncRolloutMode({ buildValue, localOverride: null })
  }
  try {
    return resolveSyncRolloutMode({
      buildValue,
      localOverride: storage.getItem(syncPilotStorageKey),
    })
  } catch {
    return 'protection'
  }
}

export function assertSyncWritesEnabled(mode: EffectiveSyncMode) {
  if (mode === 'protection') throw new SyncProtectionModeError()
}
