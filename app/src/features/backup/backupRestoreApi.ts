import type { SupabaseClient } from '@supabase/supabase-js'
import {
  parseBackupDocument,
  validateBackupTransportDocument,
} from './backupImport'
import {
  backupPreviewSections,
  type BackupPreviewCount,
  type BackupPreviewInvalidRelation,
  type BackupRestoreMode,
  type BackupRestorePreview,
} from './backupPreviewModel'
import type {
  BackupV2Document,
  MigratedV1SafeMergeDocument,
} from './backupTypes'

type BackupTransport = BackupV2Document | MigratedV1SafeMergeDocument
type RpcResult = { data: unknown; error: unknown; status?: number }
type BackupMode = 'lightweight' | 'complete'
type V2Counts = BackupV2Document['manifest']['recordCounts']
type SafeMergeCount = { inserted: number; skipped: number }
export type SafeMergeRestoreResult = {
  mode: 'safe_merge'
  counts: Record<(typeof backupPreviewSections)[number], SafeMergeCount>
}

export class BackupRestoreApiError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(code: string, message: string, retryable = false) {
    super(message)
    this.name = 'BackupRestoreApiError'
    this.code = code
    this.retryable = retryable
  }
}

export function createBackupRestoreApi(supabase: SupabaseClient) {
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: string,
    params?: Record<string, unknown>,
  ) => Promise<RpcResult>

  return {
    async restoreSafeMerge(
      backup: BackupTransport,
    ): Promise<SafeMergeRestoreResult> {
      await validateSafeMergeRequest(backup)
      const response = await rpc('restore_backup_v2', {
        p_backup: backup,
        p_mode: 'safe_merge',
        p_confirmation: null,
      })
      assertRpcSuccess(response)
      return validateSafeMergeResponse(response.data)
    },

    async preview(
      backup: BackupTransport,
      mode: BackupRestoreMode,
    ): Promise<BackupRestorePreview> {
      const fullRollbackEligible = await validatePreviewRequest(backup, mode)
      const response = await rpc('preview_restore_v2', {
        p_backup: backup,
        p_mode: mode,
      })
      assertRpcSuccess(response)
      return validatePreviewResponse(
        response.data,
        mode,
        fullRollbackEligible,
      )
    },

    async exportBackup(
      appVersion: string,
      backupMode: BackupMode,
    ): Promise<BackupV2Document> {
      if (!isAppVersion(appVersion) || !isBackupMode(backupMode)) {
        throw invalidRequest()
      }
      const response = await rpc('export_backup_v2', {
        p_app_version: appVersion,
        p_backup_mode: backupMode,
      })
      assertRpcSuccess(response)
      try {
        const parsed = await parseBackupDocument(JSON.stringify(response.data))
        if (parsed.sourceVersion !== 2) throw invalidResponse()
        return parsed.document
      } catch (error) {
        if (error instanceof BackupRestoreApiError) throw error
        throw invalidResponse()
      }
    },

    async recordBackupDownload(
      fileName: string,
      backupMode: BackupMode,
      recordCounts: V2Counts,
    ): Promise<string> {
      if (!isBackupMode(backupMode)
        || !isBackupFileName(fileName, backupMode)
        || !isRecordCounts(recordCounts)) {
        throw invalidRequest()
      }
      const response = await rpc('record_backup_download', {
        p_file_name: fileName,
        p_backup_mode: backupMode,
        p_record_counts: recordCounts,
      })
      assertRpcSuccess(response)
      if (!isRfc3339(response.data)) throw invalidResponse()
      return response.data
    },
  }
}

async function validateSafeMergeRequest(backup: BackupTransport) {
  try {
    await validateBackupTransportDocument(backup)
  } catch {
    throw invalidRequest()
  }
}

function validateSafeMergeResponse(value: unknown): SafeMergeRestoreResult {
  const row = exactRecord(value, ['mode', 'counts'])
  if (row.mode !== 'safe_merge'
    || !isPlainRecord(row.counts)
    || !hasExactKeys(row.counts, [...backupPreviewSections])) {
    throw invalidResponse()
  }
  const responseCounts = row.counts
  const counts = Object.fromEntries(backupPreviewSections.map((section) => {
    const count = exactRecord(responseCounts[section], ['inserted', 'skipped'])
    if (!isNonNegativeInteger(count.inserted)
      || !isNonNegativeInteger(count.skipped)) throw invalidResponse()
    return [section, { inserted: count.inserted, skipped: count.skipped }]
  })) as SafeMergeRestoreResult['counts']
  return { mode: 'safe_merge', counts }
}

async function validatePreviewRequest(
  backup: BackupTransport,
  mode: BackupRestoreMode,
): Promise<boolean> {
  if (mode !== 'safe_merge' && mode !== 'full_rollback') throw invalidRequest()
  try {
    const validated = await validateBackupTransportDocument(backup)
    const derived = Object.hasOwn(
      validated.manifest,
      'sourceSchemaVersion',
    )
    if (derived && mode !== 'safe_merge') throw invalidRequest()
    return !derived
  } catch {
    throw invalidRequest()
  }
}

function validatePreviewResponse(
  value: unknown,
  requestedMode: BackupRestoreMode,
  expectedFullRollbackEligible: boolean,
): BackupRestorePreview {
  const row = exactRecord(value, [
    'mode', 'fullRollbackEligible', 'counts', 'invalidRelations', 'warnings',
  ])
  if (row.mode !== requestedMode
    || typeof row.fullRollbackEligible !== 'boolean'
    || !isPlainRecord(row.counts)
    || !hasExactKeys(row.counts, [...backupPreviewSections])
    || !Array.isArray(row.invalidRelations)
    || !Array.isArray(row.warnings)
    || !row.warnings.every(isStableWarning)) {
    throw invalidResponse()
  }
  const counts = Object.fromEntries(
    // The exact-key guard above makes every indexed value present.
    backupPreviewSections.map((section) => [
      section,
      validatePreviewCount(
        (row.counts as Record<string, unknown>)[section],
        requestedMode,
      ),
    ]),
  ) as BackupRestorePreview['counts']
  const invalidRelations = row.invalidRelations.map(validateInvalidRelation)
  if (row.fullRollbackEligible !== expectedFullRollbackEligible) {
    throw invalidResponse()
  }
  return {
    mode: requestedMode,
    fullRollbackEligible: row.fullRollbackEligible,
    counts,
    invalidRelations,
    warnings: [...row.warnings] as string[],
  }
}

function validatePreviewCount(
  value: unknown,
  mode: BackupRestoreMode,
): BackupPreviewCount {
  const row = exactRecord(value, [
    'total', 'new', 'existing', 'softDeleted', 'willUpdate', 'willDelete',
  ])
  if (!Object.values(row).every(isNonNegativeInteger)) throw invalidResponse()
  const count = row as unknown as BackupPreviewCount
  if (count.new + count.existing + count.softDeleted !== count.total
    || (mode === 'safe_merge'
      && (count.willUpdate !== 0 || count.willDelete !== 0))
    || (mode === 'full_rollback'
      && count.willUpdate !== count.existing + count.softDeleted)) {
    throw invalidResponse()
  }
  return { ...count }
}

function validateInvalidRelation(value: unknown): BackupPreviewInvalidRelation {
  const row = exactRecord(value, ['entityType', 'entityId', 'field', 'value'])
  if ((row.entityType !== 'brewLog' && row.entityType !== 'aiRecommendation')
    || !isUuid(row.entityId)
    || row.field !== 'bean_id'
    || !isUuid(row.value)) {
    throw invalidResponse()
  }
  return { ...row } as BackupPreviewInvalidRelation
}

function assertRpcSuccess(response: RpcResult): asserts response is RpcResult & { error: null } {
  if (response.error === null) return
  const error = isPlainRecord(response.error) ? response.error : {}
  const rawMessage = typeof error.message === 'string' ? error.message : ''
  const stableCode = /^([A-Z][A-Z0-9_]{2,63})$/.exec(rawMessage)?.[1]
  const status = typeof response.status === 'number'
    ? response.status
    : typeof error.status === 'number'
      ? error.status
      : Number(error.code)
  const retryable = status === 408 || status === 429
    || (status >= 500 && status <= 599)
  throw new BackupRestoreApiError(
    stableCode ?? 'BACKUP_RPC_FAILED',
    '备份操作失败，请稍后重试',
    retryable,
  )
}

function exactRecord(value: unknown, keys: string[]) {
  if (!isPlainRecord(value) || !hasExactKeys(value, keys)) {
    throw invalidResponse()
  }
  return value
}

function isRecordCounts(value: unknown): value is V2Counts {
  if (!isPlainRecord(value)
    || !hasExactKeys(value, [...backupPreviewSections])) return false
  return backupPreviewSections.every((section) => {
    const count = value[section]
    return isNonNegativeInteger(count)
      && (!(section === 'profile' || section === 'userSettings') || count <= 1)
  })
}

function isBackupFileName(fileName: unknown, mode: BackupMode) {
  if (typeof fileName !== 'string' || fileName.length > 128) return false
  const match = mode === 'lightweight'
    ? /^coffee-(?:backup|pre-restore)-(\d{4})-(\d{2})-(\d{2})\.json$/.exec(fileName)
    : /^coffee-backup-(\d{4})-(\d{2})-(\d{2})\.zip$/.exec(fileName)
  if (!match) return false
  const date = `${match[1]}-${match[2]}-${match[3]}`
  const parsed = new Date(`${date}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
}

function isAppVersion(value: unknown) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 64
    && /^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(value)
}

function isBackupMode(value: unknown): value is BackupMode {
  return value === 'lightweight' || value === 'complete'
}

function isStableWarning(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value)
  const expected = new Set(keys)
  return actual.length === keys.length && actual.every((key) => expected.has(key))
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isRfc3339(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value)
  if (!match || !Number.isFinite(Date.parse(value))) return false
  const normalized = new Date(value)
  return Number(match[2]) >= 1 && Number(match[2]) <= 12
    && Number(match[3]) >= 1
    && Number(match[3]) <= daysInMonth(Number(match[1]), Number(match[2]))
    && Number(match[4]) <= 23 && Number(match[5]) <= 59
    && Number(match[6]) <= 59 && Number(match[7] ?? 0) <= 23
    && Number(match[8] ?? 0) <= 59 && !Number.isNaN(normalized.getTime())
}

function daysInMonth(year: number, month: number) {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

function invalidRequest() {
  return new BackupRestoreApiError(
    'INVALID_BACKUP_RPC_REQUEST',
    '备份请求无效',
  )
}

function invalidResponse() {
  return new BackupRestoreApiError(
    'INVALID_BACKUP_RPC_RESPONSE',
    '服务器返回了无法识别的备份结果',
  )
}
