import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import type { UserBrewTemplateRow } from '../brewTemplates/brewTemplateTypes'
import type { SavedRecommendationRow } from '../recommendations/savedRecommendationList'
import type { SourceImportRow } from '../sourceImports/sourceImportTypes'
import type { UserSettingsRow } from '../settings/userSettingsTypes'

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

export type BackupV1Document = {
  schemaVersion: 1
  exportedAt: string
  userId: string
  includesImages: false
  recordCounts: BackupRecordCounts
  data: BackupData
}

// Keep the v1 public names until the v2 import/export flow replaces its callers.
export type BackupDocument = BackupV1Document

export type BackupProfile = {
  id: string
  display_name: string | null
  created_at: string
  updated_at: string
  schema_version: number
}

export type BackupV2Data = {
  profile: BackupProfile | null
  userSettings: UserSettingsRow | null
  beans: Bean[]
  brewLogs: BrewLog[]
  brewTemplates: UserBrewTemplateRow[]
  aiRecommendations: SavedRecommendationRow[]
  sourceImports: SourceImportRow[]
}

export type BackupImageManifestEntry = {
  entityType: 'bean'
  entityId: string
  originalUrl: string
  archivePath: string | null
  mediaType: string | null
  byteLength: number
  checksum: string | null
  status: 'included' | 'missing'
  errorCode: string | null
}

export type BackupV2Manifest = {
  exportedAt: string
  appVersion: string
  backupMode: 'lightweight' | 'complete'
  recordCounts: Record<keyof BackupV2Data, number>
  checksumAlgorithm: 'SHA-256'
  checksum: string
  images: BackupImageManifestEntry[]
  warnings: string[]
}

export type BackupV2Document = {
  schemaVersion: 2
  manifest: BackupV2Manifest
  data: BackupV2Data
}

export type MigratedV1SafeMergeDocument = BackupV2Document & {
  manifest: BackupV2Manifest & {
    sourceSchemaVersion: 1
    fullRollbackEligible: false
    authoritativeSections: ['beans', 'brewLogs', 'brewTemplates']
  }
}

export type ParsedBackupDocument =
  | {
      sourceVersion: 1
      document: MigratedV1SafeMergeDocument
      fullRollbackEligible: false
    }
  | {
      sourceVersion: 2
      document: BackupV2Document
      fullRollbackEligible: true
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
