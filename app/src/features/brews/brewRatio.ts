import { normalizeBrewMode } from './brewMode'
import type { BrewLog, BrewMode } from './brewTypes'

export function deriveRatioFromMasses(
  mode: BrewMode | null,
  coffeeGrams: number | null | undefined,
  waterGrams: number | null | undefined,
  beverageGrams: number | null | undefined,
) {
  const coffee = positive(coffeeGrams)
  const ratioMass = mode === 'espresso' ? positive(beverageGrams) : positive(waterGrams)
  if (coffee === null || ratioMass === null) return null
  return formatRatio(ratioMass / coffee)
}

export function getCanonicalBrewRatio(log: BrewLog) {
  const mode = normalizeBrewMode(log)
  if (mode !== 'iced_pourover') return log.ratio
  return deriveRatioFromMasses(mode, log.coffee_grams, log.water_grams, log.beverage_grams)
}

function positive(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function formatRatio(value: number) {
  return `1:${Number.isInteger(value) ? value : value.toFixed(1)}`
}
