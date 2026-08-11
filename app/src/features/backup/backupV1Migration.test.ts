import { describe, expect, it } from 'vitest'
import type { BackupV1Document } from './backupTypes'
import { normalizeV1ForSafeMerge } from './backupV1Migration'

const beanId = '11111111-1111-4111-8111-111111111111'
const brewId = '22222222-2222-4222-8222-222222222222'

function v1Document(): BackupV1Document {
  return {
    schemaVersion: 1,
    exportedAt: '2026-06-12T03:00:00.000Z',
    userId: '33333333-3333-4333-8333-333333333333',
    includesImages: false,
    recordCounts: { beans: 1, brewLogs: 1 },
    data: {
      beans: [{
        id: beanId, user_id: '33333333-3333-4333-8333-333333333333', name: 'Test',
        roaster: null, origin: null, farm_or_station: null, process: null, variety: null,
        altitude_meters: null, roast_date: null, roast_level: null, flavor_tags: [],
        flavor_notes: null, net_weight_grams: null, price: null, purchase_date: null,
        source_url: null, image_url: null, notes: null, created_at: '2026-06-12T01:00:00.000Z',
        updated_at: '2026-06-12T01:00:00.000Z', deleted_at: null, schema_version: 1,
      }],
      brewLogs: [{
        id: brewId, user_id: '33333333-3333-4333-8333-333333333333', bean_id: beanId,
        brewed_at: '2026-06-12T02:00:00.000Z', method: null, dripper: null,
        filter_paper: null, grinder: null, grind_setting: null, coffee_grams: null,
        water_grams: null, ratio: null, water_temperature_c: null,
        total_time_seconds: null, pour_steps: [], rating: null, acidity: null,
        sweetness: null, bitterness: null, astringency: null, body: null,
        aftertaste: null, flavor_tags: [], is_pinned_recipe: false, notes: null,
        created_at: '2026-06-12T02:00:00.000Z', updated_at: '2026-06-12T02:00:00.000Z',
        deleted_at: null, schema_version: 1,
      }],
    },
  }
}

describe('v1 backup migration', () => {
  it('uses empty transport values without making missing sections authoritative', async () => {
    const migrated = await normalizeV1ForSafeMerge(v1Document())

    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.manifest).toMatchObject({
      sourceSchemaVersion: 1,
      fullRollbackEligible: false,
      authoritativeSections: ['beans', 'brewLogs'],
    })
    expect(migrated.data.brewTemplates).toEqual([])
    expect(migrated.data.aiRecommendations).toEqual([])
    expect(migrated.data.sourceImports).toEqual([])
  })
})
