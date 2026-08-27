import { describe, expect, it } from 'vitest'
import { deriveRatioFromMasses, getCanonicalBrewRatio } from './brewRatio'
import type { BrewLog } from './brewTypes'

const icedLog = {
  brew_mode: 'iced_pourover',
  method: '手冲',
  coffee_grams: 15,
  water_grams: 150,
  ice_grams: 90,
  beverage_grams: null,
  ratio: '1:16',
} as BrewLog

describe('canonical brew ratio', () => {
  it('uses hot water only for iced pour-over', () => {
    expect(deriveRatioFromMasses('iced_pourover', 15, 150, null)).toBe('1:10')
    expect(getCanonicalBrewRatio(icedLog)).toBe('1:10')
  })

  it('does not trust an ambiguous stored iced ratio when real masses are incomplete', () => {
    expect(getCanonicalBrewRatio({ ...icedLog, water_grams: null })).toBeNull()
    expect(getCanonicalBrewRatio({ ...icedLog, coffee_grams: null })).toBeNull()
  })
})
