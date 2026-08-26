import { describe, expect, it } from 'vitest'
import type { BrewLog } from '../brews/brewTypes'
import { deriveFeedbackAdjustments } from './feedbackAdjustments'

function log(overrides: Partial<BrewLog>): BrewLog {
  return {
    rating: 2, acidity: null, sweetness: null, bitterness: null,
    astringency: null, body: null, aftertaste: null, notes: null,
    ...overrides,
  } as BrewLog
}

describe('feedback adjustments', () => {
  it('reduces extraction for low-rated high bitterness and adds at most one body adjustment', () => {
    const result = deriveFeedbackAdjustments(log({ bitterness: 5, body: 2 }), [])
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ source: 'feedback', priority: 'primary', target: 'extraction', direction: 'decrease' })
    expect(result[1]).toMatchObject({ priority: 'secondary', target: 'concentration', direction: 'increase' })
  })

  it('preserves bright acidity when satisfaction is high', () => {
    expect(deriveFeedbackAdjustments(log({ rating: 5, acidity: 5 }), ['明亮'])).toEqual([])
  })

  it('raises extraction for low-rated sharp acidity unless bright acidity is preferred', () => {
    expect(deriveFeedbackAdjustments(log({ acidity: 5, notes: '尖酸' }), [])[0]).toMatchObject({ direction: 'increase' })
    expect(deriveFeedbackAdjustments(log({ acidity: 5 }), ['明亮'])).toEqual([])
  })

  it('does not treat sensory intensity as satisfaction without a rating', () => {
    expect(deriveFeedbackAdjustments(log({ rating: null, bitterness: 5 }), [])).toEqual([])
  })

  it.each([
    ['偏苦，有点涩', 'extraction', 'decrease'],
    ['酸得尖，像没萃开', 'extraction', 'increase'],
    ['甜感不足，喝起来空', 'extraction', 'increase'],
    ['太淡了，水感明显', 'concentration', 'increase'],
    ['太厚重，尾段发闷', 'concentration', 'decrease'],
  ] as const)('parses low-rated plain-language feedback: %s', (notes, target, direction) => {
    expect(deriveFeedbackAdjustments(log({ rating: 2, notes }), []))
      .toContainEqual(expect.objectContaining({ target, direction }))
  })

  it.each([
    '酸得舒服，果酸很明亮',
    '醇厚但平衡，我很喜欢',
  ] as const)('does not turn accepted sensory language into a correction: %s', (notes) => {
    expect(deriveFeedbackAdjustments(log({ rating: 2, notes }), ['明亮']))
      .toEqual([])
  })

  it('does not adjust a high-rated brew from ordinary tasting notes', () => {
    expect(deriveFeedbackAdjustments(log({ rating: 4, notes: '莓果酸质，醇厚甜感' }), []))
      .toEqual([])
  })
})
