import { describe, expect, it, vi } from 'vitest'
import { performAttentionAction } from './syncStatusActions'

describe('performAttentionAction', () => {
  it('does not confirm a legacy create during the first retry', async () => {
    const retryMutation = vi.fn().mockResolvedValue({
      status: 'confirmation_required',
      preview: { target: {}, relatedMutationIds: [], cloudCandidates: [] },
    })

    const result = await performAttentionAction('retry', 'mutation-1', {
      retryMutation,
      discardMutation: vi.fn(),
    })

    expect(retryMutation).toHaveBeenCalledWith('mutation-1', undefined)
    expect(result?.status).toBe('confirmation_required')
  })

  it('passes explicit confirmation only for the second legacy action', async () => {
    const retryMutation = vi.fn().mockResolvedValue({ status: 'retried' })
    await performAttentionAction('confirm', 'mutation-1', {
      retryMutation,
      discardMutation: vi.fn(),
    })
    expect(retryMutation).toHaveBeenCalledWith('mutation-1', {
      confirmLegacyCreate: true,
    })
  })

  it('does not resolve discard until the manager transaction completes', async () => {
    let finish!: () => void
    const discardMutation = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    let completed = false
    const operation = performAttentionAction('discard', 'mutation-1', {
      retryMutation: vi.fn(),
      discardMutation,
    }).then(() => { completed = true })

    await Promise.resolve()
    expect(completed).toBe(false)
    finish()
    await operation
    expect(completed).toBe(true)
  })
})
