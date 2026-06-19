import { describe, expect, it } from 'vitest'
import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import { generateRuleRecommendation } from './ruleRecommendation'

function createBean(overrides: Partial<Bean>): Bean {
  return {
    id: 'bean-1',
    user_id: 'user-1',
    name: 'Target Bean',
    roaster: null,
    origin: 'Ethiopia',
    farm_or_station: null,
    process: '水洗',
    variety: 'Heirloom',
    altitude_meters: 1950,
    roast_date: null,
    roast_level: '浅烘',
    flavor_tags: ['柑橘', '花香'],
    flavor_notes: null,
    net_weight_grams: null,
    price: null,
    purchase_date: null,
    source_url: null,
    image_url: null,
    bean_type: 'single_origin',
    blend_components: [],
    blend_notes: null,
    notes: null,
    created_at: '2026-06-12T01:00:00.000Z',
    updated_at: '2026-06-12T01:00:00.000Z',
    deleted_at: null,
    schema_version: 1,
    ...overrides,
  }
}

function createBrewLog(overrides: Partial<BrewLog>): BrewLog {
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
    flavor_tags: ['柑橘'],
    is_pinned_recipe: false,
    notes: null,
    created_at: '2026-06-12T02:00:00.000Z',
    updated_at: '2026-06-12T02:00:00.000Z',
    deleted_at: null,
    schema_version: 1,
    ...overrides,
  }
}

describe('generateRuleRecommendation', () => {
  it('prefers a pinned high-rated brew from a similar bean', () => {
    const targetBean = createBean({ id: 'target', name: 'New Ethiopia' })
    const similarBean = createBean({
      id: 'similar',
      name: 'Similar Ethiopia',
      origin: 'Ethiopia',
      process: '水洗',
      roast_level: '浅烘',
      flavor_tags: ['柑橘', '花香'],
    })
    const unrelatedBean = createBean({
      id: 'unrelated',
      name: 'Dark Brazil',
      origin: 'Brazil',
      process: '日晒',
      roast_level: '深烘',
      flavor_tags: ['坚果'],
    })
    const result = generateRuleRecommendation(targetBean, [targetBean, similarBean, unrelatedBean], [
      createBrewLog({
        id: 'low',
        bean_id: 'unrelated',
        rating: 5,
        is_pinned_recipe: false,
        ratio: '1:14',
        water_temperature_c: 88,
      }),
      createBrewLog({
        id: 'best',
        bean_id: 'similar',
        rating: 4.5,
        is_pinned_recipe: true,
        ratio: '1:16',
        water_temperature_c: 92,
      }),
    ])

    expect(result).not.toBeNull()
    expect(result?.primary?.brewLog.id).toBe('best')
    expect(result?.primary?.recommended.ratio).toBe('1:16')
    expect(result?.primary?.reasons).toContain('处理法相同')
    expect(result?.primary?.reasons).toContain('已钉为候选方案')
    expect(result?.templateCandidates.length).toBeGreaterThan(0)
    expect(result?.templateCandidates[0].isChampionReference).toBe(false)
  })

  it('returns null when brew logs do not contain usable parameters', () => {
    const targetBean = createBean({ id: 'target' })
    const result = generateRuleRecommendation(targetBean, [targetBean], [
      createBrewLog({
        id: 'empty',
        ratio: null,
        water_temperature_c: null,
        grind_setting: null,
        total_time_seconds: null,
        dripper: null,
        method: null,
      }),
    ])

    expect(result).toBeNull()
  })

  it('scores blend beans by shared blend components', () => {
    const targetBean = createBean({
      id: 'target',
      name: 'House Blend',
      bean_type: 'blend',
      origin: '巴西 / 埃塞俄比亚',
      process: '拼配',
      blend_components: [
        {
          origin: '巴西',
          process: '日晒',
          variety: '黄波旁',
          percentage: 60,
          role: '主体甜感',
          notes: '',
        },
        {
          origin: '埃塞俄比亚',
          process: '水洗',
          variety: '原生种',
          percentage: 40,
          role: '香气',
          notes: '',
        },
      ],
      flavor_tags: ['坚果', '花香'],
    })
    const similarBlend = createBean({
      id: 'similar-blend',
      name: 'Similar Blend',
      bean_type: 'blend',
      origin: '巴西 / 哥伦比亚',
      process: '拼配',
      blend_components: [
        {
          origin: '巴西',
          process: '日晒',
          variety: '黄波旁',
          percentage: 70,
          role: '主体甜感',
          notes: '',
        },
      ],
      flavor_tags: ['坚果'],
    })
    const unrelatedBean = createBean({
      id: 'unrelated',
      name: 'Washed Kenya',
      origin: '肯尼亚',
      process: '水洗',
      roast_level: '浅烘',
      flavor_tags: ['柑橘'],
    })

    const result = generateRuleRecommendation(targetBean, [targetBean, similarBlend, unrelatedBean], [
      createBrewLog({
        id: 'similar-brew',
        bean_id: 'similar-blend',
        rating: 4,
        ratio: '1:15',
      }),
      createBrewLog({
        id: 'unrelated-brew',
        bean_id: 'unrelated',
        rating: 5,
        ratio: '1:17',
      }),
    ])

    expect(result?.primary?.brewLog.id).toBe('similar-brew')
    expect(result?.primary?.reasons.join(' / ')).toContain('拼配组成相近')
  })

  it('matches blend beans by multi-value origin and process text when ratio is unknown', () => {
    const targetBean = createBean({
      id: 'target',
      name: 'Unknown Ratio Blend',
      bean_type: 'blend',
      origin: '巴西 / 埃塞俄比亚',
      process: '日晒 / 水洗',
      variety: '黄波旁 / 原生种',
      blend_components: [
        {
          origin: '巴西',
          process: '日晒',
          variety: '黄波旁',
          percentage: null,
          role: '',
          notes: '',
        },
      ],
    })
    const sourceBean = createBean({
      id: 'source',
      name: 'Similar Unknown Ratio Blend',
      bean_type: 'blend',
      origin: '巴西 / 哥伦比亚',
      process: '日晒 / 蜜处理',
      variety: '黄波旁 / 卡杜拉',
      blend_components: [],
    })

    const result = generateRuleRecommendation(targetBean, [targetBean, sourceBean], [
      createBrewLog({
        id: 'source-brew',
        bean_id: 'source',
        rating: 4,
        ratio: '1:15.5',
      }),
    ])

    expect(result?.primary?.brewLog.id).toBe('source-brew')
    expect(result?.primary?.reasons.join(' / ')).toContain('拼配文字信息相近')
  })
})
