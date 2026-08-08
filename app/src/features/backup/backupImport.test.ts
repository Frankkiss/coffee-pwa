import { describe, expect, it } from 'vitest'
import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import type { UserBrewTemplateRow } from '../brewTemplates/brewTemplateTypes'
import type { BackupDocument } from './backupTypes'
import {
  buildBackupImportPayloads,
  createBackupImportPreview,
  parseBackupDocument,
} from './backupImport'

const bean = {
  id: 'bean-1',
  user_id: 'old-user',
  name: 'Ethiopia Test',
  roaster: null,
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
  price: null,
  purchase_date: null,
  source_url: null,
  image_url: null,
  notes: null,
  created_at: '2026-06-12T01:00:00.000Z',
  updated_at: '2026-06-12T01:00:00.000Z',
  deleted_at: null,
  schema_version: 1,
} satisfies Bean

const brewLog = {
  id: 'brew-1',
  user_id: 'old-user',
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
} satisfies BrewLog

const brewTemplate = {
  id: 'template-1',
  user_id: 'old-user',
  name: '我的 V60',
  category: 'daily-pourover',
  difficulty: 'easy',
  brewer: 'V60',
  filter: 'V60 滤纸',
  dose_grams: 15,
  water_grams: 240,
  ratio: '1:16',
  water_temperature_min: 91,
  water_temperature_max: 93,
  grind_size: '中细研磨',
  target_time_min: 135,
  target_time_max: 165,
  pour_steps: [],
  suitable_for: ['水洗'],
  avoid_for: [],
  flavor_goal: '干净',
  adjustment_rules: [],
  source_notes: '自定义',
  source_urls: [],
  is_champion_reference: false,
  copied_from_template_id: null,
  created_at: '2026-06-12T02:30:00.000Z',
  updated_at: '2026-06-12T02:30:00.000Z',
  deleted_at: null,
  schema_version: 1,
} satisfies UserBrewTemplateRow

function createBackupDocument(
  beans: Bean[] = [bean],
  brewLogs: BrewLog[] = [brewLog],
): BackupDocument {
  return {
    schemaVersion: 1,
    exportedAt: '2026-06-12T03:00:00.000Z',
    userId: 'old-user',
    includesImages: false,
    recordCounts: {
      beans: beans.length,
      brewLogs: brewLogs.length,
    },
    data: {
      beans,
      brewLogs,
    },
  }
}

describe('backup import', () => {
  it('parses a version 1 backup document', () => {
    const parsed = parseBackupDocument(JSON.stringify(createBackupDocument()))

    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.data.beans[0].id).toBe('bean-1')
    expect(parsed.data.brewLogs[0].id).toBe('brew-1')
  })

  it('rejects invalid backup JSON', () => {
    expect(() => parseBackupDocument('{"schemaVersion":2}')).toThrow(
      '备份文件格式不正确',
    )
  })

  it('previews importable and duplicate rows by id', () => {
    const preview = createBackupImportPreview(createBackupDocument(), {
      beanIds: new Set(['bean-1']),
      brewLogIds: new Set<string>(),
    })

    expect(preview.total).toEqual({ beans: 1, brewLogs: 1, brewTemplates: 0 })
    expect(preview.duplicates).toEqual({ beans: 1, brewLogs: 0, brewTemplates: 0 })
    expect(preview.importable).toEqual({ beans: 0, brewLogs: 1, brewTemplates: 0 })
    expect(preview.importableBeanIds.has('bean-1')).toBe(false)
    expect(preview.importableBrewLogIds.has('brew-1')).toBe(true)
  })

  it('rewrites imported rows to the current user and keeps valid bean links', () => {
    const backup = createBackupDocument()
    const preview = createBackupImportPreview(backup, {
      beanIds: new Set<string>(),
      brewLogIds: new Set<string>(),
    })

    const payloads = buildBackupImportPayloads(backup, preview, 'current-user', {
      existingBeanIds: new Set<string>(),
    })

    expect(payloads.beans[0].id).toBe('bean-1')
    expect(payloads.beans[0].user_id).toBe('current-user')
    expect(payloads.brewLogs[0].id).toBe('brew-1')
    expect(payloads.brewLogs[0].user_id).toBe('current-user')
    expect(payloads.brewLogs[0].bean_id).toBe('bean-1')
  })

  it('nulls a brew log bean link when the referenced bean is unavailable', () => {
    const orphanedBrewLog = {
      ...brewLog,
      bean_id: 'missing-bean',
    } satisfies BrewLog
    const backup = createBackupDocument([], [orphanedBrewLog])
    const preview = createBackupImportPreview(backup, {
      beanIds: new Set<string>(),
      brewLogIds: new Set<string>(),
    })

    const payloads = buildBackupImportPayloads(backup, preview, 'current-user', {
      existingBeanIds: new Set<string>(),
    })

    expect(payloads.beans).toHaveLength(0)
    expect(payloads.brewLogs[0].bean_id).toBeNull()
  })

  it('rewrites imported custom templates to the current user', () => {
    const backup: BackupDocument = {
      ...createBackupDocument([], []),
      recordCounts: {
        beans: 0,
        brewLogs: 0,
        brewTemplates: 1,
      },
      data: {
        beans: [],
        brewLogs: [],
        brewTemplates: [brewTemplate],
      },
    }
    const preview = createBackupImportPreview(backup, {
      beanIds: new Set<string>(),
      brewLogIds: new Set<string>(),
      brewTemplateIds: new Set<string>(),
    })

    const payloads = buildBackupImportPayloads(backup, preview, 'current-user', {
      existingBeanIds: new Set<string>(),
    })

    expect(payloads.brewTemplates[0].id).toBe('template-1')
    expect(payloads.brewTemplates[0].user_id).toBe('current-user')
    expect(payloads.brewTemplates[0].deleted_at).toBeNull()
  })
})
