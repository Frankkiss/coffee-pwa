import { describe, expect, it } from 'vitest'
import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import { buildBeansCsv, buildBrewLogsCsv, createCsvFileName } from './csvExport'

function createBean(overrides: Partial<Bean> = {}): Bean {
  return {
    id: 'bean-1',
    user_id: 'user-1',
    name: 'Ethiopia Test',
    roaster: 'Test Roaster',
    origin: 'Ethiopia',
    farm_or_station: 'Station A',
    process: '蜜处理,特殊',
    variety: 'Heirloom',
    altitude_meters: 1900,
    roast_date: '2026-06-01',
    roast_level: '浅烘',
    flavor_tags: ['citrus', 'honey'],
    flavor_notes: null,
    net_weight_grams: 100,
    remaining_grams: 88,
    price: null,
    purchase_date: null,
    source_url: null,
    image_url: null,
    bean_type: 'blend',
    blend_components: [
      {
        origin: '巴西',
        process: '日晒',
        variety: '黄波旁',
        percentage: 60,
        role: '',
        notes: '主体甜感',
      },
    ],
    blend_notes: '60% 巴西 日晒 黄波旁，主体甜感',
    notes: 'line one\nline two',
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
    method: 'V60',
    dripper: 'Hario',
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
    flavor_tags: ['citrus', 'honey'],
    is_pinned_recipe: true,
    notes: 'clean "sweet" cup',
    created_at: '2026-06-12T02:00:00.000Z',
    updated_at: '2026-06-12T02:00:00.000Z',
    deleted_at: null,
    schema_version: 1,
    ...overrides,
  }
}

describe('CSV export', () => {
  it('builds a beans CSV with Chinese headers and escaped cells', () => {
    const csv = buildBeansCsv([createBean()])

    expect(csv).toContain('名称,烘焙商,豆子类型,产地')
    expect(csv).toContain('豆子类型')
    expect(csv).toContain('拼配豆')
    expect(csv).toContain('60% 巴西 日晒 黄波旁，主体甜感')
    expect(csv).toContain('"蜜处理,特殊"')
    expect(csv).toContain('citrus、honey')
    expect(csv).toContain('"line one\nline two"')
  })

  it('builds a brew logs CSV with array fields and escaped quotes', () => {
    const csv = buildBrewLogsCsv([createBrewLog()])

    expect(csv).toContain('咖啡豆ID,冲煮时间,方式')
    expect(csv).toContain('citrus、honey')
    expect(csv).toContain('"clean ""sweet"" cup"')
  })

  it('creates date-based CSV filenames', () => {
    const date = new Date('2026-06-14T01:00:00.000Z')

    expect(createCsvFileName('beans', date)).toBe('coffee-beans-2026-06-14.csv')
    expect(createCsvFileName('brew-logs', date)).toBe('coffee-brew-logs-2026-06-14.csv')
  })
})
