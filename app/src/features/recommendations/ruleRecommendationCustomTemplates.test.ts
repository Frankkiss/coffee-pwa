import { describe, expect, it } from 'vitest'
import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import type { BrewTemplate } from '../brewTemplates/brewTemplateTypes'
import { createRecommendationContext } from './recommendationContext'
import { generateRuleRecommendation } from './ruleRecommendation'

function createBean(overrides: Partial<Bean> = {}): Bean {
  return {
    id: 'bean-1',
    user_id: 'user-1',
    name: 'Target Bean',
    roaster: null,
    origin: 'Blend',
    farm_or_station: null,
    process: '冷萃',
    variety: null,
    altitude_meters: null,
    roast_date: null,
    roast_level: '中浅烘',
    flavor_tags: ['低酸', '甜感'],
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

function createBrewLog(overrides: Partial<BrewLog> = {}): BrewLog {
  return {
    id: 'brew-1',
    user_id: 'user-1',
    bean_id: 'bean-1',
    brewed_at: '2026-06-12T02:00:00.000Z',
    method: '冷萃',
    dripper: '冷萃壶',
    filter_paper: null,
    grinder: null,
    grind_setting: '中粗研磨',
    coffee_grams: 30,
    water_grams: 300,
    ratio: '1:10',
    water_temperature_c: 6,
    total_time_seconds: 43200,
    pour_steps: [],
    rating: 4,
    acidity: null,
    sweetness: null,
    bitterness: null,
    astringency: null,
    body: null,
    aftertaste: null,
    flavor_tags: ['低酸'],
    is_pinned_recipe: false,
    notes: null,
    created_at: '2026-06-12T02:00:00.000Z',
    updated_at: '2026-06-12T02:00:00.000Z',
    deleted_at: null,
    schema_version: 1,
    ...overrides,
  }
}

const customTemplate = {
  id: 'user-cold-brew',
  name: '我的冷萃壶模板',
  category: 'cold-brew',
  difficulty: 'easy',
  brewer: '冷萃壶',
  filter: '内置滤网',
  doseGrams: 30,
  waterGrams: 300,
  ratio: '1:10',
  waterTemperatureC: { min: 4, max: 8 },
  grindSize: '中粗研磨',
  targetTimeSeconds: { min: 43200, max: 57600 },
  pourSteps: [
    {
      order: 1,
      startSeconds: 0,
      endSeconds: null,
      targetWaterGrams: 300,
      label: '浸泡',
      action: '冷藏浸泡 12-16 小时',
    },
  ],
  suitableFor: ['冷萃', '低酸', '甜感'],
  avoidFor: [],
  flavorGoal: '低酸顺滑',
  adjustmentRules: ['偏淡时延长 2 小时'],
  sourceNotes: '自定义模板',
  sourceUrls: [],
  isChampionReference: false,
  brewMode: 'cold_brew',
  brewVariant: 'ready_to_drink',
  source: 'user',
  userId: 'user-1',
} satisfies BrewTemplate

describe('generateRuleRecommendation with custom templates', () => {
  it('uses custom brew templates as template candidates', () => {
    const targetBean = createBean()
    const result = generateRuleRecommendation(
      createRecommendationContext({
        targetBean,
        mode: 'cold_brew',
        variant: 'ready_to_drink',
        brewer: '冷萃壶',
        grinder: '',
        espressoDoseGrams: null,
        tasteGoals: ['甜感'],
      }),
      [targetBean],
      [createBrewLog()],
      [customTemplate],
    )

    expect(result?.templateCandidates[0].id).toBe('user-cold-brew')
  })
})
