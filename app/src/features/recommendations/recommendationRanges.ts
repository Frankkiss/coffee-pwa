import type { RecommendationContext } from './recommendationContext'
import type {
  RecommendedBrewParameters,
  RecommendationAllowedRanges,
} from './recommendationTypes'

export function getRecommendationAllowedRanges(
  context: RecommendationContext,
  recipe: RecommendedBrewParameters,
): RecommendationAllowedRanges {
  const coffee = recipe.coffeeGrams ?? (context.mode === 'cold_brew' ? 50 : 15)
  const ratio = context.mode === 'cold_brew'
    ? (context.variant === 'concentrate' ? { min: 7, max: 10 } : { min: 12, max: 16 })
    : context.mode === 'espresso' ? { min: 1.5, max: 3 } : { min: 14, max: 18 }
  const totalMin = coffee * ratio.min
  const totalMax = coffee * ratio.max

  if (context.mode === 'espresso') {
    return {
      ratioDenominator: ratio,
      waterTemperatureC: { min: 85, max: 96 },
      coffeeGrams: fixed(coffee),
      waterGrams: null,
      iceGrams: null,
      beverageGrams: { min: totalMin, max: totalMax },
      totalTimeSeconds: { min: 20, max: 40 },
    }
  }
  if (context.mode === 'cold_brew') {
    return {
      ratioDenominator: ratio,
      waterTemperatureC: { min: 4, max: 8 },
      coffeeGrams: fixed(coffee),
      waterGrams: { min: totalMin, max: totalMax },
      iceGrams: null,
      beverageGrams: null,
      totalTimeSeconds: { min: 28_800, max: 64_800 },
    }
  }
  if (context.mode === 'iced_pourover') {
    return {
      ratioDenominator: ratio,
      waterTemperatureC: { min: 85, max: 96 },
      coffeeGrams: fixed(coffee),
      waterGrams: { min: totalMin * 0.55, max: totalMax * 0.75 },
      iceGrams: { min: totalMin * 0.25, max: totalMax * 0.45 },
      beverageGrams: null,
      totalTimeSeconds: { min: 90, max: 300 },
    }
  }
  return {
    ratioDenominator: ratio,
    waterTemperatureC: { min: 84, max: 96 },
    coffeeGrams: fixed(coffee),
    waterGrams: { min: totalMin, max: totalMax },
    iceGrams: null,
    beverageGrams: null,
    totalTimeSeconds: { min: 90, max: 300 },
  }
}

function fixed(value: number) {
  return { min: value, max: value }
}
