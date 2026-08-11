export const backupPreviewSections = [
  'profile',
  'userSettings',
  'beans',
  'brewLogs',
  'brewTemplates',
  'aiRecommendations',
  'sourceImports',
] as const

export type BackupPreviewSection = typeof backupPreviewSections[number]
export type BackupRestoreMode = 'safe_merge' | 'full_rollback'

export type BackupPreviewCount = {
  total: number
  new: number
  existing: number
  softDeleted: number
  willUpdate: number
  willDelete: number
}

export type BackupPreviewInvalidRelation = {
  entityType: 'brewLog' | 'aiRecommendation'
  entityId: string
  field: 'bean_id'
  value: string
}

export type BackupRestorePreview = {
  mode: BackupRestoreMode
  fullRollbackEligible: boolean
  counts: Record<BackupPreviewSection, BackupPreviewCount>
  invalidRelations: BackupPreviewInvalidRelation[]
  warnings: string[]
}

export type BackupPreviewDisplayRow = BackupPreviewCount & {
  section: BackupPreviewSection
  label: string
}

export const previewCountLabels = {
  total: '备份内总数',
  new: '将新增',
  existing: '已存在',
  softDeleted: '已软删除',
  willUpdate: '将更新或恢复',
  willDelete: '将软删除',
} as const

const sectionLabels: Record<BackupPreviewSection, string> = {
  profile: '个人资料',
  userSettings: '用户设置',
  beans: '咖啡豆',
  brewLogs: '冲煮记录',
  brewTemplates: '冲煮模板',
  aiRecommendations: 'AI 推荐',
  sourceImports: '来源导入记录',
}

export function buildBackupPreviewRows(
  preview: BackupRestorePreview,
): BackupPreviewDisplayRow[] {
  return backupPreviewSections.map((section) => ({
    section,
    label: sectionLabels[section],
    ...preview.counts[section],
  }))
}
