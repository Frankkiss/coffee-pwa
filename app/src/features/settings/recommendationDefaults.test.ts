import { describe, expect, it } from 'vitest'
import {
  readRecommendationDefaults,
  writeRecommendationDefaults,
} from './recommendationDefaults'

describe('recommendation defaults', () => {
  it('reads structured per-mode gear and taste goals', () => {
    expect(readRecommendationDefaults({
      items: ['legacy item'],
      recommendation: {
        hotPourover: { brewer: 'V60', grinder: 'C40' },
        icedPourover: { brewer: 'V60', grinder: 'C40' },
        coldBrew: { brewer: '冷萃壶', grinder: 'C40' },
        espresso: { brewer: 'Flair', grinder: 'Kinu', doseGrams: 18 },
      },
    }, {
      notes: '保留原备注',
      goals: ['明亮', '甜感'],
    })).toEqual({
      hotPourover: { brewer: 'V60', grinder: 'C40' },
      icedPourover: { brewer: 'V60', grinder: 'C40' },
      coldBrew: { brewer: '冷萃壶', grinder: 'C40' },
      espresso: { brewer: 'Flair', grinder: 'Kinu', doseGrams: 18 },
      tasteGoals: ['明亮', '甜感'],
    })
  })

  it('writes defaults without replacing legacy or unknown settings keys', () => {
    expect(writeRecommendationDefaults(
      { items: ['V60'], unknown: { keep: true } },
      { notes: '低苦味', acidity: 4 },
      {
        hotPourover: { brewer: 'V60', grinder: 'C40' },
        icedPourover: { brewer: 'Switch', grinder: 'C40' },
        coldBrew: { brewer: '冷萃壶', grinder: 'C40' },
        espresso: { brewer: 'Flair', grinder: 'Kinu', doseGrams: 18 },
        tasteGoals: ['甜感', '干净'],
      },
    )).toEqual({
      defaultGear: {
        items: ['V60'],
        unknown: { keep: true },
        recommendation: {
          hotPourover: { brewer: 'V60', grinder: 'C40' },
          icedPourover: { brewer: 'Switch', grinder: 'C40' },
          coldBrew: { brewer: '冷萃壶', grinder: 'C40' },
          espresso: { brewer: 'Flair', grinder: 'Kinu', doseGrams: 18 },
        },
      },
      tastePreferences: {
        notes: '低苦味',
        acidity: 4,
        goals: ['甜感', '干净'],
      },
    })
  })

  it('uses safe empty values for malformed optional JSON', () => {
    expect(readRecommendationDefaults(
      { recommendation: { espresso: { brewer: 7, doseGrams: -1 } } },
      { goals: ['甜感', 5] },
    )).toEqual({
      hotPourover: { brewer: '', grinder: '' },
      icedPourover: { brewer: '', grinder: '' },
      coldBrew: { brewer: '', grinder: '' },
      espresso: { brewer: '', grinder: '', doseGrams: null },
      tasteGoals: ['甜感'],
    })
  })
})
