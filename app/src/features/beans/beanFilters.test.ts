import { describe, expect, it } from 'vitest'
import type { Bean } from './beanTypes'
import { filterBeans } from './beanFilters'

function createBean(overrides: Partial<Bean>): Bean {
  return {
    id: 'bean-1',
    user_id: 'user-1',
    name: '埃塞俄比亚 水洗',
    roaster: '默认烘焙',
    origin: 'Ethiopia',
    farm_or_station: 'Aricha',
    process: '水洗',
    variety: 'Heirloom',
    altitude_meters: null,
    roast_date: null,
    roast_level: '浅烘',
    flavor_tags: [],
    flavor_notes: null,
    net_weight_grams: null,
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

describe('filterBeans', () => {
  const beans = [
    createBean({ id: 'ethiopia', name: '埃塞俄比亚 水洗', process: '水洗' }),
    createBean({
      id: 'colombia',
      name: '哥伦比亚 粉波旁',
      roaster: '北方烘焙',
      origin: 'Colombia',
      farm_or_station: 'El Diviso',
      process: '厌氧',
      roast_level: '中浅烘',
    }),
  ]

  it('searches by name, roaster, origin, and station', () => {
    expect(filterBeans(beans, { search: '粉波旁', process: '', roastLevel: '' })).toHaveLength(1)
    expect(filterBeans(beans, { search: '北方', process: '', roastLevel: '' })[0].id).toBe(
      'colombia',
    )
    expect(filterBeans(beans, { search: 'colombia', process: '', roastLevel: '' })[0].id).toBe(
      'colombia',
    )
    expect(filterBeans(beans, { search: 'diviso', process: '', roastLevel: '' })[0].id).toBe(
      'colombia',
    )
  })

  it('filters by process and roast level', () => {
    expect(
      filterBeans(beans, { search: '', process: '厌氧', roastLevel: '中浅烘' }).map(
        (bean) => bean.id,
      ),
    ).toEqual(['colombia'])
  })
})
