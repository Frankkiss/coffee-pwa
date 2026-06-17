import { describe, expect, it } from 'vitest'
import type { Bean } from '../beans/beanTypes'
import { selectTemplateCandidates } from './templateRecommendation'

function createBean(overrides: Partial<Bean> = {}): Bean {
  return {
    id: 'bean-1',
    user_id: 'user-1',
    name: '埃塞俄比亚 水洗',
    roaster: null,
    origin: '埃塞俄比亚',
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

describe('selectTemplateCandidates', () => {
  it('selects daily templates that match a washed bright light roast bean', () => {
    const candidates = selectTemplateCandidates(createBean())

    expect(candidates).toHaveLength(3)
    expect(candidates[0].isChampionReference).toBe(false)
    expect(candidates[0].reasons.join(' / ')).toContain('处理法匹配')
    expect(candidates.some((candidate) => candidate.name.includes('水洗浅烘'))).toBe(true)
  })

  it('keeps champion references optional and never first', () => {
    const candidates = selectTemplateCandidates(
      createBean({
        process: '日晒',
        roast_level: '中浅烘',
        flavor_tags: ['甜感', '莓果', '层次'],
      }),
    )

    expect(candidates).toHaveLength(3)
    expect(candidates[0].isChampionReference).toBe(false)
    expect(candidates.filter((candidate) => candidate.isChampionReference).length).toBeLessThanOrEqual(1)
  })

  it('treats ultra-light roast beans as compatible with light-roast templates', () => {
    const candidates = selectTemplateCandidates(
      createBean({
        roast_level: '极浅烘',
        process: null,
        flavor_tags: [],
      }),
    )

    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.some((candidate) => candidate.reasons.includes('烘焙度匹配'))).toBe(true)
  })

  it('uses blend component processes when selecting template candidates', () => {
    const candidates = selectTemplateCandidates(
      createBean({
        bean_type: 'blend',
        process: '拼配',
        blend_components: [
          {
            origin: '埃塞俄比亚',
            process: '日晒',
            variety: '原生种',
            percentage: 40,
            role: '香气',
            notes: '',
          },
        ],
        flavor_tags: ['甜感', '莓果'],
      }),
    )

    expect(candidates.some((candidate) => candidate.reasons.join(' / ').includes('拼配处理法匹配'))).toBe(true)
  })

  it('uses multi-value process text when blend components are incomplete', () => {
    const candidates = selectTemplateCandidates(
      createBean({
        bean_type: 'blend',
        process: '日晒 / 水洗',
        blend_components: [],
        flavor_tags: ['甜感'],
      }),
    )

    expect(candidates.some((candidate) => candidate.reasons.join(' / ').includes('处理法线索匹配'))).toBe(true)
  })
})
