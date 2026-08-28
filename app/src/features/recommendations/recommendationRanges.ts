import type { RecommendationContext } from './recommendationContext'
import type { BrewTemplate } from '../brewTemplates/brewTemplateTypes'
import {
  getFallbackRatioRange,
  getLocalRatioRange,
  getRatioEnvelope,
} from './recommendationPolicy'
import type {
  RecommendedBrewParameters,
  RecommendationAllowedRanges,
} from './recommendationTypes'

export function getRecommendationAllowedRanges(
  context: RecommendationContext,
  recipe: RecommendedBrewParameters,
  baseTemplate: BrewTemplate | null = null,
): RecommendationAllowedRanges {
  const coffee = recipe.coffeeGrams ?? (context.mode === 'cold_brew' ? 50 : 15)
  const envelope = getRatioEnvelope(context.mode, context.variant)
  const ratio = recipe.ratio
    ? getLocalRatioRange(recipe.ratio, envelope)
    : getFallbackRatioRange(context.mode, context.variant)
  const totalMin = coffee * ratio.min
  const totalMax = coffee * ratio.max
  const sourceTemperature = baseTemplate?.waterTemperatureC ?? null
  const sourceTime = baseTemplate?.targetTimeSeconds ?? null

  if (context.mode === 'espresso') {
    return {
      ratioDenominator: ratio,
      waterTemperatureC: sourceTemperature ?? { min: 85, max: 96 },
      coffeeGrams: fixed(coffee),
      waterGrams: null,
      iceGrams: null,
      beverageGrams: { min: totalMin, max: totalMax },
      totalTimeSeconds: sourceTime ?? { min: 20, max: 40 },
    }
  }
  if (context.mode === 'cold_brew') {
    return {
      ratioDenominator: ratio,
      waterTemperatureC: sourceTemperature ?? { min: 4, max: 8 },
      coffeeGrams: fixed(coffee),
      waterGrams: { min: totalMin, max: totalMax },
      iceGrams: null,
      beverageGrams: null,
      totalTimeSeconds: sourceTime ?? { min: 28_800, max: 64_800 },
    }
  }
  if (context.mode === 'iced_pourover') {
    return {
      ratioDenominator: ratio,
      waterTemperatureC: sourceTemperature ?? { min: 86, max: 96 },
      coffeeGrams: fixed(coffee),
      waterGrams: { min: totalMin, max: totalMax },
      iceGrams: { min: totalMin / 3, max: totalMax },
      beverageGrams: null,
      totalTimeSeconds: sourceTime ?? { min: 90, max: 300 },
    }
  }
  return {
    ratioDenominator: ratio,
    waterTemperatureC: sourceTemperature ?? { min: 84, max: 96 },
    coffeeGrams: fixed(coffee),
    waterGrams: { min: totalMin, max: totalMax },
    iceGrams: null,
    beverageGrams: null,
    totalTimeSeconds: sourceTime ?? { min: 90, max: 300 },
  }
}

function fixed(value: number) {
  return { min: value, max: value }
}
