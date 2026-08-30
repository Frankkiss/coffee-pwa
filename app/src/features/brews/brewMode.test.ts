import { describe, expect, it } from 'vitest'
import {
  allowsIceGrams,
  getBrewModeDisplayLabel,
  normalizeBrewMode,
  normalizeBrewVariant,
} from './brewMode'

describe('normalizeBrewMode', () => {
  it.each([
    [{ brew_mode: null, method: '冰手冲' }, 'iced_pourover'],
    [{ brew_mode: null, method: 'Pourover' }, 'hot_pourover'],
    [{ brew_mode: null, method: '冷萃' }, 'cold_brew'],
    [{ brew_mode: null, method: 'Espresso' }, 'espresso'],
  ] as const)('normalizes legacy method %o', (input, expected) => {
    expect(normalizeBrewMode(input)).toBe(expected)
  })

  it('prefers a canonical stored mode', () => {
    expect(normalizeBrewMode({ brew_mode: 'iced_pourover', method: '手冲' })).toBe(
      'iced_pourover',
    )
  })

  it('does not guess an unknown method', () => {
    expect(normalizeBrewMode({ brew_mode: null, method: '未知方法' })).toBeNull()
  })
})

describe('normalizeBrewVariant', () => {
  it('accepts cold-brew variants only for cold brew', () => {
    expect(normalizeBrewVariant('cold_brew', 'concentrate')).toBe('concentrate')
    expect(normalizeBrewVariant('hot_pourover', 'concentrate')).toBeNull()
  })
})

describe('allowsIceGrams', () => {
  it('allows recipe ice for iced pour-over and serving ice for cold brew concentrate', () => {
    expect(allowsIceGrams('iced_pourover', null)).toBe(true)
    expect(allowsIceGrams('cold_brew', 'concentrate')).toBe(true)
    expect(allowsIceGrams('cold_brew', 'ready_to_drink')).toBe(false)
    expect(allowsIceGrams('hot_pourover', null)).toBe(false)
  })
})

describe('getBrewModeDisplayLabel', () => {
  it.each([
    [{ brew_mode: 'hot_pourover', method: '手冲' }, '热手冲'],
    [{ brew_mode: 'iced_pourover', method: '手冲' }, '冰手冲'],
    [{ brew_mode: 'cold_brew', brew_variant: 'ready_to_drink', method: '冷萃' }, '冷萃 · 直接饮用'],
    [{ brew_mode: 'cold_brew', brew_variant: 'concentrate', method: '冷萃' }, '冷萃 · 浓缩基底'],
    [{ brew_mode: 'espresso', method: '意式' }, '意式'],
  ] as const)('uses the canonical four-mode label for %o', (input, expected) => {
    expect(getBrewModeDisplayLabel(input)).toBe(expected)
  })

  it('keeps a meaningful non-default method as secondary information', () => {
    expect(getBrewModeDisplayLabel({ brew_mode: 'hot_pourover', method: '爱乐压' }))
      .toBe('热手冲 · 爱乐压')
  })

  it('falls back to the legacy method when the mode cannot be inferred', () => {
    expect(getBrewModeDisplayLabel({ brew_mode: null, method: '未知方法' }))
      .toBe('未知方法')
  })
})
