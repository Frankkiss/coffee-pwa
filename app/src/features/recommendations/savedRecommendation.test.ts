import { describe, expect, it } from 'vitest'
import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import type {
  AiRecommendationResponse,
  RuleRecommendationResult,
} from './recommendationTypes'
import { buildSavedRecommendationPayload } from './savedRecommendation'

function createBean(overrides: Partial<Bean> = {}): Bean {
  return {
    id: 'bean-1',
    user_id: 'user-1',
    name: '埃塞俄比亚 花魁',
    roaster: '测试烘焙',
    origin: 'Ethiopia',
    farm_or_station: 'Hambella',
    process: '日晒',
    variety: 'Heirloom',
    altitude_meters: 1950,
    roast_date: '2026-06-01',
    roast_level: '浅烘',
    flavor_tags: ['草莓'],
    flavor_notes: null,
    net_weight_grams: null,
    remaining_grams: null,
    price: null,
    purchase_date: null,
    source_url: null,
    image_url: null,
    notes: null,
    created_at: '2026-06-10T08:00:00.000Z',
    updated_at: '2026-06-10T08:00:00.000Z',
    deleted_at: null,
    schema_version: 1,
    ...overrides,
  }
}

function createBrewLog(overrides: Partial<BrewLog> = {}): BrewLog {
  return {
    id: 'brew-1',
    user_id: 'user-1',
    bean_id: 'bean-2',
    brewed_at: '2026-06-15T08:30:00.000Z',
    method: '手冲',
    dripper: 'V60',
    filter_paper: null,
    grinder: 'C40',
    grind_setting: '22 clicks',
    coffee_grams: 15,
    water_grams: 240,
    ratio: '1:16',
    water_temperature_c: 92,
    total_time_seconds: 150,
    pour_steps: [],
    rating: 4.5,
    acidity: null,
    sweetness: null,
    bitterness: null,
    astringency: null,
    body: null,
    aftertaste: null,
    flavor_tags: ['莓果'],
    is_pinned_recipe: true,
    notes: null,
    created_at: '2026-06-15T08:30:00.000Z',
    updated_at: '2026-06-15T08:30:00.000Z',
    deleted_at: null,
    schema_version: 1,
    ...overrides,
  }
}

function createRuleRecommendation(): RuleRecommendationResult {
  const targetBean = createBean()
  const sourceBean = createBean({ id: 'bean-2', name: '埃塞俄比亚 罕贝拉' })
  const brewLog = createBrewLog()

  return {
    targetBean,
    primary: {
      bean: sourceBean,
      brewLog,
      score: 21,
      reasons: ['处理法相同', '评分较高'],
      recommended: {
        method: '手冲',
        dripper: 'V60',
        grindSetting: '22 clicks',
        ratio: '1:16',
        waterTemperatureC: 92,
        totalTimeSeconds: 150,
      },
    },
    references: [
      {
        bean: sourceBean,
        brewLog,
        score: 21,
        reasons: ['处理法相同'],
        recommended: {
          method: '手冲',
          dripper: 'V60',
          grindSetting: '22 clicks',
          ratio: '1:16',
          waterTemperatureC: 92,
          totalTimeSeconds: 150,
        },
      },
    ],
    templateCandidates: [
      {
        id: 'classic-v60-three-pour',
        name: '经典三段式 V60',
        brewer: 'V60',
        ratio: '1:16',
        waterTemperature: '91-93°C',
        targetTime: '2:20-2:50',
        pourSummary: '1. 0:00 到 40g',
        isChampionReference: false,
        score: 20,
        reasons: ['处理法匹配'],
      },
    ],
  }
}

describe('buildSavedRecommendationPayload', () => {
  it('creates a user-scoped AI recommendation payload without becoming a brew log', () => {
    const aiRecommendation: AiRecommendationResponse = {
      configured: true,
      suggestion: '建议从 1:16、92°C、V60 开始。',
    }

    const payload = buildSavedRecommendationPayload({
      userId: 'user-1',
      ruleRecommendation: createRuleRecommendation(),
      aiRecommendation,
    })

    expect(payload.user_id).toBe('user-1')
    expect(payload.bean_id).toBe('bean-1')
    expect(payload.model_name).toBe('deepseek-v4-pro')
    expect(payload.input_context).toMatchObject({
      targetBean: { id: 'bean-1', name: '埃塞俄比亚 花魁' },
      primaryBrewLogId: 'brew-1',
      referenceBrewLogIds: ['brew-1'],
      templateCandidates: [
        {
          id: 'classic-v60-three-pour',
          name: '经典三段式 V60',
        },
      ],
    })
    expect(payload.recommendation).toMatchObject({
      type: 'brew_recommendation',
      source: 'rule_plus_ai',
      rule: {
        recommended: {
          ratio: '1:16',
          waterTemperatureC: 92,
        },
        reasons: ['处理法相同', '评分较高'],
        templateCandidates: [
          {
            id: 'classic-v60-three-pour',
            name: '经典三段式 V60',
          },
        ],
      },
      ai: {
        configured: true,
        suggestion: '建议从 1:16、92°C、V60 开始。',
      },
    })
    expect(payload.accepted).toBe(false)
  })
})
