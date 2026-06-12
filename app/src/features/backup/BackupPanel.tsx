import { useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { buildBackupDocument, createBackupFileName } from './backupExport'
import { fetchBackupRows, recordBackupExport } from './backupService'
import './backup.css'

type BackupPanelProps = {
  session: Session
  supabase: SupabaseClient
}

export function BackupPanel({ session, supabase }: BackupPanelProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  async function handleExport() {
    setIsExporting(true)
    setStatus('')
    setError('')

    try {
      const now = new Date()
      const exportedAt = now.toISOString()
      const fileName = createBackupFileName(now)
      const rows = await fetchBackupRows(supabase)
      const backup = buildBackupDocument({
        userId: session.user.id,
        exportedAt,
        beans: rows.beans,
        brewLogs: rows.brewLogs,
      })
      const backupJson = JSON.stringify(backup, null, 2)
      const blob = new Blob([backupJson], {
        type: 'application/json;charset=utf-8',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = url
      link.download = fileName
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      await recordBackupExport(supabase, {
        userId: session.user.id,
        fileName,
        recordCounts: backup.recordCounts,
      })

      setStatus(
        `已导出 ${backup.recordCounts.beans} 支豆子、${backup.recordCounts.brewLogs} 条冲煮记录。`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出备份失败')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <section className="backup-panel" aria-labelledby="backup-title">
      <div>
        <p className="backup-panel__eyebrow">Backup</p>
        <h2 id="backup-title">本地 JSON 备份</h2>
        <p>导出当前账号的豆仓和冲煮记录，不包含图片。</p>
      </div>

      <button type="button" onClick={handleExport} disabled={isExporting}>
        {isExporting ? '导出中' : '导出 JSON 备份'}
      </button>

      {status ? <p className="backup-status">{status}</p> : null}
      {error ? <p className="backup-error">{error}</p> : null}
    </section>
  )
}
