import type { AiRecommendationContext } from './aiRecommendationContext'
import type { StructuredAiRecipe } from './recommendationTypes'

export function validateAiRecipe(
  recipe: StructuredAiRecipe,
  context: AiRecommendationContext,
): StructuredAiRecipe | null {
  const selection = context.selection
  if (recipe.brewMode !== selection.mode) return null
  if ((recipe.brewVariant ?? null) !== selection.variant) return null
  if (!same(recipe.dripper, selection.brewer)) return null
  if (!same(recipe.grinder ?? null, selection.grinder)) return null
  if (selection.grinder && recipe.grindSetting !== context.rule.recipe.grindSetting) return null
  if (!inRange(ratioDenominator(recipe.ratio), context.rule.allowedRanges.ratioDenominator)) return null

  const checks: Array<[number | null | undefined, { min: number; max: number } | null]> = [
    [recipe.waterTemperatureC, context.rule.allowedRanges.waterTemperatureC],
    [recipe.coffeeGrams, context.rule.allowedRanges.coffeeGrams],
    [recipe.waterGrams, context.rule.allowedRanges.waterGrams],
    [recipe.iceGrams, context.rule.allowedRanges.iceGrams],
    [recipe.beverageGrams, context.rule.allowedRanges.beverageGrams],
    [recipe.totalTimeSeconds, context.rule.allowedRanges.totalTimeSeconds],
  ]
  if (!hasConsistentMass(recipe, selection.mode)) return null
  if (checks.some(([value, range]) => range ? !inRange(value, range) : value != null)) return null
  if (selection.mode === 'espresso' && recipe.coffeeGrams !== selection.espressoDoseGrams) return null
  return recipe
}

function same(value: string | null, locked: string) {
  return (value ?? '').trim().toLowerCase() === locked.trim().toLowerCase()
}

function inRange(value: number | null | undefined, range: { min: number; max: number }) {
  return typeof value === 'number' && Number.isFinite(value) && value >= range.min && value <= range.max
}

function hasConsistentMass(recipe: StructuredAiRecipe, mode: AiRecommendationContext['selection']['mode']) {
  const coffee = recipe.coffeeGrams
  const denominator = ratioDenominator(recipe.ratio)
  if (coffee === null || denominator === null) return false
  const output = mode === 'espresso'
    ? recipe.beverageGrams
    : mode === 'iced_pourover'
      ? recipe.waterGrams
      : recipe.waterGrams
  return typeof output === 'number' && Math.abs(output / coffee - denominator) <= 0.15
}

function ratioDenominator(value: string | null) {
  const match = value?.match(/^1\s*:\s*(\d+(?:\.\d+)?)$/)
  return match ? Number(match[1]) : null
}
