import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { buildBackupPreviewRows, type BackupRestorePreview } from './backupPreviewModel'
import { createBackupRestoreApi, type BackupRestoreApi, type FullRollbackRestoreResult, type SafeMergeRestoreResult } from './backupRestoreApi'
import { exportBackupV2ForDownload, exportCompleteBackupForDownload } from './backupExport'
import { parseBackupDocument } from './backupImport'
import {
  beginParsing,
  beginRestore,
  canConfirmFullRollback,
  completeFlow,
  createBackupGenerationGuard,
  createRestoreAttempt,
  failFlow,
  initialBackupFlowState,
  resetFlow,
  showPreview,
  waitForSyncEpoch,
  acceptAsyncResult,
  type BackupFlowState,
} from './backupFlowModel'
import type { ParsedBackupDocument } from './backupTypes'
import { buildBeansCsv, buildBrewLogsCsv, createCsvFileName } from './csvExport'
import { useOptionalSyncRuntime, type SyncRuntimeValue } from '../sync/SyncContext'
import {
  buildBackupReminderFromResolution,
  createBackupReminderApi,
  createOwnedBackupReminderResolution,
  resolveBackupReminderMeta,
  selectBackupReminderResolutionForOwner,
} from './backupReminder'
import './backup.css'

type BackupPanelProps = {
  session: Session
  supabase: SupabaseClient
  fixture?: {
    api: BackupRestoreApi
    runtime: Pick<SyncRuntimeValue, 'repositories' | 'run' | 'readSyncEpoch'>
    downloadText?: typeof downloadTextFile
    downloadBinary?: typeof downloadBinaryFile
  }
}
type RestoreResult = SafeMergeRestoreResult | FullRollbackRestoreResult

const appVersion = import.meta.env.VITE_APP_VERSION || '0.0.0'

export function BackupPanel({ session, supabase, fixture }: BackupPanelProps) {
  const contextRuntime = useOptionalSyncRuntime()
  const runtime = requireBackupRuntime(fixture?.runtime ?? contextRuntime)
  const api = useMemo(() => fixture?.api ?? createBackupRestoreApi(supabase), [fixture?.api, supabase])
  const downloadText = fixture?.downloadText ?? downloadTextFile
  const downloadBinary = fixture?.downloadBinary ?? downloadBinaryFile
  const guardRef = useRef(createBackupGenerationGuard(session.user.id))
  const exportGuardRef = useRef(createBackupGenerationGuard(session.user.id))
  const rollbackGuardRef = useRef(createBackupGenerationGuard(session.user.id))
  const restoreAttemptRef = useRef(createRestoreAttempt(() => crypto.randomUUID()))
  const safeMergeRunningRef = useRef(false)
  const flowRef = useRef(initialBackupFlowState)
  const [flow, setFlow] = useState(initialBackupFlowState)
  function dispatchFlow(next: BackupFlowState) {
    flowRef.current = next
    setFlow(next)
  }
  const [selected, setSelected] = useState<ParsedBackupDocument | null>(null)
  const [preview, setPreview] = useState<BackupRestorePreview | null>(null)
  const [safePreview, setSafePreview] = useState<BackupRestorePreview | null>(null)
  const [fullRollbackOpen, setFullRollbackOpen] = useState(false)
  const [fullPreviewGeneration, setFullPreviewGeneration] = useState<number | null>(null)
  const [preRestoreDownloadGeneration, setPreRestoreDownloadGeneration] = useState<number | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isCompleteExporting, setIsCompleteExporting] = useState(false)
  const [isPreparingRollback, setIsPreparingRollback] = useState(false)
  const [csvExporting, setCsvExporting] = useState<'beans' | 'brews' | null>(null)
  const [backupReminderDays, setBackupReminderDays] = useState(7)
  const [ownedReminder, setOwnedReminder] = useState(() =>
    createOwnedBackupReminderResolution(null),
  )
  const [notice, setNotice] = useState('')
  const selectedGeneration = flow.generation

  useEffect(() => () => {
    guardRef.current.dispose()
    exportGuardRef.current.dispose()
    rollbackGuardRef.current.dispose()
  }, [])
  useEffect(() => {
    const repository = runtime.repositories?.userSettings
    if (!repository) return
    let active = true
    let generation = 0
    const load = async () => {
      const token = ++generation
      try {
        const settings = await repository.getUserSettings()
        if (active && token === generation) setBackupReminderDays(settings?.backup_reminder_days ?? 7)
      } catch {
        if (active && token === generation) setBackupReminderDays(7)
      }
    }
    void load()
    const unsubscribe = repository.subscribe(() => void load())
    return () => { active = false; generation += 1; unsubscribe() }
  }, [runtime.repositories?.userSettings])
  useEffect(() => {
    let active = true
    let generation = 0
    const load = async () => {
      const token = ++generation
      const resolution = await resolveBackupReminderMeta(
        createBackupReminderApi(supabase), window.localStorage,
      )
      if (active && token === generation) {
        setOwnedReminder(createOwnedBackupReminderResolution(session.user.id, resolution))
      }
    }
    void load()
    return () => { active = false; generation += 1 }
  }, [session.user.id, supabase])

  function clearFullRollback() {
    rollbackGuardRef.current.invalidate()
    restoreAttemptRef.current.reset()
    setFullRollbackOpen(false)
    setFullPreviewGeneration(null)
    setPreRestoreDownloadGeneration(null)
    setConfirmation('')
    setIsPreparingRollback(false)
    if (safePreview) setPreview(safePreview)
  }

  function clearSelection() {
    guardRef.current.invalidate()
    clearFullRollback()
    setSelected(null)
    setPreview(null)
    setSafePreview(null)
    setRestoreResult(null)
    setNotice('')
    dispatchFlow(resetFlow())
  }

  async function handleExport() {
    if (isExporting || isCompleteExporting || csvExporting) return
    setIsExporting(true)
    setNotice('')
    const token = exportGuardRef.current.begin()
    try {
      const result = await exportBackupV2ForDownload({
        api, appVersion, now: new Date(), download: downloadText,
        isCurrent: () => exportGuardRef.current.isCurrent(token, session.user.id),
      })
      if (!exportGuardRef.current.isCurrent(token, session.user.id)) return
      if (result.metadataRecorded && result.recordedAt) {
        setOwnedReminder(createOwnedBackupReminderResolution(session.user.id, {
          status: 'ready', source: 'cloud',
          meta: { exportedAt: result.recordedAt, fileName: result.fileName },
        }))
      }
      setNotice(result.metadataRecorded
        ? '备份已下载并记录。'
        : '备份文件已下载，但云端提醒记录暂未保存；无需重复下载。')
    } catch {
      if (exportGuardRef.current.isCurrent(token, session.user.id)) {
        setNotice('备份未下载，请检查网络后重试。')
      }
    } finally {
      if (exportGuardRef.current.isCurrent(token, session.user.id)) setIsExporting(false)
    }
  }

  async function handleCompleteExport() {
    if (isExporting || isCompleteExporting || csvExporting) return
    setIsCompleteExporting(true)
    setNotice('')
    const token = exportGuardRef.current.begin()
    try {
      const result = await exportCompleteBackupForDownload({
        api, appVersion, now: new Date(), fetchImpl: fetch, download: downloadBinary,
        isCurrent: () => exportGuardRef.current.isCurrent(token, session.user.id),
      })
      if (!exportGuardRef.current.isCurrent(token, session.user.id)) return
      if (result.metadataRecorded && result.recordedAt) {
        setOwnedReminder(createOwnedBackupReminderResolution(session.user.id, {
          status: 'ready', source: 'cloud',
          meta: { exportedAt: result.recordedAt, fileName: result.fileName },
        }))
      }
      const missing = result.document.manifest.images.filter((image) => image.status === 'missing').length
      setNotice(`${result.metadataRecorded ? '完整备份已下载并记录' : '完整备份已下载，但云端提醒记录暂未保存'}；${missing} 张不可访问图片已写入清单。`)
    } catch {
      if (exportGuardRef.current.isCurrent(token, session.user.id)) {
        setNotice('完整备份未下载，请检查网络后重试。')
      }
    } finally {
      if (exportGuardRef.current.isCurrent(token, session.user.id)) setIsCompleteExporting(false)
    }
  }

  async function handleCsv(kind: 'beans' | 'brews') {
    const repository = kind === 'beans' ? runtime.repositories?.beans : runtime.repositories?.brewLogs
    if (!repository || csvExporting) return
    setCsvExporting(kind)
    setNotice('')
    try {
      if (kind === 'beans') {
        const rows = await runtime.repositories!.beans.listBeans()
        downloadTextFile(buildBeansCsv(rows), createCsvFileName('beans', new Date()), 'text/csv;charset=utf-8')
      } else {
        const rows = await runtime.repositories!.brewLogs.listBrewLogs()
        downloadTextFile(buildBrewLogsCsv(rows), createCsvFileName('brew-logs', new Date()), 'text/csv;charset=utf-8')
      }
      setNotice('CSV 已下载。')
    } catch {
      setNotice('CSV 导出失败，请稍后重试。')
    } finally {
      setCsvExporting(null)
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    clearSelection()
    if (!file) return
    const token = guardRef.current.begin()
    dispatchFlow(beginParsing(flowRef.current, token))
    try {
      const parsed = await parseBackupDocument(await file.text())
      const nextPreview = await api.preview(parsed.document, 'safe_merge')
      if (!guardRef.current.isCurrent(token, session.user.id)) return
      setSelected(parsed)
      setPreview(nextPreview)
      setSafePreview(nextPreview)
      dispatchFlow(showPreview(flowRef.current, token))
    } catch {
      if (!guardRef.current.isCurrent(token, session.user.id)) return
      dispatchFlow(failFlow(flowRef.current, token, '无法读取这份备份；文件可能损坏或格式不受支持。'))
    }
  }

  async function handleSafeMerge() {
    if (!selected || !preview || safeMergeRunningRef.current
      || (flow.phase !== 'preview' && flow.phase !== 'error') || invalidCount > 0) return
    const token = selectedGeneration
    safeMergeRunningRef.current = true
    dispatchFlow(beginRestore(flowRef.current))
    let committed: SafeMergeRestoreResult | null = null
    try {
      const result = await api.restoreSafeMerge(selected.document)
      if (!acceptAsyncResult(
        guardRef.current.isCurrent(token, session.user.id),
        result,
        setRestoreResult,
      )) return
      committed = result
      await runtime.run()
      if (!guardRef.current.isCurrent(token, session.user.id)) return
      dispatchFlow(completeFlow(flowRef.current, '安全合并完成；现有数据没有被覆盖。'))
    } catch {
      if (!guardRef.current.isCurrent(token, session.user.id)) return
      dispatchFlow(failFlow(
        flowRef.current,
        token,
        committed
          ? '安全合并已提交，但本机刷新暂未完成；再次执行只会跳过已有数据。'
          : '安全合并失败，服务器没有保留半完成状态。',
      ))
    } finally {
      safeMergeRunningRef.current = false
    }
  }

  async function prepareFullRollback() {
    if (!selected || selected.sourceVersion !== 2
      || (flow.phase !== 'preview' && flow.phase !== 'error') || isPreparingRollback) return
    const token = selectedGeneration
    const preparationToken = rollbackGuardRef.current.begin()
    setIsPreparingRollback(true)
    setFullRollbackOpen(true)
    setFullPreviewGeneration(null)
    setPreRestoreDownloadGeneration(null)
    setConfirmation('')
    restoreAttemptRef.current.reset()
    setNotice('正在刷新回滚影响并下载恢复前备份…')
    try {
      const nextPreview = await api.preview(selected.document, 'full_rollback')
      if (!isCurrentRollbackPreparation(token, preparationToken)) return
      setPreview(nextPreview)
      setFullPreviewGeneration(token)
      const fileName = `coffee-pre-restore-${new Date().toISOString().slice(0, 10)}.json`
      const exported = await exportBackupV2ForDownload({
        api, appVersion, now: new Date(), fileName, download: downloadText,
        isCurrent: () => isCurrentRollbackPreparation(token, preparationToken),
      })
      if (!isCurrentRollbackPreparation(token, preparationToken)) return
      setPreRestoreDownloadGeneration(token)
      setNotice(exported.metadataRecorded
        ? '恢复前备份已下载。核对影响后输入确认文本。'
        : '恢复前备份已下载，但提醒记录暂未保存；可以继续回滚。')
    } catch {
      if (!isCurrentRollbackPreparation(token, preparationToken)) return
      setNotice('无法完成恢复前保护步骤，全量回滚未开放。')
    } finally {
      if (isCurrentRollbackPreparation(token, preparationToken)) setIsPreparingRollback(false)
    }
  }

  function isCurrentRollbackPreparation(selectionToken: number, preparationToken: number) {
    return guardRef.current.isCurrent(selectionToken, session.user.id)
      && rollbackGuardRef.current.isCurrent(preparationToken, session.user.id)
  }

  async function handleFullRollback() {
    if (!selected || selected.sourceVersion !== 2 || !canRunFullRollback
      || (flow.phase !== 'preview' && flow.phase !== 'error')) return
    const token = selectedGeneration
    dispatchFlow(beginRestore(flowRef.current))
    let committed: FullRollbackRestoreResult | null = null
    try {
      const result = await restoreAttemptRef.current.run((requestId) =>
        api.restoreFullRollback(selected.document, confirmation, requestId))
      if (!acceptAsyncResult(
        guardRef.current.isCurrent(token, session.user.id),
        result,
        setRestoreResult,
      )) return
      committed = result
      await waitForSyncEpoch(result.syncEpoch, runtime.run, runtime.readSyncEpoch)
      if (!guardRef.current.isCurrent(token, session.user.id)) return
      dispatchFlow(completeFlow(flowRef.current, `全量回滚完成；本机已采用同步代次 ${result.syncEpoch}。`))
    } catch {
      if (!guardRef.current.isCurrent(token, session.user.id)) return
      dispatchFlow(failFlow(
        flowRef.current,
        token,
        committed
          ? `全量回滚已提交为同步代次 ${committed.syncEpoch}，但本机尚未完成重新同步；重试会沿用同一安全请求编号。`
          : '回滚未确认完成。再次重试会沿用同一安全请求编号。',
      ))
    }
  }

  const sourceInvalidCount = selected?.invalidRelations.length ?? 0
  const invalidCount = sourceInvalidCount + (preview?.invalidRelations.length ?? 0)
  const previewRows = preview ? buildBackupPreviewRows(preview) : []
  const canRunFullRollback = canConfirmFullRollback({
    selectedGeneration,
    previewGeneration: fullPreviewGeneration,
    preRestoreDownloadGeneration,
    confirmation,
    invalidRelationCount: invalidCount,
  })
  const reminder = buildBackupReminderFromResolution(
    selectBackupReminderResolutionForOwner(ownedReminder, session.user.id),
    new Date(), backupReminderDays,
  )

  return (
    <section id="backup" className="backup-panel" aria-labelledby="backup-title">
      <header className="backup-panel__header">
        <div><p className="backup-panel__eyebrow">Backup</p><h2 id="backup-title">备份与恢复</h2></div>
        <p>默认安全合并；全量回滚需要额外保护确认。</p>
      </header>

      <div className={`backup-reminder backup-reminder--${reminder.tone}`}>
        <strong>{reminder.title}</strong><p>{reminder.message}</p>
        {reminder.fileName ? <span>最近文件：{reminder.fileName}</span> : null}
      </div>

      <section className="backup-card" aria-labelledby="backup-export-title">
        <div><strong id="backup-export-title">保存一份轻量备份</strong><p>包含全部可见逻辑数据，不含图片。</p></div>
        <button type="button" onClick={handleExport} disabled={isExporting || isCompleteExporting || csvExporting !== null}>{isExporting ? '正在生成…' : '下载 JSON 备份'}</button>
        <div className="backup-complete">
          <button type="button" className="backup-button--quiet" onClick={handleCompleteExport} disabled={isExporting || isCompleteExporting || csvExporting !== null}>
            {isCompleteExporting ? '正在收集可访问图片…' : '包含可访问图片的完整 ZIP'}
          </button>
          <p>图片会压缩后附加；无法访问的远程图片不会阻断备份，并会在清单中报告。</p>
        </div>
        <div className="backup-csv__actions">
          <button type="button" className="backup-button--quiet" onClick={() => void handleCsv('beans')} disabled={csvExporting !== null || isExporting || isCompleteExporting}>豆子 CSV</button>
          <button type="button" className="backup-button--quiet" onClick={() => void handleCsv('brews')} disabled={csvExporting !== null || isExporting || isCompleteExporting}>冲煮 CSV</button>
        </div>
      </section>

      <section className="backup-card backup-import" aria-labelledby="backup-restore-title">
        <div><strong id="backup-restore-title">从备份恢复</strong><p>选择文件后先校验，再显示实际影响。</p></div>
        <label className="backup-file">选择 JSON 备份<input type="file" accept="application/json,.json" onChange={handleFileChange} disabled={flow.phase === 'restoring'} /></label>
        {selected ? <button type="button" className="backup-button--quiet" onClick={clearSelection} disabled={flow.phase === 'restoring'}>清除已选文件</button> : null}

        {flow.phase === 'parsing' ? <p className="backup-progress" role="status">正在校验文件并生成预览…</p> : null}
        {flow.phase === 'restoring' ? <p className="backup-progress" role="status">恢复正在服务器事务中执行，现在不能取消或更换文件。</p> : null}
        {preview && selected ? (
          <div className="backup-preview" aria-labelledby="backup-preview-title">
            <div className="backup-preview__summary">
              <strong id="backup-preview-title">影响预览</strong>
              <span>版本 v{selected.sourceVersion}</span><span>SHA-256 已通过</span>
            </div>
            <div className="backup-preview__table" role="table" aria-label="恢复影响计数">
              {previewRows.map((row) => (
                <div className="backup-preview__row" role="row" key={row.section}>
                  <strong role="rowheader">{row.label}</strong>
                  <span>共 {row.total}</span><span>新增 {row.new}</span>
                  <span>重复 {row.existing}</span><span>已删除 {row.softDeleted}</span>
                  {preview.mode === 'full_rollback' ? <><span>更新/恢复 {row.willUpdate}</span><span>将删除 {row.willDelete}</span></> : null}
                </div>
              ))}
            </div>
            <p className={invalidCount > 0 ? 'backup-preview__invalid' : 'backup-preview__valid'}>
              关联异常：{invalidCount}；警告：{preview.warnings.length}
            </p>
            {preview.warnings.length > 0 ? <ul className="backup-preview__warnings">{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
            <button type="button" onClick={handleSafeMerge} disabled={flow.phase === 'restoring' || isPreparingRollback || invalidCount > 0 || preview.mode !== 'safe_merge'}>安全合并缺失数据</button>
            {selected.fullRollbackEligible ? (
              <button type="button" className="backup-button--danger-link" onClick={prepareFullRollback} disabled={flow.phase === 'restoring' || isPreparingRollback}>{isPreparingRollback ? '正在准备回滚…' : '全量回滚'}</button>
            ) : <p>这份 v1 备份只能安全合并，不能全量回滚。</p>}
          </div>
        ) : null}

        {fullRollbackOpen && selected?.sourceVersion === 2 ? (
          <div className="backup-rollback" aria-labelledby="backup-rollback-title">
            <strong id="backup-rollback-title">全量回滚危险区</strong>
            <p>会让备份内容成为当前权威数据；当前但备份中缺失的记录将被软删除。</p>
            <p>恢复前备份：{preRestoreDownloadGeneration === selectedGeneration ? '已下载' : '未完成'}</p>
            <label>输入 <code>FULL RESTORE</code> 继续
              <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={preRestoreDownloadGeneration !== selectedGeneration || flow.phase === 'restoring'} autoComplete="off" />
            </label>
            <div className="backup-rollback__actions">
              <button type="button" className="backup-button--danger" onClick={handleFullRollback} disabled={!canRunFullRollback || flow.phase === 'restoring'}>{flow.phase === 'restoring' ? '正在回滚…' : '确认全量回滚'}</button>
              <button type="button" className="backup-button--quiet" onClick={clearFullRollback} disabled={flow.phase === 'restoring'}>取消</button>
            </div>
          </div>
        ) : null}
      </section>

      {restoreResult ? <RestoreResultSummary result={restoreResult} /> : null}
      <div className="backup-announcer" aria-live="polite" aria-atomic="true">
        {flow.message ? <p className={flow.phase === 'error' ? 'backup-error' : 'backup-status'}>{flow.message}</p> : null}
        {notice ? <p className="backup-status">{notice}</p> : null}
      </div>
    </section>
  )
}

function requireBackupRuntime(
  runtime: Pick<SyncRuntimeValue, 'repositories' | 'run' | 'readSyncEpoch'> | null,
) {
  if (!runtime) throw new Error('备份面板需要同步运行环境。')
  return runtime
}

function RestoreResultSummary({ result }: { result: RestoreResult }) {
  const totals = Object.values(result.counts as Record<string, Record<string, number>>)
    .reduce((sum, count) => sum + Object.values(count).reduce((part, value) => part + value, 0), 0)
  return <div className="backup-result" role="status"><strong>恢复结果</strong><span>处理影响合计 {totals} 项</span>{result.mode === 'full_rollback' ? <span>新同步代次 {result.syncEpoch}</span> : null}</div>
}

function downloadTextFile(content: string, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  try { link.click() } finally { link.remove(); URL.revokeObjectURL(url) }
}

function downloadBinaryFile(content: Uint8Array, fileName: string, type: string) {
  const bytes = new Uint8Array(content)
  const url = URL.createObjectURL(new Blob([bytes.buffer], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  try { link.click() } finally { link.remove(); URL.revokeObjectURL(url) }
}
