import type { SupabaseClient } from '@supabase/supabase-js'
import type { JsonObject, JsonValue } from '../../lib/jsonTypes'
import { daysInMonth, isRfc3339 } from '../../lib/rfc3339'
import type { ServerBeanRow } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import type { UserBrewTemplateRow } from '../brewTemplates/brewTemplateTypes'
import type { SavedRecommendationRow } from '../recommendations/savedRecommendationList'
import type { UserSettingsRow } from '../settings/userSettingsTypes'
import {
  createDeletePayload,
  type ApplySyncResult,
  type BeanUpsertPayload,
  type BrewLogUpsertPayload,
  type BrewTemplateUpsertPayload,
  type SyncEntityType,
  type SyncMutation,
  type SyncOperation,
  type SyncRpcOperation,
  type SyncSnapshot,
  type UserSettingsUpsertPayload,
} from './syncTypes'

export class SyncApiError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(
    code: string,
    message: string,
    retryable: boolean,
  ) {
    super(message)
    this.name = 'SyncApiError'
    this.code = code
    this.retryable = retryable
  }
}

type RpcResult = { data: unknown; error: unknown; status?: number }

export function createSyncApi(supabase: SupabaseClient) {
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: string,
    params?: Record<string, unknown>,
  ) => Promise<RpcResult>

  return {
    async applyBatch(
      syncEpoch: number,
      operations: SyncRpcOperation[],
    ): Promise<ApplySyncResult> {
      if (!isPositiveInteger(syncEpoch)) {
        throw invalidOperation('Invalid sync epoch')
      }
      const wireOperations = operations.map((operation) =>
        toSyncRpcOperation(operation as SyncMutation),
      )
      const requestMutationIds = wireOperations.map(
        (operation) => operation.mutationId,
      )
      if (new Set(requestMutationIds).size !== requestMutationIds.length) {
        throw new SyncApiError(
          'DUPLICATE_SYNC_MUTATION_ID',
          'Sync batch contains duplicate mutation IDs',
          false,
        )
      }
      const response = await rpc('apply_sync_batch', {
        p_sync_epoch: syncEpoch,
        p_operations: wireOperations,
      })
      if (response.error !== null) {
        throw fromSupabaseError(response.error, response.status)
      }
      return validateApplyResult(response.data, wireOperations)
    },

    async getSnapshot(): Promise<SyncSnapshot> {
      const response = await rpc('get_sync_snapshot')
      if (response.error !== null) {
        throw fromSupabaseError(response.error, response.status)
      }
      return validateSnapshot(response.data)
    },
  }
}

export function toSyncRpcOperation(mutation: SyncMutation): SyncRpcOperation {
  return validateSyncMutationForWire(mutation)
}

export function validateSyncMutationForWire(mutation: unknown): SyncRpcOperation {
  if (!isPlainRecord(mutation)) {
    throw invalidOperation('Sync operation must be a plain object')
  }
  if (!isUuid(mutation.mutationId) || !isUuid(mutation.deviceId) || !isUuid(mutation.entityId)) {
    throw invalidOperation('Invalid operation identifier')
  }
  if (!isEntityType(mutation.entityType) || !isOperation(mutation.operation)) {
    throw invalidOperation('Invalid entity type or operation')
  }
  const entityType = mutation.entityType
  const operation = mutation.operation
  const base = {
    mutationId: mutation.mutationId,
    deviceId: mutation.deviceId,
    entityId: mutation.entityId,
  }
  if (operation === 'delete') {
    if (entityType === 'userSettings') {
      throw invalidOperation('User settings cannot be deleted')
    }
    if (!isPlainRecord(mutation.payload) || Object.keys(mutation.payload).length !== 0) {
      throw invalidOperation('Delete payload must be an empty plain object')
    }
    return {
      ...base,
      entityType,
      operation: 'delete',
      payload: createDeletePayload(),
    }
  }

  switch (entityType) {
    case 'bean':
      return { ...base, entityType: 'bean', operation: 'upsert', payload: rebuildBeanPayload(mutation.payload) }
    case 'brewLog':
      return { ...base, entityType: 'brewLog', operation: 'upsert', payload: rebuildBrewPayload(mutation.payload) }
    case 'brewTemplate':
      return { ...base, entityType: 'brewTemplate', operation: 'upsert', payload: rebuildTemplatePayload(mutation.payload) }
    case 'userSettings':
      return { ...base, entityType: 'userSettings', operation: 'upsert', payload: rebuildSettingsPayload(mutation.payload) }
  }
}

const beanMutableKeys = [
  'name', 'roaster', 'origin', 'farm_or_station', 'process', 'variety',
  'altitude_meters', 'roast_date', 'roast_level', 'flavor_tags', 'flavor_notes',
  'net_weight_grams', 'remaining_grams', 'price', 'purchase_date', 'source_url', 'image_url',
  'bean_type', 'blend_components', 'blend_notes', 'notes', 'schema_version',
] as const
const brewMutableKeys = [
  'bean_id', 'brewed_at', 'method', 'dripper', 'filter_paper', 'grinder',
  'grind_setting', 'coffee_grams', 'water_grams', 'ratio', 'water_temperature_c',
  'total_time_seconds', 'pour_steps', 'rating', 'acidity', 'sweetness',
  'bitterness', 'astringency', 'body', 'aftertaste', 'flavor_tags',
  'is_pinned_recipe', 'notes', 'schema_version',
] as const
const templateMutableKeys = [
  'name', 'category', 'difficulty', 'brewer', 'filter', 'dose_grams',
  'water_grams', 'ratio', 'water_temperature_min', 'water_temperature_max',
  'grind_size', 'target_time_min', 'target_time_max', 'pour_steps',
  'suitable_for', 'avoid_for', 'flavor_goal', 'adjustment_rules', 'source_notes',
  'source_urls', 'is_champion_reference', 'copied_from_template_id', 'schema_version',
] as const
const settingsMutableKeys = [
  'preferred_units', 'default_gear', 'taste_preferences',
  'backup_reminder_days', 'schema_version',
] as const

function rebuildBeanPayload(value: unknown): BeanUpsertPayload {
  const row = exactRecord(value, beanMutableKeys, 'bean payload')
  assertBeanMutable(row)
  return {
    name: row.name as string,
    roaster: row.roaster as string | null,
    origin: row.origin as string | null,
    farm_or_station: row.farm_or_station as string | null,
    process: row.process as string | null,
    variety: row.variety as string | null,
    altitude_meters: row.altitude_meters as number | null,
    roast_date: row.roast_date as string | null,
    roast_level: row.roast_level as string | null,
    flavor_tags: [...row.flavor_tags as string[]],
    flavor_notes: row.flavor_notes as string | null,
    net_weight_grams: row.net_weight_grams as number | null,
    remaining_grams: row.remaining_grams as number | null,
    price: row.price as number | null,
    purchase_date: row.purchase_date as string | null,
    source_url: row.source_url as string | null,
    image_url: row.image_url as string | null,
    bean_type: row.bean_type as 'single_origin' | 'blend',
    blend_components: structuredClone(row.blend_components) as BeanUpsertPayload['blend_components'],
    blend_notes: row.blend_notes as string | null,
    notes: row.notes as string | null,
    schema_version: row.schema_version as number,
  }
}

function rebuildBrewPayload(value: unknown): BrewLogUpsertPayload {
  const row = exactRecord(value, brewMutableKeys, 'brew payload')
  assertBrewMutable(row)
  return {
    bean_id: row.bean_id as string | null,
    brewed_at: row.brewed_at as string,
    method: row.method as string | null,
    dripper: row.dripper as string | null,
    filter_paper: row.filter_paper as string | null,
    grinder: row.grinder as string | null,
    grind_setting: row.grind_setting as string | null,
    coffee_grams: row.coffee_grams as number | null,
    water_grams: row.water_grams as number | null,
    ratio: row.ratio as string | null,
    water_temperature_c: row.water_temperature_c as number | null,
    total_time_seconds: row.total_time_seconds as number | null,
    pour_steps: structuredClone(row.pour_steps) as JsonValue[],
    rating: row.rating as number | null,
    acidity: row.acidity as number | null,
    sweetness: row.sweetness as number | null,
    bitterness: row.bitterness as number | null,
    astringency: row.astringency as number | null,
    body: row.body as number | null,
    aftertaste: row.aftertaste as number | null,
    flavor_tags: [...row.flavor_tags as string[]],
    is_pinned_recipe: row.is_pinned_recipe as boolean,
    notes: row.notes as string | null,
    schema_version: row.schema_version as number,
  }
}

function rebuildTemplatePayload(value: unknown): BrewTemplateUpsertPayload {
  const row = exactRecord(value, templateMutableKeys, 'template payload')
  assertTemplateMutable(row)
  return {
    name: row.name as string,
    category: row.category as BrewTemplateUpsertPayload['category'],
    difficulty: row.difficulty as BrewTemplateUpsertPayload['difficulty'],
    brewer: row.brewer as string,
    filter: row.filter as string,
    dose_grams: row.dose_grams as number,
    water_grams: row.water_grams as number,
    ratio: row.ratio as string,
    water_temperature_min: row.water_temperature_min as number,
    water_temperature_max: row.water_temperature_max as number,
    grind_size: row.grind_size as string,
    target_time_min: row.target_time_min as number,
    target_time_max: row.target_time_max as number,
    pour_steps: structuredClone(row.pour_steps) as BrewTemplateUpsertPayload['pour_steps'],
    suitable_for: [...row.suitable_for as string[]],
    avoid_for: [...row.avoid_for as string[]],
    flavor_goal: row.flavor_goal as string,
    adjustment_rules: [...row.adjustment_rules as string[]],
    source_notes: row.source_notes as string,
    source_urls: [...row.source_urls as string[]],
    is_champion_reference: row.is_champion_reference as boolean,
    copied_from_template_id: row.copied_from_template_id as string | null,
    schema_version: row.schema_version as number,
  }
}

function rebuildSettingsPayload(value: unknown): UserSettingsUpsertPayload {
  const row = exactRecord(value, settingsMutableKeys, 'settings payload')
  assertSettingsMutable(row)
  return {
    preferred_units: structuredClone(row.preferred_units) as JsonObject,
    default_gear: structuredClone(row.default_gear) as JsonObject,
    taste_preferences: structuredClone(row.taste_preferences) as JsonObject,
    backup_reminder_days: row.backup_reminder_days as number,
    schema_version: row.schema_version as number,
  }
}

function validateApplyResult(value: unknown, operations: SyncRpcOperation[]): ApplySyncResult {
  const row = exactRecord(value, ['syncEpoch', 'serverTime', 'results'], 'apply response', invalidResponse)
  if (!isPositiveInteger(row.syncEpoch) || !isRfc3339(row.serverTime) || !Array.isArray(row.results)) throw invalidResponse()
  if (row.results.length !== operations.length) throw invalidResponse()
  const seen = new Set<string>()
  const results = row.results.map((value, index) => {
    const receipt = exactRecord(value, ['mutationId', 'deviceId', 'entityType', 'entityId', 'operation', 'committedAt', 'status'], 'receipt', invalidResponse)
    if (!isUuid(receipt.mutationId) || !isUuid(receipt.deviceId) || !isUuid(receipt.entityId) || !isEntityType(receipt.entityType) || !isOperation(receipt.operation) || !isRfc3339(receipt.committedAt) || (receipt.status !== 'applied' && receipt.status !== 'duplicate')) throw invalidResponse()
    const requested = operations[index]
    if (seen.has(receipt.mutationId) || requested.mutationId !== receipt.mutationId || requested.deviceId !== receipt.deviceId || requested.entityType !== receipt.entityType || requested.entityId !== receipt.entityId || requested.operation !== receipt.operation) throw invalidResponse()
    seen.add(receipt.mutationId)
    return {
      mutationId: receipt.mutationId, deviceId: receipt.deviceId,
      entityType: receipt.entityType, entityId: receipt.entityId,
      operation: receipt.operation, committedAt: receipt.committedAt,
      status: receipt.status as 'applied' | 'duplicate',
    }
  })
  return { syncEpoch: row.syncEpoch, serverTime: row.serverTime, results }
}

function validateSnapshot(value: unknown): SyncSnapshot {
  const row = exactRecord(value, ['syncEpoch', 'serverTime', 'beans', 'brewLogs', 'brewTemplates', 'userSettings', 'aiRecommendations'], 'snapshot', invalidResponse)
  if (!isPositiveInteger(row.syncEpoch) || !isRfc3339(row.serverTime) || !Array.isArray(row.beans) || !Array.isArray(row.brewLogs) || !Array.isArray(row.brewTemplates) || !Array.isArray(row.aiRecommendations)) throw invalidResponse()
  return {
    syncEpoch: row.syncEpoch,
    serverTime: row.serverTime,
    beans: row.beans.map(validateBeanRow),
    brewLogs: row.brewLogs.map(validateBrewRow),
    brewTemplates: row.brewTemplates.map(validateTemplateRow),
    userSettings: row.userSettings === null ? null : validateSettingsRow(row.userSettings),
    aiRecommendations: row.aiRecommendations.map(validateRecommendationRow),
  }
}

function validateBeanRow(value: unknown): ServerBeanRow {
  const row = exactRecord(value, ['id', 'user_id', ...beanMutableKeys.slice(0, -1), 'created_at', 'updated_at', 'deleted_at', 'schema_version'], 'bean row', invalidResponse)
  assertOwnedServerFields(row, true)
  assertBeanMutable(row, invalidResponse)
  return structuredClone(row) as ServerBeanRow
}

function validateBrewRow(value: unknown): BrewLog {
  const row = exactRecord(value, ['id', 'user_id', ...brewMutableKeys.slice(0, -1), 'created_at', 'updated_at', 'deleted_at', 'schema_version'], 'brew row', invalidResponse)
  assertOwnedServerFields(row, true)
  assertBrewMutable(row, invalidResponse)
  return structuredClone(row) as BrewLog
}

function validateTemplateRow(value: unknown): UserBrewTemplateRow {
  const row = exactRecord(value, ['id', 'user_id', ...templateMutableKeys.slice(0, -1), 'created_at', 'updated_at', 'deleted_at', 'schema_version'], 'template row', invalidResponse)
  assertOwnedServerFields(row, true)
  assertTemplateMutable(row, invalidResponse)
  return structuredClone(row) as UserBrewTemplateRow
}

function validateSettingsRow(value: unknown): UserSettingsRow {
  const row = exactRecord(value, ['user_id', ...settingsMutableKeys.slice(0, -1), 'created_at', 'updated_at', 'schema_version'], 'settings row', invalidResponse)
  if (!isUuid(row.user_id) || !isRfc3339(row.created_at) || !isRfc3339(row.updated_at)) throw invalidResponse()
  assertSettingsMutable(row, invalidResponse)
  return structuredClone(row) as UserSettingsRow
}

function validateRecommendationRow(value: unknown): SavedRecommendationRow {
  const keys = ['id', 'user_id', 'bean_id', 'input_context', 'recommendation', 'model_name', 'accepted', 'created_at', 'updated_at', 'deleted_at', 'schema_version'] as const
  const row = exactRecord(value, keys, 'recommendation row', invalidResponse)
  if (!isUuid(row.id) || !isUuid(row.user_id) || !nullableUuid(row.bean_id) || !isJsonObject(row.input_context) || !isJsonObject(row.recommendation) || !nullableString(row.model_name) || !(row.accepted === null || typeof row.accepted === 'boolean') || !isRfc3339(row.created_at) || !isRfc3339(row.updated_at) || !nullableRfc3339(row.deleted_at) || row.schema_version !== 1) throw invalidResponse()
  return structuredClone(row) as SavedRecommendationRow
}

function assertOwnedServerFields(row: Record<string, unknown>, deletable: boolean) {
  if (!isUuid(row.id) || !isUuid(row.user_id) || !isRfc3339(row.created_at) || !isRfc3339(row.updated_at) || (deletable && !nullableRfc3339(row.deleted_at))) throw invalidResponse()
}

function assertBeanMutable(row: Record<string, unknown>, failure = invalidOperation): void {
  const components = row.blend_components
  if (typeof row.name !== 'string' || !nullableString(row.roaster) || !nullableString(row.origin) || !nullableString(row.farm_or_station) || !nullableString(row.process) || !nullableString(row.variety) || !nullableFinite(row.altitude_meters) || !nullableDate(row.roast_date) || !nullableString(row.roast_level) || !stringArray(row.flavor_tags) || !nullableString(row.flavor_notes) || !nullableFinite(row.net_weight_grams) || !nullableFinite(row.remaining_grams) || (row.remaining_grams !== null && row.remaining_grams < 0) || !nullableFinite(row.price) || !nullableDate(row.purchase_date) || !nullableString(row.source_url) || !nullableString(row.image_url) || (row.bean_type !== 'single_origin' && row.bean_type !== 'blend') || !Array.isArray(components) || !components.every(isBlendComponent) || !nullableString(row.blend_notes) || !nullableString(row.notes) || row.schema_version !== 1) throw failure()
}

function assertBrewMutable(row: Record<string, unknown>, failure = invalidOperation): void {
  if (!nullableUuid(row.bean_id) || !isRfc3339(row.brewed_at) || !nullableString(row.method) || !nullableString(row.dripper) || !nullableString(row.filter_paper) || !nullableString(row.grinder) || !nullableString(row.grind_setting) || !nullableFinite(row.coffee_grams) || !nullableFinite(row.water_grams) || !nullableString(row.ratio) || !nullableFinite(row.water_temperature_c) || !nullableFinite(row.total_time_seconds) || !Array.isArray(row.pour_steps) || !row.pour_steps.every(isJsonValue) || !nullableFinite(row.rating) || !nullableFinite(row.acidity) || !nullableFinite(row.sweetness) || !nullableFinite(row.bitterness) || !nullableFinite(row.astringency) || !nullableFinite(row.body) || !nullableFinite(row.aftertaste) || !stringArray(row.flavor_tags) || typeof row.is_pinned_recipe !== 'boolean' || !nullableString(row.notes) || row.schema_version !== 1) throw failure()
}

function assertTemplateMutable(row: Record<string, unknown>, failure = invalidOperation): void {
  const categories = ['daily-pourover', 'immersion-hybrid', 'bean-specific', 'cold-brew', 'moka-pot', 'champion-reference']
  if (typeof row.name !== 'string' || !categories.includes(String(row.category)) || !['easy', 'medium', 'advanced'].includes(String(row.difficulty)) || typeof row.brewer !== 'string' || typeof row.filter !== 'string' || !isFiniteNumber(row.dose_grams) || !isFiniteNumber(row.water_grams) || typeof row.ratio !== 'string' || !isFiniteNumber(row.water_temperature_min) || !isFiniteNumber(row.water_temperature_max) || typeof row.grind_size !== 'string' || !isFiniteNumber(row.target_time_min) || !isFiniteNumber(row.target_time_max) || !Array.isArray(row.pour_steps) || !row.pour_steps.every(isTemplateStep) || !stringArray(row.suitable_for) || !stringArray(row.avoid_for) || typeof row.flavor_goal !== 'string' || !stringArray(row.adjustment_rules) || typeof row.source_notes !== 'string' || !stringArray(row.source_urls) || typeof row.is_champion_reference !== 'boolean' || !nullableString(row.copied_from_template_id) || row.schema_version !== 1) throw failure()
}

function assertSettingsMutable(row: Record<string, unknown>, failure = invalidOperation): void {
  if (!isJsonObject(row.preferred_units) || !isJsonObject(row.default_gear) || !isJsonObject(row.taste_preferences) || !isPositiveInteger(row.backup_reminder_days) || row.schema_version !== 1) throw failure()
}

function isBlendComponent(value: unknown) {
  try {
    const row = exactRecord(value, ['origin', 'process', 'variety', 'percentage', 'role', 'notes'], 'blend component')
    return typeof row.origin === 'string' && typeof row.process === 'string' && typeof row.variety === 'string' && nullableFinite(row.percentage) && typeof row.role === 'string' && typeof row.notes === 'string'
  } catch { return false }
}

function isTemplateStep(value: unknown) {
  try {
    const row = exactRecord(value, ['order', 'startSeconds', 'endSeconds', 'targetWaterGrams', 'label', 'action'], 'template step')
    return isFiniteNumber(row.order) && isFiniteNumber(row.startSeconds) && nullableFinite(row.endSeconds) && isFiniteNumber(row.targetWaterGrams) && typeof row.label === 'string' && typeof row.action === 'string'
  } catch { return false }
}

function exactRecord(value: unknown, keys: readonly string[], label: string, failure: (message?: string) => SyncApiError = invalidOperation): Record<string, unknown> {
  if (!isPlainRecord(value) || !sameKeys(Object.keys(value), keys)) throw failure(`${label} has invalid fields`)
  return value
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value) as unknown
  return prototype === Object.prototype || prototype === null
}

function isJsonObject(value: unknown): value is JsonObject {
  return isPlainRecord(value) && Object.values(value).every(isJsonValue)
}

function isJsonValue(value: unknown): value is JsonValue {
  return value === null || typeof value === 'string' || typeof value === 'boolean' || isFiniteNumber(value) || (Array.isArray(value) && value.every(isJsonValue)) || isJsonObject(value)
}

function sameKeys(actual: string[], expected: readonly string[]) {
  if (actual.length !== expected.length) return false
  const set = new Set(expected)
  return actual.every((key) => set.has(key))
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function nullableRfc3339(value: unknown): value is string | null { return value === null || isRfc3339(value) }
function nullableString(value: unknown): value is string | null { return value === null || typeof value === 'string' }
function isFiniteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
function nullableFinite(value: unknown): value is number | null { return value === null || isFiniteNumber(value) }
function nullableUuid(value: unknown): value is string | null { return value === null || isUuid(value) }
function stringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => typeof item === 'string') }
function isPositiveInteger(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 }
function nullableDate(value: unknown): value is string | null {
  if (value === null) return true
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}
function isEntityType(value: unknown): value is SyncEntityType { return value === 'bean' || value === 'brewLog' || value === 'brewTemplate' || value === 'userSettings' }
function isOperation(value: unknown): value is SyncOperation { return value === 'upsert' || value === 'delete' }

function invalidOperation(message = 'Invalid sync operation'): SyncApiError { return new SyncApiError('INVALID_SYNC_OPERATION', message, false) }
function invalidResponse(message = 'Invalid sync RPC response'): SyncApiError { return new SyncApiError('INVALID_SYNC_RESPONSE', message, false) }

function fromSupabaseError(error: unknown, responseStatus?: number): SyncApiError {
  const row = typeof error === 'object' && error !== null ? error as Record<string, unknown> : {}
  const rawCode = typeof row.code === 'string' && row.code ? row.code : 'SYNC_RPC_FAILED'
  const message = typeof row.message === 'string' && row.message ? row.message : 'Supabase sync RPC failed'
  const logicalMessageCode = /^([A-Z][A-Z0-9_]+)/.exec(message)?.[1]
  const code = rawCode === 'P0001' && logicalMessageCode
    ? logicalMessageCode
    : rawCode
  const status = typeof responseStatus === 'number'
    ? responseStatus
    : typeof row.status === 'number'
      ? row.status
      : Number(rawCode)
  const retryable = status === 408 || status === 429 || (status >= 500 && status <= 599) || /timeout|network|fetch|connection/i.test(message)
  return new SyncApiError(code, message, retryable)
}
