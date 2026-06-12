import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import type { BackupDocument, BackupImportPreview } from './backupTypes'

type ExistingBackupIds = {
  beanIds: Set<string>
  brewLogIds: Set<string>
}

type BackupImportPayloads = {
  beans: Bean[]
  brewLogs: BrewLog[]
}

export function parseBackupDocument(jsonText: string): BackupDocument {
  let parsed: unknown

  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error('备份文件格式不正确')
  }

  if (!isBackupDocument(parsed)) {
    throw new Error('备份文件格式不正确')
  }

  return parsed
}

export function createBackupImportPreview(
  backup: BackupDocument,
  existingIds: ExistingBackupIds,
): BackupImportPreview {
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

  return {
    total: {
      beans: backup.data.beans.length,
      brewLogs: backup.data.brewLogs.length,
    },
    duplicates: {
      beans: backup.data.beans.length - importableBeanIds.size,
      brewLogs: backup.data.brewLogs.length - importableBrewLogIds.size,
    },
    importable: {
      beans: importableBeanIds.size,
      brewLogs: importableBrewLogIds.size,
    },
    importableBeanIds,
    importableBrewLogIds,
  }
}

export function buildBackupImportPayloads(
  backup: BackupDocument,
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
    .filter((brewLog) => preview.importableBrewLogIds.has(brewLog.id))
    .map((brewLog) => ({
      ...brewLog,
      user_id: userId,
      bean_id:
        brewLog.bean_id && availableBeanIds.has(brewLog.bean_id)
          ? brewLog.bean_id
          : null,
      deleted_at: null,
    }))

  return {
    beans,
    brewLogs,
  }
}

function isBackupDocument(value: unknown): value is BackupDocument {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<BackupDocument>

  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.exportedAt === 'string' &&
    typeof candidate.userId === 'string' &&
    candidate.includesImages === false &&
    !!candidate.recordCounts &&
    !!candidate.data &&
    Array.isArray(candidate.data.beans) &&
    Array.isArray(candidate.data.brewLogs)
  )
}
