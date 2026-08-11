import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import type { UserBrewTemplateRow } from '../brewTemplates/brewTemplateTypes'
import { canonicalJson, verifyBackupChecksum } from './backupChecksum'
import { normalizeV1ForSafeMerge } from './backupV1Migration'
import type {
  BackupDocument,
  BackupImportPreview,
  BackupInvalidRelation,
  BackupV1Document,
  BackupV2Document,
  ParsedBackupDocument,
} from './backupTypes'

type ExistingBackupIds = {
  beanIds: Set<string>
  brewLogIds: Set<string>
  brewTemplateIds?: Set<string>
}

type BackupImportPayloads = {
  beans: Bean[]
  brewLogs: BrewLog[]
  brewTemplates: UserBrewTemplateRow[]
}

export class BackupImportError extends Error {
  readonly code: 'BACKUP_FORMAT_INVALID' | 'BACKUP_CHECKSUM_MISMATCH'

  constructor(code: 'BACKUP_FORMAT_INVALID' | 'BACKUP_CHECKSUM_MISMATCH') {
    super(
      code === 'BACKUP_CHECKSUM_MISMATCH'
        ? '备份校验失败，文件可能已损坏或被修改'
        : '备份文件格式不正确',
    )
    this.name = 'BackupImportError'
    this.code = code
  }
}

export async function parseBackupDocument(jsonText: string): Promise<ParsedBackupDocument> {
  let parsed: unknown

  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw invalidFormat()
  }

  if (!isRecord(parsed) || !Number.isInteger(parsed.schemaVersion)) {
    throw invalidFormat()
  }

  if (parsed.schemaVersion === 1) {
    const source = parseV1Document(parsed)
    const validBeanIds = new Set(source.data.beans.map((bean) => bean.id))
    const invalidRelations: BackupInvalidRelation[] = []
    const brewLogs = source.data.brewLogs.filter((brewLog) => {
      if (brewLog.bean_id === null || validBeanIds.has(brewLog.bean_id)) return true
      invalidRelations.push({
        entityType: 'brewLog', entityId: brewLog.id, field: 'bean_id', value: brewLog.bean_id,
      })
      return false
    })
    const document = await normalizeV1ForSafeMerge({
      ...source,
      recordCounts: { ...source.recordCounts, brewLogs: brewLogs.length },
      data: { ...source.data, brewLogs },
    })

    return {
      sourceVersion: 1,
      document,
      fullRollbackEligible: false,
      invalidRelations,
      importable: summaryFor(document),
    }
  }

  if (parsed.schemaVersion === 2) {
    const document = parseV2Document(parsed)
    if (!(await verifyBackupChecksum(document))) {
      throw new BackupImportError('BACKUP_CHECKSUM_MISMATCH')
    }
    return {
      sourceVersion: 2,
      document,
      fullRollbackEligible: true,
      invalidRelations: [],
      importable: summaryFor(document),
    }
  }

  throw invalidFormat()
}

export function createBackupImportPreview(
  backup: Pick<BackupDocument | BackupV2Document, 'data'>,
  existingIds: ExistingBackupIds,
): BackupImportPreview {
  const backupBrewTemplates = backup.data.brewTemplates ?? []
  const importableBeanIds = new Set(
    backup.data.beans
      .filter((bean) => !existingIds.beanIds.has(bean.id))
      .map((bean) => bean.id),
  )
  const importableBrewLogIds = new Set(
    backup.data.brewLogs
      .filter((brewLog) => !existingIds.brewLogIds.has(brewLog.id))
      .map((brewLog) => brewLog.id),
  )
  const importableBrewTemplateIds = new Set(
    backupBrewTemplates
      .filter((template) => !(existingIds.brewTemplateIds ?? new Set()).has(template.id))
      .map((template) => template.id),
  )

  return {
    total: {
      beans: backup.data.beans.length,
      brewLogs: backup.data.brewLogs.length,
      brewTemplates: backupBrewTemplates.length,
    },
    duplicates: {
      beans: backup.data.beans.length - importableBeanIds.size,
      brewLogs: backup.data.brewLogs.length - importableBrewLogIds.size,
      brewTemplates: backupBrewTemplates.length - importableBrewTemplateIds.size,
    },
    importable: {
      beans: importableBeanIds.size,
      brewLogs: importableBrewLogIds.size,
      brewTemplates: importableBrewTemplateIds.size,
    },
    importableBeanIds,
    importableBrewLogIds,
    importableBrewTemplateIds,
  }
}

export function buildBackupImportPayloads(
  backup: Pick<BackupDocument | BackupV2Document, 'data'>,
  preview: BackupImportPreview,
  userId: string,
  options: {
    existingBeanIds: Set<string>
  },
): BackupImportPayloads {
  const availableBeanIds = new Set([
    ...options.existingBeanIds,
    ...preview.importableBeanIds,
  ])
  const beans = backup.data.beans
    .filter((bean) => preview.importableBeanIds.has(bean.id))
    .map((bean) => ({
      ...bean,
      user_id: userId,
      deleted_at: null,
    }))
  const brewLogs = backup.data.brewLogs
    .filter(
      (brewLog) =>
        preview.importableBrewLogIds.has(brewLog.id) &&
        (brewLog.bean_id === null || availableBeanIds.has(brewLog.bean_id)),
    )
    .map((brewLog) => ({
      ...brewLog,
      user_id: userId,
      deleted_at: null,
    }))
  const brewTemplates = (backup.data.brewTemplates ?? [])
    .filter((template) => preview.importableBrewTemplateIds.has(template.id))
    .map((template) => ({
      ...template,
      user_id: userId,
      deleted_at: null,
    }))

  return {
    beans,
    brewLogs,
    brewTemplates,
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function parseV1Document(value: Record<string, unknown>): BackupV1Document {
  exactKeys(value, ['schemaVersion', 'exportedAt', 'userId', 'includesImages', 'recordCounts', 'data'])
  if (value.schemaVersion !== 1 || !isTimestamp(value.exportedAt) || !isUuid(value.userId) || value.includesImages !== false) throw invalidFormat()
  const counts = requireRecord(value.recordCounts)
  const data = requireRecord(value.data)
  exactKeys(counts, ['beans', 'brewLogs'], ['brewTemplates'])
  exactKeys(data, ['beans', 'brewLogs'], ['brewTemplates'])
  const beans = parseRows(data.beans, isV1Bean)
  const brewLogs = parseRows(data.brewLogs, isBrewLog)
  const brewTemplates = data.brewTemplates === undefined ? undefined : parseRows(data.brewTemplates, isBrewTemplate)
  if (!isCount(counts.beans, beans.length) || !isCount(counts.brewLogs, brewLogs.length)) throw invalidFormat()
  if (counts.brewTemplates !== undefined && !isCount(counts.brewTemplates, brewTemplates?.length ?? 0)) throw invalidFormat()
  if (brewTemplates !== undefined && counts.brewTemplates === undefined) throw invalidFormat()
  assertUniqueIds(beans)
  assertUniqueIds(brewLogs)
  if (brewTemplates) assertUniqueIds(brewTemplates)
  assertCanonical(data)
  return {
    schemaVersion: 1,
    exportedAt: value.exportedAt,
    userId: value.userId,
    includesImages: false,
    recordCounts: { beans: beans.length, brewLogs: brewLogs.length, ...(brewTemplates ? { brewTemplates: brewTemplates.length } : {}) },
    data: { beans, brewLogs, ...(brewTemplates ? { brewTemplates } : {}) },
  }
}

function parseV2Document(value: Record<string, unknown>): BackupV2Document {
  exactKeys(value, ['schemaVersion', 'manifest', 'data'])
  if (value.schemaVersion !== 2) throw invalidFormat()
  const manifest = requireRecord(value.manifest)
  const data = requireRecord(value.data)
  exactKeys(manifest, ['exportedAt', 'appVersion', 'backupMode', 'recordCounts', 'checksumAlgorithm', 'checksum', 'images', 'warnings'])
  exactKeys(data, ['profile', 'userSettings', 'beans', 'brewLogs', 'brewTemplates', 'aiRecommendations', 'sourceImports'])
  if (!isTimestamp(manifest.exportedAt) || !isString(manifest.appVersion) || !['lightweight', 'complete'].includes(String(manifest.backupMode)) || manifest.checksumAlgorithm !== 'SHA-256' || !isString(manifest.checksum)) throw invalidFormat()
  const profile = data.profile === null ? null : parseSingle(data.profile, isProfile)
  const userSettings = data.userSettings === null ? null : parseSingle(data.userSettings, isUserSettings)
  const beans = parseRows(data.beans, isV2Bean)
  const brewLogs = parseRows(data.brewLogs, isBrewLog)
  const brewTemplates = parseRows(data.brewTemplates, isBrewTemplate)
  const aiRecommendations = parseRows(data.aiRecommendations, isRecommendation)
  const sourceImports = parseRows(data.sourceImports, isSourceImport)
  const images = parseRows(manifest.images, isImageManifestEntry)
  const warnings = parseStringArray(manifest.warnings)
  const counts = requireRecord(manifest.recordCounts)
  exactKeys(counts, ['profile', 'userSettings', 'beans', 'brewLogs', 'brewTemplates', 'aiRecommendations', 'sourceImports'])
  const expected = {
    profile: profile ? 1 : 0, userSettings: userSettings ? 1 : 0, beans: beans.length,
    brewLogs: brewLogs.length, brewTemplates: brewTemplates.length,
    aiRecommendations: aiRecommendations.length, sourceImports: sourceImports.length,
  }
  for (const [key, count] of Object.entries(expected)) if (!isCount(counts[key], count)) throw invalidFormat()
  ;[beans, brewLogs, brewTemplates, aiRecommendations, sourceImports].forEach(assertUniqueIds)
  const beanIds = new Set(beans.map((row) => row.id))
  if (brewLogs.some((row) => row.bean_id !== null && !beanIds.has(row.bean_id))) throw invalidFormat()
  if (aiRecommendations.some((row) => row.bean_id !== null && !beanIds.has(row.bean_id))) throw invalidFormat()
  if (images.some((image) => !beanIds.has(image.entityId))) throw invalidFormat()
  assertCanonical(data)
  return {
    schemaVersion: 2,
    manifest: {
      exportedAt: manifest.exportedAt,
      appVersion: manifest.appVersion,
      backupMode: manifest.backupMode as 'lightweight' | 'complete',
      recordCounts: expected,
      checksumAlgorithm: 'SHA-256',
      checksum: manifest.checksum,
      images,
      warnings,
    },
    data: { profile, userSettings, beans, brewLogs, brewTemplates, aiRecommendations, sourceImports },
  }
}

function summaryFor(document: BackupV2Document) {
  return {
    beans: document.data.beans.length,
    brewLogs: document.data.brewLogs.length,
    brewTemplates: document.data.brewTemplates.length,
    aiRecommendations: document.data.aiRecommendations.length,
    sourceImports: document.data.sourceImports.length,
  }
}

function isV1Bean(value: unknown): value is Bean {
  return isBean(value, false)
}

function isV2Bean(value: unknown): value is Bean {
  return isBean(value, true)
}

function isBean(value: unknown, requireBlendFields: boolean): value is Bean {
  if (!isRecord(value)) return false
  const baseRequired = ['id', 'user_id', 'name', 'roaster', 'origin', 'farm_or_station', 'process', 'variety', 'altitude_meters', 'roast_date', 'roast_level', 'flavor_tags', 'flavor_notes', 'net_weight_grams', 'price', 'purchase_date', 'source_url', 'image_url', 'notes', 'created_at', 'updated_at', 'deleted_at', 'schema_version']
  const blendFields = ['bean_type', 'blend_components', 'blend_notes']
  const required = requireBlendFields ? [...baseRequired, ...blendFields] : baseRequired
  const optional = requireBlendFields ? [] : blendFields
  if (!hasExactKeys(value, required, optional)) return false
  return isUuid(value.id) && isUuid(value.user_id) && isString(value.name) &&
    ['roaster', 'origin', 'farm_or_station', 'process', 'variety', 'roast_date', 'roast_level', 'flavor_notes', 'purchase_date', 'source_url', 'image_url', 'notes', 'deleted_at'].every((key) => isNullableString(value[key])) &&
    isNullableSafeInteger(value.altitude_meters) && ['net_weight_grams', 'price'].every((key) => isNullableNumber(value[key])) &&
    isStringArray(value.flavor_tags) && isTimestamp(value.created_at) && isTimestamp(value.updated_at) && isSchemaVersion(value.schema_version) &&
    (value.bean_type === undefined || value.bean_type === 'single_origin' || value.bean_type === 'blend') &&
    (value.blend_notes === undefined || isNullableString(value.blend_notes)) &&
    (value.blend_components === undefined || (Array.isArray(value.blend_components) && value.blend_components.every(isBlendComponent)))
}

function isBlendComponent(value: unknown) {
  return isRecord(value) && hasExactKeys(value, ['origin', 'process', 'variety', 'percentage', 'role', 'notes']) &&
    ['origin', 'process', 'variety', 'role', 'notes'].every((key) => isString(value[key])) && isNullableNumber(value.percentage)
}

function isBrewLog(value: unknown): value is BrewLog {
  if (!isRecord(value)) return false
  const keys = ['id', 'user_id', 'bean_id', 'brewed_at', 'method', 'dripper', 'filter_paper', 'grinder', 'grind_setting', 'coffee_grams', 'water_grams', 'ratio', 'water_temperature_c', 'total_time_seconds', 'pour_steps', 'rating', 'acidity', 'sweetness', 'bitterness', 'astringency', 'body', 'aftertaste', 'flavor_tags', 'is_pinned_recipe', 'notes', 'created_at', 'updated_at', 'deleted_at', 'schema_version']
  if (!hasExactKeys(value, keys)) return false
  return isUuid(value.id) && isUuid(value.user_id) && (value.bean_id === null || isUuid(value.bean_id)) && isTimestamp(value.brewed_at) &&
    ['method', 'dripper', 'filter_paper', 'grinder', 'grind_setting', 'ratio', 'notes', 'deleted_at'].every((key) => isNullableString(value[key])) &&
    ['coffee_grams', 'water_grams', 'water_temperature_c', 'rating'].every((key) => isNullableNumber(value[key])) &&
    ['total_time_seconds', 'acidity', 'sweetness', 'bitterness', 'astringency', 'body', 'aftertaste'].every((key) => isNullableSafeInteger(value[key])) &&
    Array.isArray(value.pour_steps) && isJsonValue(value.pour_steps) && isStringArray(value.flavor_tags) && typeof value.is_pinned_recipe === 'boolean' && isTimestamp(value.created_at) && isTimestamp(value.updated_at) && isSchemaVersion(value.schema_version)
}

function isBrewTemplate(value: unknown): value is UserBrewTemplateRow {
  if (!isRecord(value)) return false
  const keys = ['id', 'user_id', 'name', 'category', 'difficulty', 'brewer', 'filter', 'dose_grams', 'water_grams', 'ratio', 'water_temperature_min', 'water_temperature_max', 'grind_size', 'target_time_min', 'target_time_max', 'pour_steps', 'suitable_for', 'avoid_for', 'flavor_goal', 'adjustment_rules', 'source_notes', 'source_urls', 'is_champion_reference', 'copied_from_template_id', 'created_at', 'updated_at', 'deleted_at', 'schema_version']
  if (!hasExactKeys(value, keys)) return false
  const categories = ['daily-pourover', 'immersion-hybrid', 'bean-specific', 'cold-brew', 'moka-pot', 'champion-reference']
  return isUuid(value.id) && isUuid(value.user_id) && ['name', 'brewer', 'filter', 'ratio', 'grind_size', 'flavor_goal', 'source_notes'].every((key) => isString(value[key])) && categories.includes(String(value.category)) && ['easy', 'medium', 'advanced'].includes(String(value.difficulty)) &&
    ['dose_grams', 'water_grams'].every((key) => isNumber(value[key])) &&
    ['water_temperature_min', 'water_temperature_max', 'target_time_min', 'target_time_max'].every((key) => isSafeInteger(value[key])) &&
    Array.isArray(value.pour_steps) && value.pour_steps.every(isTemplatePourStep) && ['suitable_for', 'avoid_for', 'adjustment_rules', 'source_urls'].every((key) => isStringArray(value[key])) &&
    typeof value.is_champion_reference === 'boolean' && isNullableString(value.copied_from_template_id) && isTimestamp(value.created_at) && isTimestamp(value.updated_at) && isNullableString(value.deleted_at) && isSchemaVersion(value.schema_version)
}

function isTemplatePourStep(value: unknown) {
  return isRecord(value) && hasExactKeys(value, ['order', 'startSeconds', 'endSeconds', 'targetWaterGrams', 'label', 'action']) &&
    isNumber(value.order) && isNumber(value.startSeconds) && isNullableNumber(value.endSeconds) && isNumber(value.targetWaterGrams) && isString(value.label) && isString(value.action)
}

function isProfile(value: unknown): value is BackupV2Document['data']['profile'] {
  return isRecord(value) && hasExactKeys(value, ['id', 'display_name', 'created_at', 'updated_at', 'schema_version']) && isUuid(value.id) && isNullableString(value.display_name) && isTimestamp(value.created_at) && isTimestamp(value.updated_at) && isSchemaVersion(value.schema_version)
}

function isUserSettings(value: unknown): value is NonNullable<BackupV2Document['data']['userSettings']> {
  return isRecord(value) && hasExactKeys(value, ['user_id', 'preferred_units', 'default_gear', 'taste_preferences', 'backup_reminder_days', 'created_at', 'updated_at', 'schema_version']) && isUuid(value.user_id) && isJsonObject(value.preferred_units) && isJsonObject(value.default_gear) && isJsonObject(value.taste_preferences) && Number.isInteger(value.backup_reminder_days) && Number(value.backup_reminder_days) >= 1 && isTimestamp(value.created_at) && isTimestamp(value.updated_at) && isSchemaVersion(value.schema_version)
}

function isRecommendation(value: unknown): value is BackupV2Document['data']['aiRecommendations'][number] {
  return isRecord(value) && hasExactKeys(value, ['id', 'user_id', 'bean_id', 'input_context', 'recommendation', 'model_name', 'accepted', 'created_at', 'updated_at', 'deleted_at', 'schema_version']) && isUuid(value.id) && isUuid(value.user_id) && (value.bean_id === null || isUuid(value.bean_id)) && isJsonObject(value.input_context) && isJsonObject(value.recommendation) && isNullableString(value.model_name) && (value.accepted === null || typeof value.accepted === 'boolean') && isTimestamp(value.created_at) && isTimestamp(value.updated_at) && isNullableString(value.deleted_at) && isSchemaVersion(value.schema_version)
}

function isSourceImport(value: unknown): value is BackupV2Document['data']['sourceImports'][number] {
  return isRecord(value) && hasExactKeys(value, ['id', 'user_id', 'source_url', 'source_type', 'status', 'extracted_payload', 'selected_payload', 'error_message', 'created_at', 'updated_at', 'deleted_at', 'schema_version']) && isUuid(value.id) && isUuid(value.user_id) && isString(value.source_url) && isString(value.source_type) && ['draft', 'saved', 'failed'].includes(String(value.status)) && isJsonObject(value.extracted_payload) && isJsonObject(value.selected_payload) && isNullableString(value.error_message) && isTimestamp(value.created_at) && isTimestamp(value.updated_at) && isNullableString(value.deleted_at) && isSchemaVersion(value.schema_version)
}

function isImageManifestEntry(value: unknown): value is BackupV2Document['manifest']['images'][number] {
  return isRecord(value) && hasExactKeys(value, ['entityType', 'entityId', 'originalUrl', 'archivePath', 'mediaType', 'byteLength', 'checksum', 'status', 'errorCode']) && value.entityType === 'bean' && isUuid(value.entityId) && isString(value.originalUrl) && isNullableString(value.archivePath) && isNullableString(value.mediaType) && Number.isSafeInteger(value.byteLength) && Number(value.byteLength) >= 0 && isNullableString(value.checksum) && ['included', 'missing'].includes(String(value.status)) && isNullableString(value.errorCode)
}

function parseRows<T>(value: unknown, validator: (row: unknown) => row is T): T[] {
  if (!Array.isArray(value) || !value.every(validator)) throw invalidFormat()
  return value
}

function parseSingle<T>(value: unknown, validator: (row: unknown) => row is T): T {
  if (!validator(value)) throw invalidFormat()
  return value
}

function assertUniqueIds(rows: Array<{ id: string }>) {
  if (new Set(rows.map((row) => row.id)).size !== rows.length) throw invalidFormat()
}

function exactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  if (!hasExactKeys(value, required, optional)) throw invalidFormat()
}

function hasExactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  const keys = Object.keys(value)
  const allowed = new Set([...required, ...optional])
  return required.every((key) => Object.hasOwn(value, key)) && keys.every((key) => allowed.has(key))
}

function requireRecord(value: unknown) {
  if (!isRecord(value)) throw invalidFormat()
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}

function isUuid(value: unknown): value is string { return typeof value === 'string' && uuidPattern.test(value) }
function isString(value: unknown): value is string { return typeof value === 'string' }
function isNullableString(value: unknown): value is string | null { return value === null || typeof value === 'string' }
function isNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
function isNullableNumber(value: unknown): value is number | null { return value === null || isNumber(value) }
function isSafeInteger(value: unknown): value is number { return Number.isSafeInteger(value) }
function isNullableSafeInteger(value: unknown): value is number | null { return value === null || isSafeInteger(value) }
function isTimestamp(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value)) }
function isSchemaVersion(value: unknown) { return Number.isSafeInteger(value) && Number(value) >= 1 }
function isCount(value: unknown, expected: number) { return Number.isSafeInteger(value) && value === expected }
function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every(isString) }
function parseStringArray(value: unknown) { if (!isStringArray(value)) throw invalidFormat(); return value }
function isJsonValue(value: unknown) { try { canonicalJson(value); return true } catch { return false } }
function isJsonObject(value: unknown) { return isRecord(value) && isJsonValue(value) }
function assertCanonical(value: unknown) { if (!isJsonValue(value)) throw invalidFormat() }
function invalidFormat() { return new BackupImportError('BACKUP_FORMAT_INVALID') }
