import { describe, expect, it } from 'vitest'
import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import { buildBackupDocument, createBackupFileName } from './backupExport'

describe('backup export', () => {
  it('builds a versioned JSON backup document with record counts', () => {
    const beans = [
      {
        id: 'bean-1',
        user_id: 'user-1',
        name: 'Ethiopia Test',
        roaster: 'Test Roaster',
        origin: 'Ethiopia',
        farm_or_station: null,
        process: '水洗',
        variety: null,
        altitude_meters: null,
        roast_date: null,
        roast_level: '浅烘',
        flavor_tags: ['柑橘'],
        flavor_notes: null,
        net_weight_grams: 100,
        remaining_grams: 88,
        price: null,
        purchase_date: null,
        source_url: null,
        image_url: null,
        notes: null,
        created_at: '2026-06-12T01:00:00.000Z',
        updated_at: '2026-06-12T01:00:00.000Z',
        deleted_at: null,
        schema_version: 1,
      },
    ] satisfies Bean[]

    const brewLogs = [
      {
        id: 'brew-1',
        user_id: 'user-1',
        bean_id: 'bean-1',
        brewed_at: '2026-06-12T02:00:00.000Z',
        method: 'V60',
        dripper: null,
        filter_paper: null,
        grinder: null,
        grind_setting: '20',
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
        flavor_tags: ['干净'],
        is_pinned_recipe: false,
        notes: null,
        created_at: '2026-06-12T02:00:00.000Z',
        updated_at: '2026-06-12T02:00:00.000Z',
        deleted_at: null,
        schema_version: 1,
      },
    ] satisfies BrewLog[]

    const backup = buildBackupDocument({
      userId: 'user-1',
      exportedAt: '2026-06-12T03:00:00.000Z',
      beans,
      brewLogs,
    })

    expect(backup.schemaVersion).toBe(1)
    expect(backup.userId).toBe('user-1')
    expect(backup.exportedAt).toBe('2026-06-12T03:00:00.000Z')
    expect(backup.includesImages).toBe(false)
    expect(backup.recordCounts).toEqual({ beans: 1, brewLogs: 1 })
    expect(backup.data.beans[0].name).toBe('Ethiopia Test')
    expect(backup.data.brewLogs[0].ratio).toBe('1:16')
  })

  it('creates a date-based JSON backup filename', () => {
    expect(createBackupFileName(new Date('2026-06-12T03:00:00.000Z'))).toBe(
      'coffee-backup-2026-06-12.json',
    )
  })
})
