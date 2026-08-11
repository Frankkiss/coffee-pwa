import { describe, expect, it, vi } from 'vitest'
import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import { loadRuleRecommendationData } from './recommendationService'

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
