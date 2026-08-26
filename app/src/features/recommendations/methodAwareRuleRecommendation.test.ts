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
    ['concentrate', 5, 10],
  ] as const)('keeps cold-brew %s inside its ratio range', (variant, min, max) => {
    const result = generateMethodAwareRuleRecommendation(context('cold_brew', variant), [bean()], [], brewTemplates)
    const denominator = Number(result?.recommended.ratio?.split(':')[1])
    expect(denominator).toBeGreaterThanOrEqual(min)
    expect(denominator).toBeLessThanOrEqual(max)
    expect(result?.recommended.brewVariant).toBe(variant)
  })

  it('keeps the user-confirmed espresso dose fixed and derives template-matched beverage output', () => {
    const result = generateMethodAwareRuleRecommendation(context('espresso'), [bean()], [], brewTemplates)
    expect(result?.recommended).toMatchObject({ brewMode: 'espresso', coffeeGrams: 18, beverageGrams: 45, waterGrams: null })
  })

  it('preserves the Toddy template source boundaries', () => {
    const result = generateMethodAwareRuleRecommendation(
      context('cold_brew', 'concentrate'), [bean()], [], brewTemplates,
    )

    expect(result?.baseSource).toMatchObject({ type: 'template', templateId: 'cold-concentrate-toddy' })
    expect(result?.allowedRanges).toMatchObject({
      ratioDenominator: { min: 5, max: 6 },
      waterTemperatureC: { min: 18, max: 24 },
      totalTimeSeconds: { min: 43_200, max: 86_400 },
    })
    expect(Number(result?.recommended.ratio?.split(':')[1])).toBeGreaterThanOrEqual(5)
    expect(Number(result?.recommended.ratio?.split(':')[1])).toBeLessThanOrEqual(6)
    expect(result?.recommended.waterTemperatureC).toBeGreaterThanOrEqual(18)
    expect(result?.recommended.waterTemperatureC).toBeLessThanOrEqual(24)
    expect(result?.recommended.totalTimeSeconds).toBeGreaterThanOrEqual(43_200)
    expect(result?.recommended.totalTimeSeconds).toBeLessThanOrEqual(86_400)
  })

  it('keeps aged refrigerated cold brew inside its final temperature range', () => {
    const target = bean({ roast_date: '2026-06-01' })
    const coldLog = log('cold_brew', {
      brew_variant: 'ready_to_drink',
      coffee_grams: 50,
      water_grams: 700,
      ratio: '1:14',
      water_temperature_c: 6,
      total_time_seconds: 43_200,
    })
    const coldContext = createRecommendationContext({
      targetBean: target,
      mode: 'cold_brew',
      variant: 'ready_to_drink',
      brewer: '冷萃壶',
      grinder: 'C40',
      espressoDoseGrams: null,
      tasteGoals: ['甜感'],
      now: new Date('2026-08-23T12:00:00Z'),
    })

    const result = generateMethodAwareRuleRecommendation(coldContext, [target], [coldLog], brewTemplates)

    expect(result?.allowedRanges?.waterTemperatureC).toEqual({ min: 4, max: 8 })
    expect(result?.recommended.waterTemperatureC).toBeGreaterThanOrEqual(4)
    expect(result?.recommended.waterTemperatureC).toBeLessThanOrEqual(8)
  })

  it('selects templates by explicit mode metadata instead of template ids', () => {
    const renamedTemplates = brewTemplates.map((template, index) => ({
      ...template,
      id: `core-recipe-${index + 1}`,
    }))

    const result = generateMethodAwareRuleRecommendation(
      context('cold_brew', 'concentrate'),
      [bean()],
      [],
      renamedTemplates,
    )

    expect(result?.templateCandidates).toHaveLength(2)
    expect(result?.templateCandidates.every((candidate) =>
      renamedTemplates.find((template) => template.id === candidate.id)?.brewVariant === 'concentrate',
    )).toBe(true)
  })

  it('uses the same equipment-aware template for the first candidate and base source', () => {
    const targetBean = bean()
    const oreaContext = createRecommendationContext({
      targetBean,
      mode: 'hot_pourover',
      variant: null,
      brewer: 'Orea 平底滤杯',
      grinder: 'C40',
      espressoDoseGrams: null,
      tasteGoals: ['甜感'],
      now: new Date('2026-08-23T12:00:00Z'),
    })

    const result = generateMethodAwareRuleRecommendation(oreaContext, [targetBean], [], brewTemplates)

    expect(result?.templateCandidates[0].id).toBe('hot-orea-balanced-flat')
    expect(result?.baseSource).toMatchObject({ type: 'template', templateId: 'hot-orea-balanced-flat' })
  })

  it.each([
    ['hot_pourover', null],
    ['iced_pourover', null],
    ['cold_brew', 'ready_to_drink'],
    ['cold_brew', 'concentrate'],
    ['espresso', null],
  ] as const)('recomputes output mass after a %s concentration adjustment', (mode, variant) => {
    const targetBean = bean()
    const lowBodyLog = log(mode, {
      id: `${mode}-${variant ?? 'default'}-feedback`,
      rating: 2,
      body: 1,
      brew_variant: variant,
      coffee_grams: mode === 'cold_brew' ? 50 : mode === 'espresso' ? 18 : 15,
      water_grams: mode === 'cold_brew' ? 700 : mode === 'espresso' ? null : 225,
      ice_grams: mode === 'iced_pourover' ? 75 : null,
      beverage_grams: mode === 'espresso' ? 36 : null,
      ratio: mode === 'cold_brew' ? (variant === 'concentrate' ? '1:7' : '1:14') : mode === 'espresso' ? '1:2' : '1:15',
    })
    const result = generateMethodAwareRuleRecommendation(
      context(mode, variant), [targetBean], [lowBodyLog], brewTemplates,
    )
    const recipe = result?.recommended
    const denominator = Number(recipe?.ratio?.split(':')[1])
    const output = mode === 'espresso'
      ? recipe?.beverageGrams
      : mode === 'iced_pourover'
        ? (recipe?.waterGrams ?? 0) + (recipe?.iceGrams ?? 0)
        : recipe?.waterGrams

    expect((output ?? 0) / (recipe?.coffeeGrams ?? 1)).toBeCloseTo(denominator, 1)
  })

  it('uses an incomplete high-rated history only as a reference and falls back to a template base', () => {
    const result = generateMethodAwareRuleRecommendation(
      context('hot_pourover'),
      [bean()],
      [log('hot_pourover', {
        id: 'fragment',
        rating: 5,
        coffee_grams: null,
        water_grams: 240,
        ratio: '1:16',
      })],
      brewTemplates,
    )

    expect(result?.primary).toBeNull()
    expect(result?.references.map((item) => item.brewLog.id)).toContain('fragment')
    expect(result?.baseSource.type).toBe('template')
    expect(result?.recommended.coffeeGrams).toBeGreaterThan(0)
  })

  it('derives a missing cold-brew ratio from real masses', () => {
    const result = generateMethodAwareRuleRecommendation(
      context('cold_brew', 'ready_to_drink'),
      [bean()],
      [log('cold_brew', {
        brew_variant: 'ready_to_drink',
        coffee_grams: 50,
        water_grams: 700,
        ratio: null,
      })],
      brewTemplates,
    )

    expect(result?.primary).not.toBeNull()
    expect(result?.recommended.ratio).toBe('1:14')
    expect(result?.allowedRanges?.ratioDenominator).toEqual({ min: 13.5, max: 14.5 })
  })

  it('fills non-core history parameters from the best compatible template', () => {
    const result = generateMethodAwareRuleRecommendation(
      context('hot_pourover'),
      [bean()],
      [log('hot_pourover', {
        water_temperature_c: null,
        total_time_seconds: null,
        grind_setting: null,
      })],
      brewTemplates,
    )

    expect(result?.primary).not.toBeNull()
    expect(result?.recommended.waterTemperatureC).not.toBeNull()
    expect(result?.recommended.totalTimeSeconds).not.toBeNull()
    expect(result?.recommended.grindSetting).not.toBeNull()
  })

  it('does not narrow a ratio range around an invented default', () => {
    const result = generateMethodAwareRuleRecommendation(
      context('cold_brew', 'concentrate'),
      [bean()],
      [log('cold_brew', {
        brew_variant: 'concentrate',
        coffee_grams: null,
        water_grams: null,
        ratio: null,
        grind_setting: '粗',
      })],
      [],
    )

    expect(result).toBeNull()
  })
})
