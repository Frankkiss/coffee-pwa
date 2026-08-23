import { describe, expect, it } from 'vitest'
import type { BrewLog } from '../brews/brewTypes'
import type { Bean } from './beanTypes'
import { buildBeanDetailView } from './beanDetailModel'

function createBean(overrides: Partial<Bean> = {}): Bean {
  return {
    id: 'bean-1',
    user_id: 'user-1',
    name: '咖Day 拼配',
    roaster: '测试烘焙',
    origin: '巴西 / 埃塞俄比亚',
    farm_or_station: null,
    process: '日晒 / 水洗',
    variety: '黄波旁 / 原生种',
    altitude_meters: null,
    roast_date: '2026-06-01',
    roast_level: '中浅烘',
    flavor_tags: ['坚果', '花香'],
    flavor_notes: '甜感和花香平衡',
    net_weight_grams: 100,
    price: 88,
    purchase_date: '2026-06-10',
    source_url: 'https://example.com/bean',
    image_url: null,
    bean_type: 'blend',
    remaining_grams: 20,
    blend_components: [
      {
        origin: '巴西',
        process: '日晒',
        variety: '黄波旁',
        percentage: null,
        role: '',
        notes: '提供坚果和甜感',
      },
      {
        origin: '埃塞俄比亚',
        process: '水洗',
        variety: '原生种',
        percentage: null,
        role: '',
        notes: '提供花香',
      },
    ],
    blend_notes: '巴西 日晒 黄波旁，提供坚果和甜感\n埃塞俄比亚 水洗 原生种，提供花香',
    notes: '适合早上喝',
    created_at: '2026-06-12T01:00:00.000Z',
    updated_at: '2026-06-12T01:00:00.000Z',
    deleted_at: null,
    schema_version: 1,
    ...overrides,
  }
}

function createBrewLog(overrides: Partial<BrewLog> = {}): BrewLog {
  return {
    id: 'brew-1',
    user_id: 'user-1',
    bean_id: 'bean-1',
    brewed_at: '2026-06-12T02:00:00.000Z',
    method: '手冲',
    dripper: 'V60',
    filter_paper: null,
    grinder: null,
    grind_setting: '22 clicks',
    coffee_grams: 15,
    water_grams: 240,
    ratio: '1:16',
    water_temperature_c: 92,
    total_time_seconds: 150,
    pour_steps: [],
    rating: 4,
    acidity: null,
    sweetness: null,
    bitterness: null,
    astringency: null,
    body: null,
    aftertaste: null,
    flavor_tags: ['坚果'],
    is_pinned_recipe: false,
    notes: null,
    created_at: '2026-06-12T02:00:00.000Z',
    updated_at: '2026-06-12T02:00:00.000Z',
    deleted_at: null,
    schema_version: 1,
    ...overrides,
  }
}

describe('buildBeanDetailView', () => {
  it('builds full detail sections for a blend bean without implying unknown ratios', () => {
    const view = buildBeanDetailView(createBean(), [])

    expect(view.beanTypeLabel).toBe('拼配豆')
    expect(view.primaryMeta).toContain('巴西 / 埃塞俄比亚')
    expect(view.primaryMeta).toContain('日晒 / 水洗')
    expect(view.blendLines).toEqual([
      '巴西 日晒 黄波旁，提供坚果和甜感',
      '埃塞俄比亚 水洗 原生种，提供花香',
    ])
    expect(view.blendLines.join('\n')).not.toContain('主体')
    expect(view.stockLines).toEqual(['剩余 20g', '购买日期 2026-06-10', '价格 88'])
    expect(view.flavorText).toBe('坚果、花香 · 甜感和花香平衡')
  })
  it('shows zero remaining grams as used up instead of hiding it', () => {
    const view = buildBeanDetailView(createBean({ remaining_grams: 0 }), [])

    expect(view.stockLines).toContain('剩余 0g')
  })


  it('summarizes only brew logs for the selected bean', () => {
    const view = buildBeanDetailView(createBean(), [
      createBrewLog({
        id: 'older',
        brewed_at: '2026-06-10T02:00:00.000Z',
        rating: 5,
        is_pinned_recipe: true,
      }),
      createBrewLog({
        id: 'newer',
        brewed_at: '2026-06-12T02:00:00.000Z',
        rating: 4,
      }),
      createBrewLog({
        id: 'other-bean',
        bean_id: 'bean-2',
        rating: 5,
      }),
    ])

    expect(view.brewCount).toBe(2)
    expect(view.pinnedCount).toBe(1)
    expect(view.bestBrew?.id).toBe('older')
    expect(view.recentBrews.map((brew) => brew.id)).toEqual(['newer', 'older'])
  })
})
