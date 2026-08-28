import type { BrewMode, BrewVariant } from '../brews/brewTypes'
import type { RecommendationNumericRange } from './recommendationTypes'

export function getRatioEnvelope(
  mode: BrewMode,
  variant: BrewVariant | null,
): RecommendationNumericRange {
  if (mode === 'cold_brew') {
    return variant === 'concentrate' ? range(5, 10) : range(12, 16)
  }
  if (mode === 'espresso') return range(1.5, 3)
  if (mode === 'iced_pourover') return range(7, 12)
  return range(14, 18)
}

export function getFallbackRatioRange(
  mode: BrewMode,
  variant: BrewVariant | null,
): RecommendationNumericRange {
  if (mode === 'cold_brew' && variant === 'concentrate') return range(7, 10)
  return getRatioEnvelope(mode, variant)
}

export function getLocalRatioRange(
  ratioText: string | null,
  envelope: RecommendationNumericRange,
): RecommendationNumericRange {
  const denominator = parseRatioDenominator(ratioText)
  if (denominator === null) return envelope
  return range(
    Math.max(envelope.min, denominator - 0.5),
    Math.min(envelope.max, denominator + 0.5),
  )
}

export function parseRatioDenominator(ratioText: string | null): number | null {
  const value = ratioText?.match(/1\s*:\s*(\d+(?:\.\d+)?)/)?.[1]
  if (!value) return null
  const denominator = Number(value)
  return Number.isFinite(denominator) && denominator > 0 ? denominator : null
}

function range(min: number, max: number): RecommendationNumericRange {
  return { min, max }
}
