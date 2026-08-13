import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { BackupRestoreApi } from './backupRestoreApi'
import { sha256Hex } from './backupChecksum'
import type { BackupV2Document } from './backupTypes'
import type { SyncRuntimeValue } from '../sync/SyncContext'

const sections = [
  'profile', 'userSettings', 'beans', 'brewTemplates', 'brewLogs',
  'aiRecommendations', 'sourceImports',
] as const

export async function createBackupBrowserFixture() {
  const exported = await emptyBackup()
  let syncEpoch = 1
  const previewCounts = Object.fromEntries(sections.map((section) => [section, {
    total: section === 'beans' ? 1 : 0,
    new: section === 'beans' ? 1 : 0,
    existing: 0, softDeleted: 0, willUpdate: 0, willDelete: 0,
  }]))
  const api = {
    preview: async (_backup: BackupV2Document, mode: 'safe_merge' | 'full_rollback') => ({
      mode, fullRollbackEligible: true, counts: previewCounts,
      invalidRelations: [], warnings: [],
    }),
    restoreSafeMerge: async () => ({
      mode: 'safe_merge',
      counts: Object.fromEntries(sections.map((section) => [section, {
        inserted: section === 'beans' ? 1 : 0, skipped: 0,
      }])),
    }),
    restoreFullRollback: async () => {
      syncEpoch = 2
      return {
        mode: 'full_rollback', syncEpoch,
        counts: Object.fromEntries(sections.map((section) => [section, {
          inserted: section === 'beans' ? 1 : 0, updated: 0, revived: 0, deleted: 0,
        }])),
      }
    },
    exportBackup: async () => exported,
    recordBackupDownload: async () => '2026-08-13T00:00:00.000Z',
  } as unknown as BackupRestoreApi
  const repositories = {
    userSettings: {
      getUserSettings: async () => null,
      subscribe: () => () => undefined,
    },
    beans: { listBeans: async () => [] },
    brewLogs: { listBrewLogs: async () => [] },
  } as unknown as NonNullable<SyncRuntimeValue['repositories']>
  const runtime = {
    repositories,
    run: async () => undefined,
    readSyncEpoch: async () => syncEpoch,
  }
  const downloads: string[] = []
  return {
    session: {
      user: { id: '00000000-0000-4000-8000-000000000001', email: 'fixture@example.invalid' },
    } as Session,
    supabase: {
      rpc: async (name: string) => name === 'get_latest_backup_export'
        ? { data: null, error: null }
        : { data: null, error: { code: 'FIXTURE_UNEXPECTED_RPC' } },
    } as unknown as SupabaseClient,
    fixture: {
      api, runtime,
      downloadText: (_content: string, fileName: string) => { downloads.push(fileName) },
      downloadBinary: (_content: Uint8Array, fileName: string) => { downloads.push(fileName) },
    },
    downloads,
    backup: exported,
  }
}

async function emptyBackup(): Promise<BackupV2Document> {
  const data = {
    profile: null, userSettings: null, beans: [], brewTemplates: [], brewLogs: [],
    aiRecommendations: [], sourceImports: [],
  }
  return {
    schemaVersion: 2,
    manifest: {
      exportedAt: '2026-08-13T00:00:00.000Z', appVersion: 'fixture',
      backupMode: 'lightweight', checksumAlgorithm: 'SHA-256', images: [], warnings: [],
      recordCounts: {
        profile: 0, userSettings: 0, beans: 0, brewTemplates: 0, brewLogs: 0,
        aiRecommendations: 0, sourceImports: 0,
      },
      checksum: await sha256Hex(data),
    },
    data,
  }
}
