import { verifyBackupChecksum } from './backupChecksum'
import type {
  BackupDocument,
  BackupV2Document,
  BuildBackupDocumentInput,
} from './backupTypes'

export function buildBackupDocument(
  input: BuildBackupDocumentInput,
): BackupDocument {
  const brewTemplates = input.brewTemplates ?? []

  return {
    schemaVersion: 1,
    exportedAt: input.exportedAt,
    userId: input.userId,
    includesImages: false,
    recordCounts: {
      beans: input.beans.length,
      brewLogs: input.brewLogs.length,
      brewTemplates: brewTemplates.length,
    },
    data: {
      beans: input.beans,
      brewLogs: input.brewLogs,
      brewTemplates,
    },
  }
}

export function createBackupFileName(date: Date) {
  return `coffee-backup-${date.toISOString().slice(0, 10)}.json`
}

export function createRestorePointFileName(date: Date) {
  return `coffee-restore-point-${date.toISOString().slice(0, 10)}.json`
}

type BackupExportApi = {
  exportBackup(appVersion: string, mode: 'lightweight'): Promise<BackupV2Document>
  recordBackupDownload(
    fileName: string,
    mode: 'lightweight',
    counts: BackupV2Document['manifest']['recordCounts'],
  ): Promise<string>
}

export async function exportBackupV2ForDownload(input: {
  api: BackupExportApi
  appVersion: string
  now: Date
  fileName?: string
  download: (content: string, fileName: string, type: string) => void
  isCurrent?: () => boolean
}) {
  const document = await input.api.exportBackup(input.appVersion, 'lightweight')
  if (!(await verifyBackupChecksum(document))) {
    throw new Error('备份校验失败，未下载文件')
  }
  assertCurrent(input.isCurrent)
  const fileName = input.fileName ?? createBackupFileName(input.now)
  input.download(
    JSON.stringify(document, null, 2),
    fileName,
    'application/json;charset=utf-8',
  )

  try {
    const recordedAt = await input.api.recordBackupDownload(
      fileName,
      'lightweight',
      document.manifest.recordCounts,
    )
    return { document, fileName, metadataRecorded: true as const, recordedAt }
  } catch (error) {
    if (isStaleOperation(error)) throw error
    return { document, fileName, metadataRecorded: false as const, recordedAt: null }
  }
}

function isStaleOperation(error: unknown) {
  return typeof error === 'object' && error !== null
    && 'code' in error && error.code === 'BACKUP_OPERATION_STALE'
}

function assertCurrent(isCurrent?: () => boolean) {
  if (isCurrent && !isCurrent()) {
    throw Object.assign(new Error('备份操作已失效'), { code: 'BACKUP_OPERATION_STALE' })
  }
}
