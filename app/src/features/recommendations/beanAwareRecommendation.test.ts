import { describe, expect, it } from 'vitest'
import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import type { BrewTemplate } from '../brewTemplates/brewTemplateTypes'
import { generateRuleRecommendation } from './ruleRecommendation'
import { selectTemplateCandidates } from './templateRecommendation'

function createBean(overrides: Partial<Bean> = {}): Bean {
  return {
    id: 'bean-1',
    user_id: 'user-1',
    name: 'Test bean',
    roaster: null,
    origin: 'Ethiopia',
    farm_or_station: 'Chelbesa',
    process: 'Washed',
    variety: '74110 Heirloom',
    altitude_meters: 2050,
    roast_date: null,
    roast_level: 'Light',
    flavor_tags: ['citrus', 'floral'],
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
    method: 'Pourover',
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
    flavor_tags: ['citrus'],
    is_pinned_recipe: false,
    notes: null,
    created_at: '2026-06-12T02:00:00.000Z',
    updated_at: '2026-06-12T02:00:00.000Z',
    deleted_at: null,
    schema_version: 1,
    ...overrides,
  }
}

function createTemplate(overrides: Partial<BrewTemplate> = {}): BrewTemplate {
  return {
    id: 'balanced-template',
    name: 'Balanced V60',
    category: 'daily-pourover',
    difficulty: 'easy',
    brewer: 'V60',
    filter: 'cone paper',
    doseGrams: 15,
    waterGrams: 240,
    ratio: '1:16',
    waterTemperatureC: { min: 92, max: 94 },
    grindSize: 'medium fine',
    targetTimeSeconds: { min: 145, max: 165 },
    pourSteps: [
      {
        order: 1,
        startSeconds: 0,
        endSeconds: 30,
        targetWaterGrams: 45,
        label: 'Bloom',
        action: 'Wet the bed evenly.',
      },
    ],
    suitableFor: ['Washed', 'Light', 'citrus', 'floral'],
    avoidFor: [],
    flavorGoal: 'clear sweetness',
    adjustmentRules: [],
    sourceNotes: '',
    sourceUrls: [],
    isChampionReference: false,
    ...overrides,
  }
}

describe('bean-aware recommendation rules', () => {
  it('falls back to a low-confidence template recommendation when history is empty', () => {
    const result = generateRuleRecommendation(createBean(), [createBean()], [], [createTemplate()])

    expect(result).not.toBeNull()
    expect(result?.primary).toBeNull()
    expect(result?.baseSource).toMatchObject({ type: 'template', templateId: 'balanced-template' })
    expect(result?.confidence).toBe('low')
    expect(result?.recommended).toMatchObject({ dripper: 'V60', ratio: '1:16' })
    expect(result?.beanAdjustmentReasons.length).toBeGreaterThan(0)
  })

  it('prefers history from a matching station and altitude band over a higher-rated weak bean match', () => {
    const targetBean = createBean({ id: 'target', altitude_meters: 2100 })
    const stationMatch = createBean({ id: 'station-match', farm_or_station: 'Chelbesa', altitude_meters: 2050 })
    const weakMatch = createBean({
      id: 'weak-match',
      farm_or_station: 'Lowland mill',
      altitude_meters: 1050,
      flavor_tags: ['nutty'],
    })

    const result = generateRuleRecommendation(
      targetBean,
      [targetBean, stationMatch, weakMatch],
      [
        createBrewLog({ id: 'weak-brew', bean_id: 'weak-match', rating: 5, water_temperature_c: 90 }),
        createBrewLog({ id: 'station-brew', bean_id: 'station-match', rating: 4, water_temperature_c: 92 }),
      ],
      [createTemplate()],
    )

    expect(result?.primary?.brewLog.id).toBe('station-brew')
    expect(result?.primary?.reasons.join(' / ')).toContain('station')
    expect(result?.primary?.reasons.join(' / ')).toContain('altitude')
    expect(result?.confidence).toBe('high')
  })

  it('applies bounded bean-aware extraction adjustments to the final rule recipe', () => {
    const anaerobicBean = createBean({
      id: 'target',
      process: 'Anaerobic natural',
      roast_level: 'Medium dark',
      flavor_tags: ['berry', 'winey'],
      altitude_meters: 1450,
    })

    const result = generateRuleRecommendation(
      anaerobicBean,
      [anaerobicBean],
      [createBrewLog({ bean_id: 'target', water_temperature_c: 96, total_time_seconds: 180 })],
      [createTemplate({ suitableFor: ['Anaerobic', 'berry'], waterTemperatureC: { min: 90, max: 93 } })],
    )

    expect(result?.recommended.waterTemperatureC).toBeLessThanOrEqual(94)
    expect(result?.recommended.totalTimeSeconds).toBeLessThanOrEqual(175)
    expect(result?.beanAdjustmentReasons.join(' / ')).toContain('anaerobic')
  })

  it('penalizes templates that explicitly avoid the target bean style', () => {
    const darkWashedBean = createBean({
      roast_level: 'Dark',
      process: 'Washed',
      flavor_tags: ['chocolate'],
      altitude_meters: 900,
    })
    const aggressiveLightTemplate = createTemplate({
      id: 'aggressive-light',
      name: 'Aggressive light roast V60',
      category: 'bean-specific',
      suitableFor: ['Washed', 'chocolate'],
      avoidFor: ['Dark'],
      waterTemperatureC: { min: 95, max: 97 },
    })
    const darkTemplate = createTemplate({
      id: 'dark-friendly',
      name: 'Dark roast gentle Kalita',
      brewer: 'Kalita Wave',
      suitableFor: ['Dark', 'chocolate'],
      avoidFor: [],
      waterTemperatureC: { min: 86, max: 89 },
    })

    const candidates = selectTemplateCandidates(darkWashedBean, [aggressiveLightTemplate, darkTemplate])

    expect(candidates[0].id).toBe('dark-friendly')
    expect(candidates.find((candidate) => candidate.id === 'aggressive-light')?.reasons.join(' / ')).toContain('avoid')
  })
})