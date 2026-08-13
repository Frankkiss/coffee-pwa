import { describe, expect, it, vi } from 'vitest'
import {
  beginParsing,
  beginRestore,
  canConfirmFullRollback,
  completeFlow,
  createBackupGenerationGuard,
  createRestoreAttempt,
  failFlow,
  initialBackupFlowState,
  resetFlow,
  showPreview,
  waitForSyncEpoch,
  acceptAsyncResult,
} from './backupFlowModel'

describe('backup flow model', () => {
  it('moves through idle, parsing, preview, restoring and success', () => {
    const parsing = beginParsing(initialBackupFlowState, 1)
    const preview = showPreview(parsing, 1)
    const restoring = beginRestore(preview)
    const success = completeFlow(restoring, '已安全合并')

    expect([parsing.phase, preview.phase, restoring.phase, success.phase])
      .toEqual(['parsing', 'preview', 'restoring', 'success'])
  })

  it('resets an error and ignores completions from stale generations', () => {
    const first = beginParsing(initialBackupFlowState, 1)
    const second = beginParsing(first, 2)
    expect(showPreview(second, 1)).toBe(second)

    const failed = failFlow(second, 2, '读取失败')
    expect(failed).toMatchObject({ phase: 'error', message: '读取失败' })
    expect(resetFlow()).toEqual(initialBackupFlowState)
  })

  it('requires a fresh preview, successful pre-restore download and exact text', () => {
    const qualification = {
      selectedGeneration: 4,
      previewGeneration: 4,
      preRestoreDownloadGeneration: 4,
      confirmation: 'FULL RESTORE',
      invalidRelationCount: 0,
    }
    expect(canConfirmFullRollback(qualification)).toBe(true)
    expect(canConfirmFullRollback({ ...qualification, previewGeneration: 3 })).toBe(false)
    expect(canConfirmFullRollback({ ...qualification, preRestoreDownloadGeneration: null })).toBe(false)
    expect(canConfirmFullRollback({ ...qualification, confirmation: 'full restore' })).toBe(false)
    expect(canConfirmFullRollback({ ...qualification, invalidRelationCount: 1 })).toBe(false)
  })

  it('invalidates stale async work after file, user or mount changes', () => {
    const guard = createBackupGenerationGuard('user-a')
    const first = guard.begin()
    const second = guard.begin()
    expect(guard.isCurrent(first, 'user-a')).toBe(false)
    expect(guard.isCurrent(second, 'user-a')).toBe(true)
    expect(guard.isCurrent(second, 'user-b')).toBe(false)
    guard.dispose()
    expect(guard.isCurrent(second, 'user-a')).toBe(false)
  })

  it.each(['safe merge', 'full rollback'])(
    'does not publish a deferred %s RPC result after its generation changed',
    async () => {
      let current = true
      let resolveRpc!: (value: string) => void
      const rpc = new Promise<string>((resolve) => { resolveRpc = resolve })
      const publish = vi.fn()
      const completion = rpc.then((result) => acceptAsyncResult(current, result, publish))

      current = false
      resolveRpc('restored')

      await expect(completion).resolves.toBe(false)
      expect(publish).not.toHaveBeenCalled()
    },
  )

  it('keeps one request id for response-loss retries and blocks parallel restore', async () => {
    const ids = ['76000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000002']
    const attempt = createRestoreAttempt(() => ids.shift()!)
    let rejectPending!: (reason: Error) => void
    const pending = new Promise<void>((_resolve, reject) => { rejectPending = reject })
    const operation = vi.fn(async () => pending)

    const first = attempt.run(operation)
    await expect(attempt.run(operation)).rejects.toMatchObject({ code: 'RESTORE_IN_PROGRESS' })
    expect(attempt.requestId()).toBe('76000000-0000-4000-8000-000000000001')
    rejectPending(new Error('response lost'))
    await expect(first).rejects.toThrow('response lost')

    await expect(attempt.run(async () => undefined)).resolves.toBeUndefined()
    expect(attempt.requestId()).toBe('76000000-0000-4000-8000-000000000001')
    attempt.reset()
    expect(attempt.requestId()).toBeNull()
  })

  it('forces sync and waits until the restored epoch is locally adopted', async () => {
    const epochs = [3, 7]
    const run = vi.fn(async () => undefined)
    await expect(waitForSyncEpoch(7, run, async () => epochs.shift()!))
      .resolves.toBe(7)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('does not claim refresh when the target epoch was never adopted', async () => {
    await expect(waitForSyncEpoch(7, async () => undefined, async () => 3, 2))
      .rejects.toMatchObject({ code: 'SYNC_EPOCH_NOT_ADOPTED' })
  })
})
