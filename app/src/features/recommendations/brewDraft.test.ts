import { expect, it } from 'vitest'
import type { RuleRecommendationResult } from './recommendationTypes'
import { toBrewDraft } from './brewDraft'

it('maps iced pour-over rule measurements into an unsaved editable form', () => {
  const draft = toBrewDraft(createRule({
    method: '冰手冲', brewMode: 'iced_pourover', brewVariant: null, dripper: 'V60', grinder: 'C40',
    grindSetting: '24', coffeeGrams: 15, waterGrams: 150, iceGrams: 90, beverageGrams: null,
    ratio: '1:16', waterTemperatureC: 92, totalTimeSeconds: 150,
  }), null)
  expect(draft).toMatchObject({ beanId: 'bean-1', brewMode: 'iced_pourover', waterGrams: '150', iceGrams: '90', beverageGrams: '' })
})

it('maps espresso output and keeps water empty', () => {
  const draft = toBrewDraft(createRule({
    method: '意式', brewMode: 'espresso', brewVariant: null, dripper: 'Flair 58', grinder: 'C40',
    grindSetting: '8', coffeeGrams: 18, waterGrams: null, iceGrams: null, beverageGrams: 36,
    ratio: '1:2', waterTemperatureC: 92, totalTimeSeconds: 28,
  }), null)
  expect(draft).toMatchObject({ coffeeGrams: '18', beverageGrams: '36', waterGrams: '' })
})

function createRule(recommended: RuleRecommendationResult['recommended']): RuleRecommendationResult {
  return {
    targetBean: { id: 'bean-1' } as never, primary: null, references: [], templateCandidates: [],
    recommended, confidence: 'high', baseSource: { type: 'history', label: '豆', brewLogId: 'brew' }, beanAdjustmentReasons: [],
  }
}
