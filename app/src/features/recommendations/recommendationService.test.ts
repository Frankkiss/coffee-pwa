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
    {} as never,
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
