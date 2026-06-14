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

const staleAfterDays = 7
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

export function writeBackupReminderMeta(storage: Storage, meta: BackupReminderMeta) {
  storage.setItem(backupReminderStorageKey, JSON.stringify(meta))
}

export function buildBackupReminder(
  meta: BackupReminderMeta | null,
  now: Date,
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

  if (daysSinceExport > staleAfterDays) {
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
