import type { RetryMutationResult } from './syncManager'
import type { createAttentionActionGuard } from './syncAttentionModel'

export type AttentionAction = 'retry' | 'confirm' | 'discard'

export type AttentionActions = {
  retryMutation: (
    mutationId: string,
    options?: { confirmLegacyCreate?: boolean },
  ) => Promise<RetryMutationResult>
  discardMutation: (mutationId: string) => Promise<void>
}

export async function runGuardedAttentionAction(input: {
  guard: ReturnType<typeof createAttentionActionGuard>
  itemKey: string
  action: AttentionAction
  mutationId: string
  actions: AttentionActions
  onResult: (result: RetryMutationResult | null) => void
  onError: (error: unknown) => void
  onSettled: () => void
}) {
  const token = input.guard.begin(input.itemKey)
  try {
    const result = await performAttentionAction(
      input.action,
      input.mutationId,
      input.actions,
    )
    if (input.guard.isCurrent(token, input.itemKey)) input.onResult(result)
  } catch (error) {
    if (input.guard.isCurrent(token, input.itemKey)) input.onError(error)
  } finally {
    if (input.guard.isCurrent(token, input.itemKey)) input.onSettled()
  }
}

export async function performAttentionAction(
  action: AttentionAction,
  mutationId: string,
  actions: AttentionActions,
): Promise<RetryMutationResult | null> {
  if (action === 'discard') {
    await actions.discardMutation(mutationId)
    return null
  }
  return actions.retryMutation(
    mutationId,
    action === 'confirm' ? { confirmLegacyCreate: true } : undefined,
  )
}
