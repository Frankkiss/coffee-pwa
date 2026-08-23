import type { Bean } from '../beans/beanTypes'
import type { BrewMode, BrewVariant } from '../brews/brewTypes'
import { normalizeBrewVariant } from '../brews/brewMode'

export type RecommendationContext = {
  targetBean: Bean
  mode: BrewMode
  variant: BrewVariant | null
  gear: { brewer: string; grinder: string }
  espressoDoseGrams: number | null
  tasteGoals: string[]
  now: Date
}

export function createRecommendationContext(input: {
  targetBean: Bean
  mode: BrewMode
  variant?: BrewVariant | null
  brewer?: string
  grinder?: string
  espressoDoseGrams?: number | null
  tasteGoals?: string[]
  now?: Date
}): RecommendationContext {
  return {
    targetBean: input.targetBean,
    mode: input.mode,
    variant: normalizeBrewVariant(input.mode, input.variant),
    gear: {
      brewer: input.brewer?.trim() ?? '',
      grinder: input.grinder?.trim() ?? '',
    },
    espressoDoseGrams: input.mode === 'espresso'
      && typeof input.espressoDoseGrams === 'number'
      && Number.isFinite(input.espressoDoseGrams)
      && input.espressoDoseGrams > 0
      ? input.espressoDoseGrams
      : null,
    tasteGoals: [...new Set((input.tasteGoals ?? []).map((goal) => goal.trim()).filter(Boolean))],
    now: input.now ? new Date(input.now) : new Date(),
  }
}
