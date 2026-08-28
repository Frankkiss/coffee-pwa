import { describe, expect, it } from 'vitest'
import {
  getFallbackRatioRange,
  getLocalRatioRange,
  getRatioEnvelope,
} from './recommendationPolicy'

describe('recommendation policy', () => {
  it('keeps researched cold-brew concentrate templates inside the broad envelope', () => {
    expect(getRatioEnvelope('cold_brew', 'concentrate')).toEqual({ min: 5, max: 10 })
  })

  it('uses a hot-water-only envelope for iced pour-over', () => {
    expect(getRatioEnvelope('iced_pourover', null)).toEqual({ min: 7, max: 12 })
  })

  it('uses the conservative range when no reliable concentrate source exists', () => {
    expect(getFallbackRatioRange('cold_brew', 'concentrate')).toEqual({ min: 7, max: 10 })
  })

  it('builds a local window around a reliable source ratio', () => {
    expect(getLocalRatioRange('1:5.5', { min: 5, max: 10 })).toEqual({ min: 5, max: 6 })
  })
})
