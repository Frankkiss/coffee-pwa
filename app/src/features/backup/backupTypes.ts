import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'

export type BackupRecordCounts = {
  beans: number
  brewLogs: number
}

export type BackupData = {
  beans: Bean[]
  brewLogs: BrewLog[]
}

export type BackupDocument = {
  schemaVersion: 1
  exportedAt: string
  userId: string
  includesImages: false
  recordCounts: BackupRecordCounts
  data: BackupData
}

export type BuildBackupDocumentInput = {
  userId: string
  exportedAt: string
  beans: Bean[]
  brewLogs: BrewLog[]
}

export type BackupImportCounts = {
  beans: number
  brewLogs: number
}

export type BackupImportPreview = {
  total: BackupImportCounts
  duplicates: BackupImportCounts
  importable: BackupImportCounts
  importableBeanIds: Set<string>
  importableBrewLogIds: Set<string>
}
