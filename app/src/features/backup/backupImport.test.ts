import { describe, expect, it } from 'vitest'
import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import type { UserBrewTemplateRow } from '../brewTemplates/brewTemplateTypes'
import type { BackupDocument, BackupV2Document } from './backupTypes'
import { sha256Hex } from './backupChecksum'
import { parseBackupDocument } from './backupImport'

const bean = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: '33333333-3333-4333-8333-333333333333',
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

const v2Bean = {
  ...bean,
  bean_type: 'single_origin',
  blend_components: [],
  blend_notes: null,
} satisfies Bean

const brewLog = {
  id: '22222222-2222-4222-8222-222222222222',
  user_id: '33333333-3333-4333-8333-333333333333',
  bean_id: '11111111-1111-4111-8111-111111111111',
  brew_mode: 'espresso',
  brew_variant: null,
  ice_grams: null,
  beverage_grams: 30,
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
  id: '44444444-4444-4444-8444-444444444444',
  user_id: '33333333-3333-4333-8333-333333333333',
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
    userId: '33333333-3333-4333-8333-333333333333',
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

async function createV2Document(
  overrides: Partial<BackupV2Document['data']> = {},
): Promise<BackupV2Document> {
  const data: BackupV2Document['data'] = {
    profile: null,
    userSettings: null,
    beans: [],
    brewLogs: [],
    brewTemplates: [],
    aiRecommendations: [],
    sourceImports: [],
    ...overrides,
  }
  return {
    schemaVersion: 2,
    manifest: {
      exportedAt: '2026-08-08T00:00:00.000Z',
      appVersion: 'test',
      backupMode: 'lightweight',
      recordCounts: {
        profile: data.profile ? 1 : 0,
        userSettings: data.userSettings ? 1 : 0,
        beans: data.beans.length,
        brewLogs: data.brewLogs.length,
        brewTemplates: data.brewTemplates.length,
        aiRecommendations: data.aiRecommendations.length,
        sourceImports: data.sourceImports.length,
      },
      checksumAlgorithm: 'SHA-256',
      checksum: await sha256Hex(data),
      images: [],
      warnings: [],
    },
    data,
  }
}

describe('backup import', () => {
  it('parses v1 only for safe merge', async () => {
    const parsed = await parseBackupDocument(JSON.stringify(createBackupDocument()))

    expect(parsed.sourceVersion).toBe(1)
    expect(parsed.fullRollbackEligible).toBe(false)
    expect(parsed.document.data.beans[0].id).toBe(bean.id)
  })

  it('rejects invalid backup JSON asynchronously', async () => {
    await expect(parseBackupDocument('{"schemaVersion":2}')).rejects.toThrow('备份文件格式不正确')
  })

  it('parses a complete v2 document only after checksum verification', async () => {
    const data = { profile: null, userSettings: null, beans: [], brewLogs: [], brewTemplates: [], aiRecommendations: [], sourceImports: [] }
    const document: BackupV2Document = {
      schemaVersion: 2,
      manifest: {
        exportedAt: '2026-08-08T00:00:00.000Z', appVersion: 'test', backupMode: 'lightweight',
        recordCounts: { profile: 0, userSettings: 0, beans: 0, brewLogs: 0, brewTemplates: 0, aiRecommendations: 0, sourceImports: 0 },
        checksumAlgorithm: 'SHA-256', checksum: await sha256Hex(data), images: [], warnings: [],
      },
      data,
    }

    const parsed = await parseBackupDocument(JSON.stringify(document))
    expect(parsed).toMatchObject({ sourceVersion: 2, fullRollbackEligible: true })

    document.manifest.checksum = '0'.repeat(64)
    await expect(parseBackupDocument(JSON.stringify(document))).rejects.toMatchObject({
      code: 'BACKUP_CHECKSUM_MISMATCH',
      message: '备份校验失败，文件可能已损坏或被修改',
    })
  })

  it('requires every v2 bean column while keeping old v1 beans compatible', async () => {
    const incompleteV2 = await createV2Document({ beans: [bean] })
    await expect(parseBackupDocument(JSON.stringify(incompleteV2))).rejects.toThrow('备份文件格式不正确')

    const completeV2 = await createV2Document({ beans: [v2Bean] })
    await expect(parseBackupDocument(JSON.stringify(completeV2))).resolves.toMatchObject({ sourceVersion: 2 })
    await expect(parseBackupDocument(JSON.stringify(createBackupDocument([bean], [])))).resolves.toMatchObject({ sourceVersion: 1 })
  })

  it('preserves valid remaining bean amounts and rejects negative values', async () => {
    const v1WithRemaining = createBackupDocument([
      { ...bean, remaining_grams: 0 },
    ], [])
    const parsedV1 = await parseBackupDocument(JSON.stringify(v1WithRemaining))
    expect(parsedV1.document.data.beans[0].remaining_grams).toBe(0)

    const v2WithRemaining = await createV2Document({
      beans: [{ ...v2Bean, remaining_grams: 0 }],
    })
    await expect(parseBackupDocument(JSON.stringify(v2WithRemaining)))
      .resolves.toMatchObject({ sourceVersion: 2 })

    const negative = await createV2Document({
      beans: [{ ...v2Bean, remaining_grams: -1 }],
    })
    await expect(parseBackupDocument(JSON.stringify(negative))).rejects.toThrow('备份文件格式不正确')
  })
  it('rejects v2 duplicate ids, invalid bean relations, and unknown row fields', async () => {
    const duplicate = await createV2Document({ beans: [v2Bean, { ...v2Bean }] })
    await expect(parseBackupDocument(JSON.stringify(duplicate))).rejects.toThrow('备份文件格式不正确')

    const orphan = await createV2Document({ beans: [v2Bean], brewLogs: [{ ...brewLog, bean_id: '55555555-5555-4555-8555-555555555555' }] })
    await expect(parseBackupDocument(JSON.stringify(orphan))).rejects.toThrow('备份文件格式不正确')

    const unknownField = await createV2Document({ beans: [{ ...v2Bean, rollback: true } as typeof v2Bean] })
    await expect(parseBackupDocument(JSON.stringify(unknownField))).rejects.toThrow('备份文件格式不正确')
  })

  it('accepts serving ice only for cold brew concentrate', async () => {
    const concentrate = await createV2Document({
      beans: [v2Bean],
      brewLogs: [{
        ...brewLog,
        brew_mode: 'cold_brew',
        brew_variant: 'concentrate',
        ice_grams: 120,
        beverage_grams: null,
      }],
    })
    await expect(parseBackupDocument(JSON.stringify(concentrate)))
      .resolves.toMatchObject({ sourceVersion: 2 })

    const readyToDrink = await createV2Document({
      beans: [v2Bean],
      brewLogs: [{
        ...brewLog,
        brew_mode: 'cold_brew',
        brew_variant: 'ready_to_drink',
        ice_grams: 120,
        beverage_grams: null,
      }],
    })
    await expect(parseBackupDocument(JSON.stringify(readyToDrink)))
      .rejects.toMatchObject({ code: 'BACKUP_FORMAT_INVALID' })
  })

  it('compares UUID identity case-insensitively for duplicates and relations', async () => {
    const lowerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const upperId = lowerId.toUpperCase()
    const duplicate = await createV2Document({
      beans: [
        { ...v2Bean, id: lowerId },
        { ...v2Bean, id: upperId },
      ],
    })
    await expect(parseBackupDocument(JSON.stringify(duplicate)))
      .rejects.toMatchObject({ code: 'BACKUP_FORMAT_INVALID' })

    const related = await createV2Document({
      beans: [{ ...v2Bean, id: lowerId }],
      brewLogs: [{ ...brewLog, bean_id: upperId }],
    })
    await expect(parseBackupDocument(JSON.stringify(related)))
      .resolves.toMatchObject({ sourceVersion: 2 })
  })

  it('rejects malformed non-null image checksums', async () => {
    const document = await createV2Document({ beans: [v2Bean] })
    document.manifest.images = [{
      entityType: 'bean',
      entityId: v2Bean.id,
      originalUrl: 'https://example.invalid/bean.jpg',
      archivePath: 'images/bean.jpg',
      mediaType: 'image/jpeg',
      byteLength: 12,
      checksum: 'x',
      status: 'included',
      errorCode: null,
    }]
    for (const checksum of [
      'x',
      'A'.repeat(64),
      'a'.repeat(63),
      'a'.repeat(65),
    ]) {
      document.manifest.images[0].checksum = checksum
      await expect(parseBackupDocument(JSON.stringify(document)))
        .rejects.toMatchObject({ code: 'BACKUP_FORMAT_INVALID' })
    }
    document.manifest.images[0].checksum = 'a'.repeat(64)
    await expect(parseBackupDocument(JSON.stringify(document)))
      .resolves.toMatchObject({ sourceVersion: 2 })
  })

  it('rejects fractional values for every integer database column', async () => {
    const integerMutations: Array<Partial<BackupV2Document['data']>> = [
      { beans: [{ ...v2Bean, altitude_meters: 1.5 }] },
      ...(['total_time_seconds', 'acidity', 'sweetness', 'bitterness', 'astringency', 'body', 'aftertaste'] as const)
        .map((field) => ({ beans: [v2Bean], brewLogs: [{ ...brewLog, [field]: 1.5 }] })),
      ...(['water_temperature_min', 'water_temperature_max', 'target_time_min', 'target_time_max'] as const)
        .map((field) => ({ brewTemplates: [{ ...brewTemplate, [field]: 1.5 }] })),
    ]

    for (const mutation of integerMutations) {
      const document = await createV2Document(mutation)
      await expect(parseBackupDocument(JSON.stringify(document))).rejects.toThrow('备份文件格式不正确')
    }
  })

  it('rejects image manifest entries that refer to beans absent from the backup', async () => {
    const document = await createV2Document()
    document.manifest.images = [{
      entityType: 'bean',
      entityId: bean.id,
      originalUrl: 'https://example.test/bean.jpg',
      archivePath: null,
      mediaType: null,
      byteLength: 0,
      checksum: null,
      status: 'missing',
      errorCode: 'NOT_INCLUDED',
    }]

    await expect(parseBackupDocument(JSON.stringify(document))).rejects.toThrow('备份文件格式不正确')
  })

  it('rejects unknown rollback claims, count mismatches, and duplicate ids', async () => {
    const unknownClaim = { ...createBackupDocument(), fullRollbackEligible: true }
    await expect(parseBackupDocument(JSON.stringify(unknownClaim))).rejects.toThrow('备份文件格式不正确')

    const wrongCount = createBackupDocument()
    wrongCount.recordCounts.beans = 9
    await expect(parseBackupDocument(JSON.stringify(wrongCount))).rejects.toThrow('备份文件格式不正确')

    const duplicate = createBackupDocument([bean, { ...bean }])
    duplicate.recordCounts.beans = 2
    await expect(parseBackupDocument(JSON.stringify(duplicate))).rejects.toThrow('备份文件格式不正确')
  })

  it('reports orphaned v1 brews as invalid and excludes them', async () => {
    const orphan = { ...brewLog, bean_id: '55555555-5555-4555-8555-555555555555' }
    const parsed = await parseBackupDocument(JSON.stringify(createBackupDocument([], [orphan])))

    expect(parsed.invalidRelations).toEqual([{
      entityType: 'brewLog', entityId: brewLog.id, field: 'bean_id', value: orphan.bean_id,
    }])
    expect(parsed.importable.brewLogs).toBe(0)
    expect(parsed.document.data.brewLogs).toEqual([])
  })

})
