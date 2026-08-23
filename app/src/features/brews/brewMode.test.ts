import { describe, expect, it } from 'vitest'
import { normalizeBrewMode, normalizeBrewVariant } from './brewMode'

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
