import { describe, expect, it } from 'vitest'
import type { BrewLog } from '../brews/brewTypes'
import { analyzeHistoryRecipe } from './historyRecipeFacts'

function log(overrides: Partial<BrewLog>): BrewLog {
  return {
    coffee_grams: null,
    water_grams: null,
    ice_grams: null,
    beverage_grams: null,
    ratio: null,
    ...overrides,
  } as BrewLog
}

describe('history recipe facts', () => {
  it('derives each mode ratio from its real output masses', () => {
    expect(analyzeHistoryRecipe(log({ coffee_grams: 15, water_grams: 240 }), 'hot_pourover').ratio).toBe('1:16')
    expect(analyzeHistoryRecipe(log({ coffee_grams: 15, water_grams: 150, ice_grams: 75 }), 'iced_pourover').ratio).toBe('1:10')
    expect(analyzeHistoryRecipe(log({ coffee_grams: 50, water_grams: 700 }), 'cold_brew').ratio).toBe('1:14')
    expect(analyzeHistoryRecipe(log({ coffee_grams: 18, beverage_grams: 36 }), 'espresso').ratio).toBe('1:2')
  })

  it('prefers masses over a conflicting recorded ratio', () => {
    expect(analyzeHistoryRecipe(log({ coffee_grams: 18, beverage_grams: 45, ratio: '1:2' }), 'espresso'))
      .toMatchObject({ ratio: '1:2.5', ratioSource: 'weights', eligible: true })
  })

  it('does not invent a ratio or accept parameter fragments as a base', () => {
    expect(analyzeHistoryRecipe(log({ grind_setting: '22 clicks' }), 'hot_pourover'))
      .toEqual({ ratio: null, ratioSource: null, eligible: false })
    expect(analyzeHistoryRecipe(log({ coffee_grams: 18 }), 'espresso').eligible).toBe(false)
  })

  it('does not trust a ratio-only iced history because its stored semantics are ambiguous', () => {
    expect(analyzeHistoryRecipe(log({ coffee_grams: 15, ratio: '1:15' }), 'iced_pourover'))
      .toEqual({ ratio: null, ratioSource: null, eligible: false })
  })
})
