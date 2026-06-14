import { describe, expect, it } from 'vitest'
import { filterBrewLogs } from './brewFilters'
import type { BrewLog } from './brewTypes'

function createLog(overrides: Partial<BrewLog>): BrewLog {
  return {
    id: 'log-1',
    user_id: 'user-1',
    bean_id: 'bean-1',
    brewed_at: '2026-06-14T08:00:00.000Z',
    method: 'V60',
    dripper: 'Hario',
    filter_paper: 'Hario 01',
    grinder: 'C40',
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
    notes: 'clean sweetness',
    created_at: '2026-06-14T08:00:00.000Z',
    updated_at: '2026-06-14T08:00:00.000Z',
    deleted_at: null,
    schema_version: 1,
    ...overrides,
  }
}

describe('filterBrewLogs', () => {
  const logs = [
    createLog({ id: 'v60', bean_id: 'bean-1', method: 'V60', notes: 'bright citrus' }),
    createLog({
      id: 'origami',
      bean_id: 'bean-2',
      method: 'Origami',
      dripper: 'Origami',
      grinder: 'K Ultra',
      grind_setting: '7.2',
      flavor_tags: ['berry', 'honey'],
      notes: 'round body',
      is_pinned_recipe: true,
    }),
  ]

  it('searches method, dripper, grinder, grind setting, flavor tags, and notes', () => {
    expect(filterBrewLogs(logs, { query: 'berry', beanId: '', method: '', pinned: 'all' })).toHaveLength(1)
    expect(filterBrewLogs(logs, { query: 'k ultra', beanId: '', method: '', pinned: 'all' })).toHaveLength(1)
    expect(filterBrewLogs(logs, { query: '22 clicks', beanId: '', method: '', pinned: 'all' })).toHaveLength(1)
    expect(filterBrewLogs(logs, { query: 'missing', beanId: '', method: '', pinned: 'all' })).toHaveLength(0)
  })

  it('filters by bean, method, and pinned recipe state', () => {
    expect(filterBrewLogs(logs, { query: '', beanId: 'bean-2', method: '', pinned: 'all' })).toHaveLength(1)
    expect(filterBrewLogs(logs, { query: '', beanId: '', method: 'Origami', pinned: 'all' })).toHaveLength(1)
    expect(filterBrewLogs(logs, { query: '', beanId: '', method: '', pinned: 'pinned' })).toHaveLength(1)
    expect(filterBrewLogs(logs, { query: '', beanId: '', method: '', pinned: 'unpinned' })).toHaveLength(1)
  })
})
