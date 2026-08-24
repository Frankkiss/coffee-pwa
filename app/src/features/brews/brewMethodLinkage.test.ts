import { describe, expect, it } from 'vitest'
import {
  isMethodCompatible,
  linkMethodToMode,
  linkModeToMethod,
} from './brewMethodLinkage'

describe('brew method linkage', () => {
  it('switches the canonical mode when a known method is selected', () => {
    expect(linkMethodToMode('冷萃', 'hot_pourover')).toEqual({
      brewMode: 'cold_brew',
      method: '冷萃',
    })
    expect(linkMethodToMode('意式', 'hot_pourover')).toEqual({
      brewMode: 'espresso',
      method: '意式',
    })
  })

  it('preserves iced pourover when the user selects hand pour', () => {
    expect(linkMethodToMode('手冲', 'iced_pourover')).toEqual({
      brewMode: 'iced_pourover',
      method: '手冲',
    })
  })

  it('keeps a compatible method and replaces only incompatible methods', () => {
    expect(linkModeToMethod('espresso', '摩卡壶')).toEqual({
      brewMode: 'espresso',
      method: '摩卡壶',
    })
    expect(linkModeToMethod('cold_brew', '手冲')).toEqual({
      brewMode: 'cold_brew',
      method: '冷萃',
    })
  })

  it('reports incompatible mode and method combinations', () => {
    expect(isMethodCompatible('iced_pourover', '手冲')).toBe(true)
    expect(isMethodCompatible('cold_brew', '意式')).toBe(false)
    expect(isMethodCompatible('hot_pourover', 'V60')).toBe(true)
  })
})
