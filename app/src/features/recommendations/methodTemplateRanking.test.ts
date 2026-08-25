import { describe, expect, it } from 'vitest'
import type { Bean } from '../beans/beanTypes'
import { brewTemplates } from '../brewTemplates/brewTemplates'
import { createRecommendationContext } from './recommendationContext'
import { rankMethodTemplates } from './methodTemplateRanking'

function bean(overrides: Partial<Bean> = {}): Bean {
  return {
    id: 'bean-1', name: '测试豆', process: '水洗', origin: '埃塞俄比亚',
    farm_or_station: null, variety: 'Heirloom', roast_level: '浅烘',
    roast_date: '2026-08-10', flavor_tags: ['花香', '柑橘'],
    bean_type: 'single_origin', blend_components: [], blend_notes: null,
    altitude_meters: 1900,
    ...overrides,
  } as Bean
}

function hotContext(targetBean: Bean, brewer: string) {
  return createRecommendationContext({
    targetBean,
    mode: 'hot_pourover',
    variant: null,
    brewer,
    grinder: 'C40',
    espressoDoseGrams: null,
    tasteGoals: ['甜感'],
    now: new Date('2026-08-23T12:00:00Z'),
  })
}

describe('method template ranking', () => {
  it('prioritizes a template compatible with the selected brewer', () => {
    const ranked = rankMethodTemplates(hotContext(bean(), 'Orea 平底滤杯'), brewTemplates)

    expect(ranked[0].template.id).toBe('hot-orea-balanced-flat')
    expect(ranked[0].reasons).toContain('器具匹配')
  })

  it('prioritizes a roast-specific template for a dark-roast bean', () => {
    const ranked = rankMethodTemplates(
      hotContext(bean({ roast_level: '深烘', flavor_tags: ['巧克力', '坚果'] }), 'V60'),
      brewTemplates,
    )

    expect(ranked[0].template.id).toBe('hot-frontstreet-dark-low-temp')
    expect(ranked[0].reasons).toContain('烘焙度匹配')
  })

  it('keeps every cold-brew candidate inside the selected variant', () => {
    const targetBean = bean()
    const context = createRecommendationContext({
      targetBean,
      mode: 'cold_brew',
      variant: 'concentrate',
      brewer: '冷萃壶',
      grinder: 'C40',
      espressoDoseGrams: null,
      tasteGoals: [],
      now: new Date('2026-08-23T12:00:00Z'),
    })

    expect(rankMethodTemplates(context, brewTemplates)
      .every(({ template }) => template.brewVariant === 'concentrate')).toBe(true)
  })

  it('does not rank from blend component metadata or blend notes', () => {
    const targetBean = bean({
      bean_type: 'blend',
      process: null,
      roast_level: null,
      flavor_tags: [],
      blend_notes: '深烘 巧克力',
      blend_components: [{ origin: '巴西', process: '日晒', variety: '波旁', percentage: 100 }],
    })

    const ranked = rankMethodTemplates(hotContext(targetBean, 'V60'), brewTemplates)
    expect(ranked[0].reasons).not.toContain('烘焙度匹配')
    expect(ranked[0].reasons).not.toContain('处理法匹配')
    expect(ranked[0].reasons).not.toContain('风味匹配')
  })
})
