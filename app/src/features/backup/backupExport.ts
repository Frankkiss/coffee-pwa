import type { BackupDocument, BuildBackupDocumentInput } from './backupTypes'

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
