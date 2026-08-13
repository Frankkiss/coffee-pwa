export type BackupFlowState = {
  phase: 'idle' | 'parsing' | 'preview' | 'restoring' | 'success' | 'error'
  generation: number
  message: string
}

export const initialBackupFlowState: BackupFlowState = {
  phase: 'idle',
  generation: 0,
  message: '',
}

export function beginParsing(_state: BackupFlowState, generation: number): BackupFlowState {
  return { phase: 'parsing', generation, message: '' }
}

export function showPreview(state: BackupFlowState, generation: number): BackupFlowState {
  if (state.generation !== generation) return state
  return { ...state, phase: 'preview', message: '' }
}

export function beginRestore(state: BackupFlowState): BackupFlowState {
  if (state.phase !== 'preview' && state.phase !== 'error') return state
  return { ...state, phase: 'restoring', message: '' }
}

export function completeFlow(state: BackupFlowState, message: string): BackupFlowState {
  if (state.phase !== 'restoring') return state
  return { ...state, phase: 'success', message }
}

export function failFlow(
  state: BackupFlowState,
  generation: number,
  message: string,
): BackupFlowState {
  if (state.generation !== generation) return state
  return { ...state, phase: 'error', message }
}

export function resetFlow(): BackupFlowState {
  return initialBackupFlowState
}

export function canConfirmFullRollback(input: {
  selectedGeneration: number
  previewGeneration: number | null
  preRestoreDownloadGeneration: number | null
  confirmation: string
  invalidRelationCount: number
}) {
  return input.previewGeneration === input.selectedGeneration
    && input.preRestoreDownloadGeneration === input.selectedGeneration
    && input.confirmation === 'FULL RESTORE'
    && input.invalidRelationCount === 0
}

export function createBackupGenerationGuard(userId: string) {
  let generation = 0
  let active = true
  return {
    begin() {
      generation += 1
      return generation
    },
    invalidate() {
      generation += 1
    },
    isCurrent(token: number, currentUserId: string) {
      return active && currentUserId === userId && token === generation
    },
    dispose() {
      active = false
      generation += 1
    },
  }
}

export function createRestoreAttempt(createId: () => string) {
  let restoreRequestId: string | null = null
  let running = false
  return {
    requestId: () => restoreRequestId,
    async run<T>(operation: (requestId: string) => Promise<T>): Promise<T> {
      if (running) {
        throw Object.assign(new Error('恢复正在执行'), { code: 'RESTORE_IN_PROGRESS' })
      }
      running = true
      restoreRequestId ??= createId()
      try {
        return await operation(restoreRequestId)
      } finally {
        running = false
      }
    },
    reset() {
      if (!running) restoreRequestId = null
    },
  }
}

export async function waitForSyncEpoch(
  targetEpoch: number,
  run: () => Promise<void>,
  readEpoch: () => Promise<number>,
  maxAttempts = 3,
) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await run()
    const epoch = await readEpoch()
    if (epoch === targetEpoch) return epoch
    if (epoch > targetEpoch) return epoch
  }
  throw Object.assign(new Error('恢复已提交，但本机尚未完成重新同步'), {
    code: 'SYNC_EPOCH_NOT_ADOPTED',
  })
}

export function acceptAsyncResult<T>(
  current: boolean,
  value: T,
  publish: (value: T) => void,
) {
  if (!current) return false
  publish(value)
  return true
}
