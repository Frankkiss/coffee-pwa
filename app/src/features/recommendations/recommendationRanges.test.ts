import { expect, it } from 'vitest'
import type { RecommendationContext } from './recommendationContext'
import { getRecommendationAllowedRanges } from './recommendationRanges'

it('keeps iced hot-water ratio and ice-share ranges independent', () => {
  const context = {
    mode: 'iced_pourover',
    variant: null,
  } as RecommendationContext
  const ranges = getRecommendationAllowedRanges(context, {
    method: '冰手冲',
    brewMode: 'iced_pourover',
    brewVariant: null,
    dripper: 'V60',
    grinder: 'C40',
    grindSetting: '20 clicks',
    ratio: '1:10',
    coffeeGrams: 15,
    waterGrams: 150,
    iceGrams: 75,
    beverageGrams: null,
    waterTemperatureC: 92,
    totalTimeSeconds: 120,
  })

  expect(ranges.ratioDenominator).toEqual({ min: 9.5, max: 10.5 })
  expect(ranges.waterGrams).toEqual({ min: 142.5, max: 157.5 })
  expect(ranges.iceGrams).toEqual({ min: 47.5, max: 157.5 })
  expect(ranges.waterGrams!.min).toBeLessThanOrEqual(150)
  expect(ranges.waterGrams!.max).toBeGreaterThanOrEqual(150)
  expect(ranges.iceGrams!.min).toBeLessThanOrEqual(75)
  expect(ranges.iceGrams!.max).toBeGreaterThanOrEqual(75)
})
