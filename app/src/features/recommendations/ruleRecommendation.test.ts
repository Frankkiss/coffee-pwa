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
    remaining_grams: null,
    price: null,
    purchase_date: null,
    source_url: null,
    image_url: null,
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
    expect(result?.primary.brewLog.id).toBe('best')
    expect(result?.primary.recommended.ratio).toBe('1:16')
    expect(result?.primary.reasons).toContain('处理法相同')
    expect(result?.primary.reasons).toContain('已钉为候选方案')
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
})
