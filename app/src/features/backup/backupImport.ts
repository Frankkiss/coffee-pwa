import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import type { UserBrewTemplateRow } from '../brewTemplates/brewTemplateTypes'
import type { BackupDocument, BackupImportPreview } from './backupTypes'

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

  return normalizeBackupDocument(parsed)
}

export function createBackupImportPreview(
  backup: BackupDocument,
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

function normalizeBackupDocument(backup: BackupDocument): BackupDocument {
  const brewTemplates = Array.isArray(backup.data.brewTemplates)
    ? backup.data.brewTemplates
    : []

  return {
    ...backup,
    recordCounts: {
      beans: backup.data.beans.length,
      brewLogs: backup.data.brewLogs.length,
      brewTemplates: brewTemplates.length,
    },
    data: {
      ...backup.data,
      brewTemplates,
    },
  }
}
