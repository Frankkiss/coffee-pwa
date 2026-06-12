import { describe, expect, it } from 'vitest'
import { createInitialBeanForm, toBeanInsertPayload } from './beanForm'

describe('toBeanInsertPayload', () => {
  it('maps required and optional form values to a Supabase insert payload', () => {
    const form = {
      ...createInitialBeanForm(),
      name: '埃塞俄比亚 耶加雪菲',
      roaster: '示例烘焙',
      origin: 'Ethiopia',
      farmOrStation: 'Aricha',
      process: '水洗',
      variety: 'Heirloom',
      altitudeMeters: '1950',
      roastDate: '2026-06-01',
      roastLevel: '浅烘',
      flavorTags: '柑橘, 茉莉, 蜂蜜',
      flavorNotes: '明亮酸质，尾段甜感清晰',
      netWeightGrams: '100',
      remainingGrams: '80',
      price: '68',
      purchaseDate: '2026-06-10',
      sourceUrl: 'https://example.com/bean',
      notes: '第一次录入',
    }

    expect(toBeanInsertPayload(form, 'user-1')).toEqual({
      user_id: 'user-1',
      name: '埃塞俄比亚 耶加雪菲',
      roaster: '示例烘焙',
      origin: 'Ethiopia',
      farm_or_station: 'Aricha',
      process: '水洗',
      variety: 'Heirloom',
      altitude_meters: 1950,
      roast_date: '2026-06-01',
      roast_level: '浅烘',
      flavor_tags: ['柑橘', '茉莉', '蜂蜜'],
      flavor_notes: '明亮酸质，尾段甜感清晰',
      net_weight_grams: 100,
      remaining_grams: 80,
      price: 68,
      purchase_date: '2026-06-10',
      source_url: 'https://example.com/bean',
      notes: '第一次录入',
    })
  })

  it('normalizes empty optional values to null and removes duplicate tags', () => {
    const form = {
      ...createInitialBeanForm(),
      name: '  哥伦比亚 粉波旁  ',
      flavorTags: '莓果，莓果, 花香',
      altitudeMeters: '',
      price: '',
    }

    expect(toBeanInsertPayload(form, 'user-1')).toMatchObject({
      name: '哥伦比亚 粉波旁',
      flavor_tags: ['莓果', '花香'],
      altitude_meters: null,
      price: null,
      roaster: null,
      roast_date: null,
    })
  })

  it('rejects a blank bean name', () => {
    expect(() => toBeanInsertPayload(createInitialBeanForm(), 'user-1')).toThrow(
      '咖啡豆名称不能为空',
    )
  })
})
