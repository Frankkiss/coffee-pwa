import { describe, expect, it } from 'vitest'
import {
  createBeanFormFromBean,
  createInitialBeanForm,
  toBeanInsertPayload,
  toBeanUpdatePayload,
} from './beanForm'
import type { Bean } from './beanTypes'

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
      beanType: 'blend' as const,
      blendComponents: [
        {
          origin: '巴西',
          process: '日晒',
          variety: '黄波旁',
          percentage: 60,
          role: '主体甜感',
          notes: '提供坚果和甜感',
        },
        {
          origin: '埃塞俄比亚',
          process: '水洗',
          variety: '原生种',
          percentage: null,
          role: '香气',
          notes: '提供花香和柑橘',
        },
      ],
      blendNotes: '整体坚果、花香和柑橘调，适合冰手冲。',
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
      bean_type: 'blend',
      blend_components: [
        {
          origin: '巴西',
          process: '日晒',
          variety: '黄波旁',
          percentage: 60,
          role: '主体甜感',
          notes: '提供坚果和甜感',
        },
        {
          origin: '埃塞俄比亚',
          process: '水洗',
          variety: '原生种',
          percentage: null,
          role: '香气',
          notes: '提供花香和柑橘',
        },
      ],
      blend_notes: '整体坚果、花香和柑橘调，适合冰手冲。',
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

describe('bean edit helpers', () => {
  const bean = {
    id: 'bean-1',
    user_id: 'user-1',
    name: '埃塞俄比亚 测试豆',
    roaster: '示例烘焙',
    origin: 'Ethiopia',
    farm_or_station: 'Aricha',
    process: '水洗',
    variety: 'Heirloom',
    altitude_meters: 1950,
    roast_date: '2026-06-01',
    roast_level: '浅烘',
    flavor_tags: ['柑橘', '花香'],
    flavor_notes: '明亮',
    net_weight_grams: 100,
    remaining_grams: 60,
    price: 88,
    purchase_date: '2026-06-10',
    source_url: 'https://example.com',
    image_url: null,
    bean_type: 'blend',
    blend_components: [
      {
        origin: '巴西',
        process: '日晒',
        variety: '黄波旁',
        percentage: 60,
        role: '',
        notes: '主体甜感',
      },
    ],
    blend_notes: '60% 巴西 日晒 黄波旁，主体甜感',
    notes: '需要复购',
    created_at: '2026-06-12T01:00:00.000Z',
    updated_at: '2026-06-12T01:00:00.000Z',
    deleted_at: null,
    schema_version: 1,
  } satisfies Bean

  it('creates an editable form from an existing bean', () => {
    expect(createBeanFormFromBean(bean)).toMatchObject({
      name: '埃塞俄比亚 测试豆',
      roaster: '示例烘焙',
      origin: 'Ethiopia',
      farmOrStation: 'Aricha',
      altitudeMeters: '1950',
      flavorTags: '柑橘, 花香',
      remainingGrams: '60',
      beanType: 'blend',
      blendComponents: [
        {
          origin: '巴西',
          process: '日晒',
          variety: '黄波旁',
          percentage: 60,
          role: '',
          notes: '主体甜感',
        },
      ],
      blendNotes: '60% 巴西 日晒 黄波旁，主体甜感',
      notes: '需要复购',
    })
  })

  it('creates an update payload without user ownership fields', () => {
    const payload = toBeanUpdatePayload({
      ...createBeanFormFromBean(bean),
      name: '埃塞俄比亚 更新',
      remainingGrams: '42',
    })

    expect(payload).toMatchObject({
      name: '埃塞俄比亚 更新',
      remaining_grams: 42,
      flavor_tags: ['柑橘', '花香'],
    })
    expect(payload).not.toHaveProperty('user_id')
  })
})
