import type { SupabaseClient } from '@supabase/supabase-js'
import { isRfc3339 } from '../../lib/rfc3339'

export type BackupReminderMeta = {
  exportedAt: string
  fileName: string
}

export type BackupReminderView = {
  tone: 'ok' | 'warning'
  title: string
  message: string
  fileName: string | null
  daysSinceExport: number | null
}

export const backupReminderStorageKey = 'kaday:last-json-backup'

const dayInMs = 24 * 60 * 60 * 1000

export function readBackupReminderMeta(storage: Storage): BackupReminderMeta | null {
  try {
    const rawValue = storage.getItem(backupReminderStorageKey)
    if (!rawValue) {
      return null
    }

    const parsed = JSON.parse(rawValue) as Partial<BackupReminderMeta>
    if (typeof parsed.exportedAt !== 'string' || typeof parsed.fileName !== 'string') {
      return null
    }

    if (Number.isNaN(new Date(parsed.exportedAt).getTime()) || !parsed.fileName.trim()) {
      return null
    }

    return {
      exportedAt: parsed.exportedAt,
      fileName: parsed.fileName,
    }
  } catch {
    return null
  }
}

export type BackupReminderResolution = {
  status: 'ready'
  source: 'cloud' | 'legacy' | 'none'
  meta: BackupReminderMeta | null
} | {
  status: 'unavailable'
  source: null
  meta: null
}

export type OwnedBackupReminderResolution = {
  ownerId: string | null
  resolution: BackupReminderResolution
}

const unavailableResolution: BackupReminderResolution = {
  status: 'unavailable', source: null, meta: null,
}

export function createOwnedBackupReminderResolution(
  ownerId: string | null,
  resolution: BackupReminderResolution = unavailableResolution,
): OwnedBackupReminderResolution {
  return { ownerId, resolution }
}

export function selectBackupReminderResolutionForOwner(
  value: OwnedBackupReminderResolution,
  ownerId: string,
): BackupReminderResolution {
  return value.ownerId === ownerId ? value.resolution : unavailableResolution
}

type BackupReminderApi = {
  getLatestBackupExport(): Promise<BackupReminderMeta | null>
}

export function createBackupReminderApi(supabase: SupabaseClient): BackupReminderApi {
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: string,
  ) => Promise<{ data: unknown; error: unknown }>

  return {
    async getLatestBackupExport() {
      const response = await rpc('get_latest_backup_export')
      if (response.error) throw reminderError('BACKUP_REMINDER_UNAVAILABLE')
      if (response.data === null) return null
      if (!isExactReminderMeta(response.data)) {
        throw reminderError('INVALID_BACKUP_REMINDER_RESPONSE')
      }
      return response.data
    },
  }
}

export async function resolveBackupReminderMeta(
  api: BackupReminderApi,
  legacyStorage: Storage,
): Promise<BackupReminderResolution> {
  try {
    const cloudMeta = await api.getLatestBackupExport()
    if (cloudMeta) return { status: 'ready', source: 'cloud', meta: cloudMeta }
    const legacyMeta = readBackupReminderMeta(legacyStorage)
    return {
      status: 'ready',
      source: legacyMeta ? 'legacy' : 'none',
      meta: legacyMeta,
    }
  } catch {
    return { status: 'unavailable', source: null, meta: null }
  }
}

export function buildBackupReminder(
  meta: BackupReminderMeta | null,
  now: Date,
  backupReminderDays: number,
): BackupReminderView {
  if (!meta) {
    return {
      tone: 'warning',
      title: '尚未创建本地备份',
      message: '建议先导出一次 JSON 备份，之后这里会提醒你是否太久没有备份。',
      fileName: null,
      daysSinceExport: null,
    }
  }

  const exportedAt = new Date(meta.exportedAt)
  const daysSinceExport = Math.max(
    0,
    Math.floor((now.getTime() - exportedAt.getTime()) / dayInMs),
  )

  if (daysSinceExport > backupReminderDays) {
    return {
      tone: 'warning',
      title: '建议导出一次备份',
      message: `距离上次 JSON 备份已经 ${daysSinceExport} 天。长期使用时，建议现在导出一份新备份。`,
      fileName: meta.fileName,
      daysSinceExport,
    }
  }

  return {
    tone: 'ok',
    title: '最近已备份',
    message: `上次 JSON 备份在 ${daysSinceExport} 天前，当前备份节奏正常。`,
    fileName: meta.fileName,
    daysSinceExport,
  }
}

export function buildBackupReminderFromResolution(
  resolution: BackupReminderResolution,
  now: Date,
  backupReminderDays: number,
): BackupReminderView {
  if (resolution.status === 'unavailable') {
    return {
      tone: 'warning',
      title: '暂时无法读取云端备份记录',
      message: '联网后会重新读取跨设备备份记录；当前不会使用旧的本机记录代替。',
      fileName: null,
      daysSinceExport: null,
    }
  }
  return buildBackupReminder(resolution.meta, now, backupReminderDays)
}

function isExactReminderMeta(value: unknown): value is BackupReminderMeta {
  if (!isRecord(value) || Object.keys(value).length !== 2
    || !Object.hasOwn(value, 'exportedAt') || !Object.hasOwn(value, 'fileName')
    || typeof value.exportedAt !== 'string' || typeof value.fileName !== 'string') {
    return false
  }
  return isRfc3339(value.exportedAt)
    && value.fileName.length >= 1
    && value.fileName.length <= 128
    && !/[\\/]/.test(value.fileName)
    && !Array.from(value.fileName).some((character) => {
      const code = character.charCodeAt(0)
      return code < 32 || code === 127
    })
    && value.fileName.trim() === value.fileName
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function reminderError(code: string) {
  return Object.assign(new Error('Backup reminder metadata is unavailable'), { code })
}
