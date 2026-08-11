import type { RetryMutationResult } from './syncManager'

type AttentionAction = 'retry' | 'confirm' | 'discard'

type AttentionActions = {
  retryMutation: (
    mutationId: string,
    options?: { confirmLegacyCreate?: boolean },
  ) => Promise<RetryMutationResult>
  discardMutation: (mutationId: string) => Promise<void>
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
