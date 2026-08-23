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
