import type { AiRecommendationContext } from './aiRecommendationContext'
import type {
  StructuredAiBrewStep,
  StructuredAiRecipe,
  StructuredAiStepTarget,
} from './recommendationTypes'

export function validateAiBrewSteps(
  steps: StructuredAiBrewStep[],
  recipe: StructuredAiRecipe,
  context: AiRecommendationContext,
) {
  if (steps.length < 1 || steps.length > 8) return false

  const allowed: Set<StructuredAiStepTarget> = context.selection.mode === 'espresso'
    ? new Set(['beverage', 'none'])
    : context.selection.mode === 'hot_pourover'
      ? new Set(['water', 'none'])
      : new Set(['water', 'ice', 'none'])

  if (steps.some((step) => !allowed.has(step.targetType))) return false
  if (steps.some((step, index) => !validStep(step, steps[index - 1]))) return false
  if (
    (context.selection.mode === 'cold_brew' || context.selection.mode === 'espresso')
    && steps.some((step) => /绕圈|闷蒸|分段注水/.test(step.action))
  ) return false

  return matchesFinal(steps, 'water', recipe.waterGrams)
    && matchesFinal(steps, 'ice', recipe.iceGrams ?? null)
    && matchesFinal(steps, 'beverage', recipe.beverageGrams ?? null)
}

function validStep(step: StructuredAiBrewStep, previous?: StructuredAiBrewStep) {
  if (!step.label || !step.action || step.startSeconds === null || step.startSeconds < 0) {
    return false
  }
  if (previous?.startSeconds !== null && previous?.startSeconds !== undefined
    && step.startSeconds < previous.startSeconds) return false
  if (step.endSeconds !== null && step.endSeconds < step.startSeconds) return false
  return step.targetType === 'none'
    ? step.targetGrams === null
    : step.targetGrams !== null && Number.isFinite(step.targetGrams) && step.targetGrams > 0
}

function matchesFinal(
  steps: StructuredAiBrewStep[],
  type: StructuredAiStepTarget,
  expected: number | null,
) {
  const values = steps
    .filter((step) => step.targetType === type)
    .map((step) => step.targetGrams)
  if (expected === null) return values.length === 0
  return values.length > 0
    && values.every((value, index) => value !== null && (index === 0 || value >= (values[index - 1] ?? 0)))
    && Math.abs((values.at(-1) ?? 0) - expected) <= 0.1
}
