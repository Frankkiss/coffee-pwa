import { describe, expect, it } from 'vitest'
import { getBrewFormPresentation } from './brewFormPresentation'

describe('brew form presentation', () => {
  it('hides the redundant method and shows serving ice for cold brew concentrate', () => {
    expect(getBrewFormPresentation('cold_brew', 'concentrate')).toEqual({
      showMethod: false,
      showIceGrams: true,
    })
  })

  it('hides serving ice for ready-to-drink cold brew', () => {
    expect(getBrewFormPresentation('cold_brew', 'ready_to_drink')).toEqual({
      showMethod: false,
      showIceGrams: false,
    })
  })

  it('keeps the existing iced pour-over fields', () => {
    expect(getBrewFormPresentation('iced_pourover', '')).toEqual({
      showMethod: true,
      showIceGrams: true,
    })
  })
})
