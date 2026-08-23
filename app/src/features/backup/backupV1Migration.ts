import { sha256Hex } from './backupChecksum'
import type {
  BackupV1Document,
  MigratedV1SafeMergeDocument,
} from './backupTypes'

export async function normalizeV1ForSafeMerge(
  source: BackupV1Document,
): Promise<MigratedV1SafeMergeDocument> {
  const brewTemplates = source.data.brewTemplates ?? []
  const authoritativeSections: Array<'beans' | 'brewLogs' | 'brewTemplates'> = [
    'beans',
    'brewLogs',
  ]

  if (source.data.brewTemplates !== undefined) {
    authoritativeSections.push('brewTemplates')
  }

  const data = {
    profile: null,
    userSettings: null,
    beans: source.data.beans.map((bean) => ({
      ...bean,
      remaining_grams: bean.remaining_grams ?? null,
      bean_type: bean.bean_type ?? 'single_origin' as const,
      blend_components: bean.blend_components ?? [],
      blend_notes: bean.blend_notes ?? null,
    })),
    brewLogs: source.data.brewLogs,
    brewTemplates,
    aiRecommendations: [],
    sourceImports: [],
  }

  return {
    schemaVersion: 2,
    manifest: {
      exportedAt: source.exportedAt,
      appVersion: 'v1-migration',
      backupMode: 'lightweight',
      recordCounts: {
        profile: 0,
        userSettings: 0,
        beans: data.beans.length,
        brewLogs: data.brewLogs.length,
        brewTemplates: data.brewTemplates.length,
        aiRecommendations: 0,
        sourceImports: 0,
      },
      checksumAlgorithm: 'SHA-256',
      checksum: await sha256Hex(data),
      images: [],
      warnings: [],
      sourceSchemaVersion: 1,
      fullRollbackEligible: false,
      authoritativeSections,
    },
    data,
  }
}
