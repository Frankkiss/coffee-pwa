import { expect, it } from 'vitest'
import type { AiRecommendationContext } from './aiRecommendationContext'
import { validateAiRecipe } from './aiRecipeValidation'

const context = {
  selection: { mode: 'espresso', variant: null, brewer: 'Flair 58', grinder: 'C40', espressoDoseGrams: 18 },
  rule: {
    recipe: { grindSetting: '8 clicks' },
    allowedRanges: {
      ratioDenominator: { min: 1.5, max: 3 }, waterTemperatureC: { min: 85, max: 96 },
      coffeeGrams: { min: 18, max: 18 }, waterGrams: null, iceGrams: null,
      beverageGrams: { min: 27, max: 54 }, totalTimeSeconds: { min: 20, max: 40 },
    },
  },
} as AiRecommendationContext

const valid = {
  method: '意式', brewMode: 'espresso' as const, brewVariant: null, dripper: 'Flair 58', grinder: 'C40',
  grindSetting: '8 clicks', waterTemperatureC: 92, coffeeGrams: 18, waterGrams: null,
  iceGrams: null, beverageGrams: 36, ratio: '1:2', totalTimeSeconds: 28,
}

it('rejects DeepSeek recipes that change locks or exceed rule ranges', () => {
  expect(validateAiRecipe(valid, context)).toEqual(valid)
  expect(validateAiRecipe({ ...valid, coffeeGrams: 19 }, context)).toBeNull()
  expect(validateAiRecipe({ ...valid, ratio: '1:4' }, context)).toBeNull()
  expect(validateAiRecipe({ ...valid, beverageGrams: 54 }, context)).toBeNull()
  expect(validateAiRecipe({ ...valid, dripper: 'V60' }, context)).toBeNull()
})

it('validates iced pour-over ratio from hot water without ice', () => {
  const icedContext = {
    selection: { mode: 'iced_pourover', variant: null, brewer: 'V60', grinder: 'C40', espressoDoseGrams: null },
    rule: {
      recipe: { grindSetting: '20 clicks' },
      allowedRanges: {
        ratioDenominator: { min: 7, max: 12 }, waterTemperatureC: { min: 88, max: 96 },
        coffeeGrams: { min: 15, max: 15 }, waterGrams: { min: 145, max: 155 },
        iceGrams: { min: 70, max: 80 }, beverageGrams: null,
        totalTimeSeconds: { min: 90, max: 150 },
      },
    },
  } as AiRecommendationContext
  const icedRecipe = {
    method: '冰手冲', brewMode: 'iced_pourover' as const, brewVariant: null,
    dripper: 'V60', grinder: 'C40', grindSetting: '20 clicks', waterTemperatureC: 92,
    coffeeGrams: 15, waterGrams: 150, iceGrams: 75, beverageGrams: null,
    ratio: '1:10', totalTimeSeconds: 120,
  }

  expect(validateAiRecipe(icedRecipe, icedContext)).toEqual(icedRecipe)
  expect(validateAiRecipe({ ...icedRecipe, ratio: '1:15' }, icedContext)).toBeNull()
})
