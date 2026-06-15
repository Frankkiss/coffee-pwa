import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import type { UserBrewTemplateRow } from '../brewTemplates/brewTemplateTypes'

export type BackupRecordCounts = {
  beans: number
  brewLogs: number
  brewTemplates?: number
}

export type BackupData = {
  beans: Bean[]
  brewLogs: BrewLog[]
  brewTemplates?: UserBrewTemplateRow[]
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
  brewTemplates?: UserBrewTemplateRow[]
}

export type BackupImportCounts = {
  beans: number
  brewLogs: number
  brewTemplates: number
}

export type BackupImportPreview = {
  total: BackupImportCounts
  duplicates: BackupImportCounts
  importable: BackupImportCounts
  importableBeanIds: Set<string>
  importableBrewLogIds: Set<string>
  importableBrewTemplateIds: Set<string>
}
