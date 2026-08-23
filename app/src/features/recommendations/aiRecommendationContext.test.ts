import { describe, expect, it } from 'vitest'
import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import type { RuleRecommendationResult } from './recommendationTypes'
import { buildAiRecommendationContext } from './aiRecommendationContext'

describe('buildAiRecommendationContext', () => {
  it('sends only allow-listed bean fields and at most three compact references', () => {
    const context = buildAiRecommendationContext(createResult())
    const serialized = JSON.stringify(context)

    expect(serialized).not.toMatch(/remaining_grams|blend_components|blend_notes|source_url|image_url/)
    expect(context.references).toHaveLength(3)
    expect(context.selection).toMatchObject({ mode: 'hot_pourover', brewer: 'V60', grinder: 'C40' })
    expect(context.rule.allowedRanges.ratioDenominator).toEqual({ min: 14, max: 18 })
    expect(context.templates.alternatives).toHaveLength(2)
  })
})

function createResult(): RuleRecommendationResult {
  const bean = {
    id: 'bean-1', name: '测试豆', roaster: '烘焙商', bean_type: 'blend', origin: '埃塞俄比亚',
    farm_or_station: '站点', process: '水洗', variety: '74110', altitude_meters: 2000,
    roast_date: '2026-08-20', roast_level: '浅烘', flavor_tags: ['茉莉'], flavor_notes: '干净',
    remaining_grams: 88, source_url: 'https://private.example', image_url: 'private.jpg',
    blend_components: [{ origin: '秘密', process: '', variety: '', percentage: null, role: '', notes: '' }],
    blend_notes: '不发送', user_id: 'user', net_weight_grams: 100, price: null, purchase_date: null,
    notes: null, created_at: '', updated_at: '', deleted_at: null, schema_version: 1,
  } as Bean
  const brewLog = {
    id: 'brew', rating: 5, notes: '甜感好', acidity: 2, sweetness: 4, bitterness: 1,
    astringency: 1, body: 3, aftertaste: 4, dripper: 'V60', grinder: 'C40',
  } as BrewLog
  const recipe = {
    method: '热手冲', brewMode: 'hot_pourover' as const, brewVariant: null, dripper: 'V60', grinder: 'C40',
    grindSetting: '24', coffeeGrams: 15, waterGrams: 240, iceGrams: null, beverageGrams: null,
    ratio: '1:16', waterTemperatureC: 92, totalTimeSeconds: 150,
  }
  return {
    targetBean: bean, primary: null,
    references: [0, 1, 2, 3].map((index) => ({ bean, brewLog: { ...brewLog, id: `brew-${index}` }, score: 10, reasons: [], recommended: recipe })),
    templateCandidates: [0, 1, 2].map((index) => ({ id: `t-${index}`, name: `模板${index}`, brewer: 'V60', ratio: '1:16', waterTemperature: '90-94°C', targetTime: '2:00-3:00', pourSummary: '', isChampionReference: false, score: 1, reasons: [] })),
    recommended: recipe, confidence: 'high', baseSource: { type: 'history', label: '测试豆', brewLogId: 'brew-0' }, beanAdjustmentReasons: [],
    selection: { mode: 'hot_pourover', variant: null, brewer: 'V60', grinder: 'C40', espressoDoseGrams: null, tasteGoals: ['甜感'] },
    allowedRanges: { ratioDenominator: { min: 14, max: 18 }, waterTemperatureC: { min: 84, max: 96 }, coffeeGrams: { min: 15, max: 15 }, waterGrams: { min: 210, max: 270 }, iceGrams: null, beverageGrams: null, totalTimeSeconds: { min: 90, max: 300 } },
  }
}
