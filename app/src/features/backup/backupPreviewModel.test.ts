import { describe, expect, it } from 'vitest'
import {
  buildBackupPreviewRows,
  previewCountLabels,
  type BackupRestorePreview,
} from './backupPreviewModel'

const count = {
  total: 9,
  new: 1,
  existing: 2,
  softDeleted: 3,
  willUpdate: 4,
  willDelete: 5,
}

function preview(): BackupRestorePreview {
  return {
    mode: 'full_rollback',
    fullRollbackEligible: true,
    counts: {
      profile: { ...count },
      userSettings: { ...count },
      beans: { ...count },
      brewLogs: { ...count },
      brewTemplates: { ...count },
      aiRecommendations: { ...count },
      sourceImports: { ...count },
    },
    invalidRelations: [],
    warnings: [],
  }
}

describe('backup preview display model', () => {
  it('keeps all seven server partitions and six count meanings distinct', () => {
    const rows = buildBackupPreviewRows(preview())
    expect(rows.map((row) => row.section)).toEqual([
      'profile', 'userSettings', 'beans', 'brewLogs', 'brewTemplates',
      'aiRecommendations', 'sourceImports',
    ])
    expect(rows[2]).toEqual({
      section: 'beans',
      label: '咖啡豆',
      total: 9,
      new: 1,
      existing: 2,
      softDeleted: 3,
      willUpdate: 4,
      willDelete: 5,
    })
    expect(previewCountLabels).toEqual({
      total: '备份内总数',
      new: '将新增',
      existing: '已存在',
      softDeleted: '已软删除',
      willUpdate: '将更新或恢复',
      willDelete: '将软删除',
    })
  })

  it('returns detached rows so view formatting cannot mutate the RPC result', () => {
    const source = preview()
    const rows = buildBackupPreviewRows(source)
    rows[0].new = 99
    expect(source.counts.profile.new).toBe(1)
  })
})
