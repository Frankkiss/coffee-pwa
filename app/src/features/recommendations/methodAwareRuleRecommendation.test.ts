import { describe, expect, it } from 'vitest'
import type { Bean } from '../beans/beanTypes'
import type { BrewLog, BrewMode, BrewVariant } from '../brews/brewTypes'
import { brewTemplates } from '../brewTemplates/brewTemplates'
import { createRecommendationContext } from './recommendationContext'
import { generateMethodAwareRuleRecommendation } from './methodAwareRuleRecommendation'

function bean(overrides: Partial<Bean> = {}): Bean {
  return {
    id: 'bean-1', name: '测试豆', process: '水洗', origin: '埃塞俄比亚',
    farm_or_station: null, variety: 'Heirloom', roast_level: '浅烘',
    roast_date: '2026-08-10', flavor_tags: ['花香', '柑橘'],
    bean_type: 'single_origin', blend_components: [], blend_notes: null,
    altitude_meters: 1900,
    ...overrides,
  } as Bean
}

function log(mode: BrewMode, overrides: Partial<BrewLog> = {}): BrewLog {
  const method = ({ hot_pourover: '热手冲', iced_pourover: '冰手冲', cold_brew: '冷萃', espresso: '意式' } as const)[mode]
  return {
    id: `${mode}-log`, bean_id: 'bean-1', brewed_at: '2026-08-22T10:00:00Z',
    method, brew_mode: mode, brew_variant: null, dripper: 'V60', grinder: 'C40',
    grind_setting: '22 clicks', coffee_grams: 15, water_grams: 225,
    ice_grams: null, beverage_grams: null, ratio: '1:15',
    water_temperature_c: 92, total_time_seconds: 150, rating: 5,
    acidity: null, sweetness: 4, bitterness: 1, astringency: 1,
    body: 3, aftertaste: 4, notes: null,
    ...overrides,
  } as BrewLog
}

function context(mode: BrewMode, variant: BrewVariant | null = null) {
  return createRecommendationContext({
    targetBean: bean(), mode, variant, brewer: mode === 'espresso' ? 'Flair' : 'V60',
    grinder: 'C40', espressoDoseGrams: mode === 'espresso' ? 18 : null,
    tasteGoals: ['甜感'], now: new Date('2026-08-23T12:00:00Z'),
  })
}

describe('method-aware rule recommendation', () => {
  it('never uses history from another brew mode', () => {
    const result = generateMethodAwareRuleRecommendation(
      context('hot_pourover'), [bean()],
      [log('cold_brew', { rating: 5 }), log('hot_pourover', { rating: 4, id: 'hot' })],
      brewTemplates,
    )
    expect(result?.primary?.brewLog.id).toBe('hot')
    expect(result?.references.every((item) => item.recommended.brewMode === 'hot_pourover')).toBe(true)
  })

  it('keeps low-rated same-bean history out of the base while using it for feedback', () => {
    const result = generateMethodAwareRuleRecommendation(
      context('hot_pourover'), [bean()],
      [log('hot_pourover', { id: 'failed', rating: 2, bitterness: 5 })],
      brewTemplates,
    )
    expect(result?.primary).toBeNull()
    expect(result?.feedbackAdjustments).toContainEqual(expect.objectContaining({ source: 'feedback', direction: 'decrease' }))
  })

  it('does not copy a numeric grind setting across grinders', () => {
    const result = generateMethodAwareRuleRecommendation(
      context('hot_pourover'), [bean()],
      [log('hot_pourover', { grinder: 'Kinu', grind_setting: '2.8.0' })],
      brewTemplates,
    )
    expect(result?.recommended.grindSetting).toBeNull()
  })

  it.each([
    [1, false, 'low'],
    [2, false, 'low'],
    [3, true, 'low'],
    [4, true, 'high'],
    [5, true, 'high'],
  ] as const)('applies the base-recipe rating gate for rating %s', (rating, canBeBase, confidence) => {
    const result = generateMethodAwareRuleRecommendation(
      context('hot_pourover'), [bean()], [log('hot_pourover', { rating })], brewTemplates,
    )
    expect(Boolean(result?.primary)).toBe(canBeBase)
    expect(result?.confidence).toBe(confidence)
  })

  it('calculates iced pour-over hot water and ice separately', () => {
    const result = generateMethodAwareRuleRecommendation(context('iced_pourover'), [bean()], [], brewTemplates)
    expect(result?.recommended).toMatchObject({ brewMode: 'iced_pourover', coffeeGrams: 15, iceGrams: expect.any(Number), waterGrams: expect.any(Number) })
    expect((result?.recommended.iceGrams ?? 0) / 225).toBeGreaterThanOrEqual(0.25)
    expect((result?.recommended.iceGrams ?? 0) / 225).toBeLessThanOrEqual(0.45)
  })

  it.each([
    ['ready_to_drink', 12, 16],
    ['concentrate', 7, 10],
  ] as const)('keeps cold-brew %s inside its ratio range', (variant, min, max) => {
    const result = generateMethodAwareRuleRecommendation(context('cold_brew', variant), [bean()], [], brewTemplates)
    const denominator = Number(result?.recommended.ratio?.split(':')[1])
    expect(denominator).toBeGreaterThanOrEqual(min)
    expect(denominator).toBeLessThanOrEqual(max)
    expect(result?.recommended.brewVariant).toBe(variant)
  })

  it('keeps the user-confirmed espresso dose fixed and derives beverage output', () => {
    const result = generateMethodAwareRuleRecommendation(context('espresso'), [bean()], [], brewTemplates)
    expect(result?.recommended).toMatchObject({ brewMode: 'espresso', coffeeGrams: 18, beverageGrams: 36, waterGrams: null })
  })
})
