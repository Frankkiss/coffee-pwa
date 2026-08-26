import type { BrewLog, BrewMode } from '../brews/brewTypes'
import { parseRatioDenominator } from './recommendationPolicy'

export type HistoryRecipeFacts = {
  ratio: string | null
  ratioSource: 'weights' | 'recorded' | null
  eligible: boolean
}

export function analyzeHistoryRecipe(log: BrewLog, mode: BrewMode): HistoryRecipeFacts {
  const coffee = positive(log.coffee_grams)
  const water = positive(log.water_grams)
  const ice = positive(log.ice_grams)
  const beverage = positive(log.beverage_grams)
  const weightedDenominator = coffee === null ? null
    : mode === 'espresso' && beverage !== null ? beverage / coffee
    : mode === 'iced_pourover' && water !== null && ice !== null ? (water + ice) / coffee
    : mode !== 'espresso' && mode !== 'iced_pourover' && water !== null ? water / coffee
    : null
  const recordedDenominator = parseRatioDenominator(log.ratio)
  const denominator = weightedDenominator ?? recordedDenominator
  const ratio = denominator === null ? null : formatRatio(denominator)
  const eligible = coffee !== null && denominator !== null
    && (mode !== 'iced_pourover' || weightedDenominator !== null)

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
