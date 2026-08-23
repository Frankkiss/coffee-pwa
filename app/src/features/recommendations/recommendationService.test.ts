import { describe, expect, it, vi } from 'vitest'
import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import {
  loadRuleRecommendationData,
  saveRecommendation,
  requestAiRecommendation,
  softDeleteSavedRecommendation,
  updateSavedRecommendationAccepted,
} from './recommendationService'

it('blocks all saved recommendation writes in protection mode before touching Supabase', async () => {
  await expect(saveRecommendation(null as never, {} as never, 'protection'))
    .rejects.toMatchObject({ code: 'SYNC_PROTECTION_MODE' })
  await expect(updateSavedRecommendationAccepted(null as never, 'id', true, 'protection'))
    .rejects.toMatchObject({ code: 'SYNC_PROTECTION_MODE' })
  await expect(softDeleteSavedRecommendation(null as never, 'id', 'protection'))
    .rejects.toMatchObject({ code: 'SYNC_PROTECTION_MODE' })
})

it('maps Edge Function invocation failures to a stable configured error', async () => {
  const invoke = vi.fn().mockResolvedValue({
    data: null,
    error: { message: 'PRIVATE SUPABASE ERROR DETAIL' },
  })
  const result = await requestAiRecommendation(
    { functions: { invoke } } as never,
    createAiRuleResult(),
  )

  expect(result).toEqual({
    configured: true,
    suggestion: null,
    structured: null,
    error: 'AI_FUNCTION_ERROR',
  })
  expect(JSON.stringify(result)).not.toContain('PRIVATE SUPABASE ERROR DETAIL')
  expect(invoke).toHaveBeenCalledWith('recommend-brew', {
    body: expect.any(Object),
  })
})

function createAiRuleResult() {
  return {
    targetBean: {
      id: 'bean-1', name: '测试豆', roaster: null, bean_type: 'single_origin', origin: null,
      farm_or_station: null, process: null, variety: null, altitude_meters: null,
      roast_date: null, roast_level: null, flavor_tags: [], flavor_notes: null,
    },
    primary: null,
    references: [],
    templateCandidates: [],
    recommended: {
      method: '热手冲', brewMode: 'hot_pourover', brewVariant: null, dripper: 'V60', grinder: 'C40',
      grindSetting: '24', waterTemperatureC: 92, coffeeGrams: 15, waterGrams: 240,
      iceGrams: null, beverageGrams: null, ratio: '1:16', totalTimeSeconds: 150,
    },
    confidence: 'high',
    baseSource: { type: 'history', label: '测试豆', brewLogId: 'brew-1' },
    beanAdjustmentReasons: [],
    selection: { mode: 'hot_pourover', variant: null, brewer: 'V60', grinder: 'C40', espressoDoseGrams: null, tasteGoals: [] },
    allowedRanges: { ratioDenominator: { min: 14, max: 18 }, waterTemperatureC: { min: 84, max: 96 }, coffeeGrams: { min: 15, max: 15 }, waterGrams: { min: 210, max: 270 }, iceGrams: null, beverageGrams: null, totalTimeSeconds: { min: 90, max: 300 } },
  } as never
}

describe('loadRuleRecommendationData', () => {
  it('loads rule inputs from local repositories and keeps system templates read-only', async () => {
    const beans = [{ id: 'bean-1' }] as Bean[]
    const brewLogs = [{ id: 'brew-1' }] as BrewLog[]
    const inputs = {
      beans: { listBeans: vi.fn().mockResolvedValue(beans) },
      brewLogs: { listBrewLogs: vi.fn().mockResolvedValue(brewLogs) },
      brewTemplates: { listBrewTemplates: vi.fn().mockResolvedValue([]) },
    }

    const result = await loadRuleRecommendationData(inputs)

    expect(inputs.beans.listBeans).toHaveBeenCalledOnce()
    expect(inputs.brewLogs.listBrewLogs).toHaveBeenCalledOnce()
    expect(inputs.brewTemplates.listBrewTemplates).toHaveBeenCalledOnce()
    expect(result.beans).toBe(beans)
    expect(result.brewLogs).toBe(brewLogs)
    expect(result.templates.length).toBeGreaterThan(0)
    expect(result.templates.every((template) => template.source !== 'user')).toBe(true)
  })
})
