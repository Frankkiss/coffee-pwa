import { describe, expect, it } from 'vitest'
import type { Bean } from '../beans/beanTypes'
import { createRecommendationContext } from './recommendationContext'

const bean = { id: 'bean-1' } as Bean

describe('recommendation context', () => {
  it('normalizes cold brew variants, gear and taste goals', () => {
    const now = new Date('2026-08-23T00:00:00Z')
    expect(createRecommendationContext({
      targetBean: bean,
      mode: 'cold_brew',
      variant: 'concentrate',
      brewer: ' 冷萃壶 ',
      grinder: ' C40 ',
      tasteGoals: ['甜感', '甜感', ' 干净 '],
      now,
    })).toEqual({
      targetBean: bean,
      mode: 'cold_brew',
      variant: 'concentrate',
      gear: { brewer: '冷萃壶', grinder: 'C40' },
      espressoDoseGrams: null,
      tasteGoals: ['甜感', '干净'],
      now,
    })
  })

  it('keeps a valid espresso dose only for espresso', () => {
    expect(createRecommendationContext({ targetBean: bean, mode: 'espresso', espressoDoseGrams: 18 }).espressoDoseGrams).toBe(18)
    expect(createRecommendationContext({ targetBean: bean, mode: 'hot_pourover', espressoDoseGrams: 18 }).espressoDoseGrams).toBeNull()
  })
})
