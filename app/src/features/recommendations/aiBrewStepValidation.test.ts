import { describe, expect, it } from 'vitest'
import type { BrewMode } from '../brews/brewTypes'
import type { AiRecommendationContext } from './aiRecommendationContext'
import type { StructuredAiBrewStep, StructuredAiRecipe } from './recommendationTypes'
import { validateAiBrewSteps } from './aiBrewStepValidation'

function context(mode: BrewMode): AiRecommendationContext {
  return { selection: { mode } } as AiRecommendationContext
}

function recipe(mode: BrewMode): StructuredAiRecipe {
  return {
    method: null,
    brewMode: mode,
    brewVariant: mode === 'cold_brew' ? 'ready_to_drink' : null,
    dripper: null,
    grinder: null,
    grindSetting: null,
    waterTemperatureC: mode === 'cold_brew' ? 6 : 92,
    coffeeGrams: mode === 'cold_brew' ? 50 : mode === 'espresso' ? 18 : 15,
    waterGrams: mode === 'hot_pourover' ? 240 : mode === 'iced_pourover' ? 150 : mode === 'cold_brew' ? 700 : null,
    iceGrams: mode === 'iced_pourover' ? 75 : null,
    beverageGrams: mode === 'espresso' ? 36 : null,
    ratio: mode === 'cold_brew' ? '1:14' : mode === 'espresso' ? '1:2' : '1:16',
    totalTimeSeconds: mode === 'cold_brew' ? 43_200 : mode === 'espresso' ? 28 : 150,
  }
}

function step(overrides: Partial<StructuredAiBrewStep>): StructuredAiBrewStep {
  return {
    label: '阶段',
    time: '0:00-0:30',
    startSeconds: 0,
    endSeconds: 30,
    targetType: 'none',
    targetGrams: null,
    action: '准备',
    ...overrides,
  }
}

describe('AI brew step validation', () => {
  it.each([
    ['hot_pourover', [step({ targetType: 'water', targetGrams: 240, action: '注水至目标' })]],
    ['iced_pourover', [
      step({ targetType: 'water', targetGrams: 150, action: '热水冲煮' }),
      step({ startSeconds: 30, endSeconds: 40, targetType: 'ice', targetGrams: 75, action: '与冰混合' }),
    ]],
    ['cold_brew', [step({ targetType: 'water', targetGrams: 700, action: '混合后冷藏浸泡' })]],
    ['espresso', [step({ targetType: 'beverage', targetGrams: 36, action: '萃取至目标液重' })]],
  ] as const)('accepts valid %s steps', (mode, steps) => {
    expect(validateAiBrewSteps([...steps], recipe(mode), context(mode))).toBe(true)
  })

  it('rejects espresso hand-pour water and an impossible target', () => {
    expect(validateAiBrewSteps([
      step({ targetType: 'water', targetGrams: 999, action: '注水' }),
    ], recipe('espresso'), context('espresso'))).toBe(false)
  })

  it('rejects hand-pour language for cold brew', () => {
    expect(validateAiBrewSteps([
      step({ targetType: 'water', targetGrams: 700, action: '绕圈注水' }),
    ], recipe('cold_brew'), context('cold_brew'))).toBe(false)
  })

  it('rejects mismatched iced water and ice totals', () => {
    expect(validateAiBrewSteps([
      step({ targetType: 'water', targetGrams: 180, action: '热水冲煮' }),
      step({ startSeconds: 30, endSeconds: 40, targetType: 'ice', targetGrams: 45, action: '与冰混合' }),
    ], recipe('iced_pourover'), context('iced_pourover'))).toBe(false)
  })
})
