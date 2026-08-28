import type { BrewLog, BrewMode } from '../brews/brewTypes'
import { deriveRatioFromMasses } from '../brews/brewRatio'
import { parseRatioDenominator } from './recommendationPolicy'

export type HistoryRecipeFacts = {
  ratio: string | null
  ratioSource: 'weights' | 'recorded' | null
  eligible: boolean
}

export function analyzeHistoryRecipe(log: BrewLog, mode: BrewMode): HistoryRecipeFacts {
  const coffee = positive(log.coffee_grams)
  const weightedRatio = deriveRatioFromMasses(mode, coffee, log.water_grams, log.beverage_grams)
  const weightedDenominator = parseRatioDenominator(weightedRatio)
  const recordedDenominator = mode === 'iced_pourover' ? null : parseRatioDenominator(log.ratio)
  const denominator = weightedDenominator ?? recordedDenominator
  const ratio = denominator === null ? null : formatRatio(denominator)
  const eligible = coffee !== null && denominator !== null

  return {
    ratio,
    ratioSource: weightedDenominator !== null
      ? 'weights'
      : recordedDenominator !== null
        ? 'recorded'
        : null,
    eligible,
  }
}

function positive(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function formatRatio(value: number) {
  return `1:${Math.round(value * 10) / 10}`
}
