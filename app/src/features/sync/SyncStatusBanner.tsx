import { useEffect, useState } from 'react'
import type { RetryMutationResult } from './syncManager'
import { toSyncStatusView } from './syncStatusModel'
import { useSyncRuntime } from './SyncContext'
import { performAttentionAction } from './syncStatusActions'
import { subscribeToNetworkChanges } from '../../pwa/onlineStatusModel'
import './syncStatus.css'

type AttentionAction = 'retry' | 'confirm' | 'discard'

export function SyncStatusBanner() {
  const runtime = useSyncRuntime()
  const view = toSyncStatusView(runtime.state)
  const [busyMutationId, setBusyMutationId] = useState<string | null>(null)
  const [preview, setPreview] = useState<{
    mutationId: string
    value: Extract<RetryMutationResult, { status: 'confirmation_required' }>['preview']
  } | null>(null)
  const [actionError, setActionError] = useState('')
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)

  useEffect(() => subscribeToNetworkChanges(
    window,
    () => setIsOnline(navigator.onLine),
  ), [])

  const visiblePreview = preview && runtime.attentionItems.some(
    (item) => item.mutationId === preview.mutationId,
  ) ? preview : null

  async function handleAction(action: AttentionAction, mutationId: string) {
    setBusyMutationId(mutationId)
    setActionError('')
    if (preview?.mutationId !== mutationId || action !== 'confirm') setPreview(null)
    try {
      const result = await performAttentionAction(action, mutationId, runtime)
      if (result?.status === 'confirmation_required') {
        setPreview({ mutationId, value: result.preview })
      } else {
        setPreview(null)
      }
    } catch (error) {
      setPreview(null)
      setActionError(toActionErrorMessage(error))
    } finally {
      setBusyMutationId(null)
    }
  }

  return (
    <section
      className={`sync-status-track sync-status-track--${view.tone}`}
      aria-label="同步状态"
      aria-live={view.tone === 'danger' ? 'assertive' : 'polite'}
    >
      <div className="sync-status-track__summary">
        <span className="sync-status-track__mark" aria-hidden="true">
          {view.tone === 'danger' ? '!' : view.tone === 'success' ? '✓' : '↻'}
        </span>
        <div>
          <strong>{view.title}</strong>
          {view.detail ? <span>{view.detail}</span> : null}
          <span>
            {isOnline
              ? '网络可用；AI 生成与来源解析可以使用'
              : '网络离线；AI 生成与来源解析暂不可用'}
          </span>
        </div>
        {view.canRetry && runtime.attentionItems.length === 0 ? (
          <button type="button" onClick={() => void runtime.run()}>
            重试
          </button>
        ) : null}
      </div>

      {runtime.initializationError ? (
        <p className="sync-status-track__error" role="alert">
          {runtime.initializationError}
        </p>
      ) : null}

      {runtime.attentionItems.length > 0 ? (
        <details className="sync-attention" open>
          <summary>查看需要处理的数据（{runtime.attentionItems.length}）</summary>
          <ul>
            {runtime.attentionItems.map((item) => {
              const busy = busyMutationId === item.mutationId
              const itemPreview = visiblePreview?.mutationId === item.mutationId
                ? visiblePreview.value
                : null
              return (
                <li key={item.mutationId}>
                  <div className="sync-attention__copy">
                    <strong>{entityLabel(item.entityType)}</strong>
                    <span>{item.lastErrorMessage || '这条修改需要确认后才能继续。'}</span>
                  </div>
                  {itemPreview ? (
                    <div className="sync-attention__preview">
                      <p>
                        本地目标：{entityLabel(itemPreview.target.entityType)}；
                        关联修改 {itemPreview.relatedMutationIds.length} 条。
                      </p>
                      {itemPreview.cloudCandidates.length > 0 ? (
                        <ul aria-label="云端同类型候选">
                          {itemPreview.cloudCandidates.map((candidate) => (
                            <li key={candidate.id}>
                              <strong>{candidate.label}</strong>
                              <span>
                                更新于 {formatCandidateTime(candidate.updatedAt)}
                                {candidate.deletedAt ? '；云端已删除' : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>当前云端快照没有同类型候选；仍需你明确确认。</p>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleAction('confirm', item.mutationId)}
                      >
                        {busy ? '处理中…' : '确认重新上传'}
                      </button>
                    </div>
                  ) : null}
                  <div className="sync-attention__actions">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleAction('retry', item.mutationId)}
                    >
                      {busy ? '处理中…' : '重试'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleAction('discard', item.mutationId)}
                    >
                      放弃并恢复云端版本
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </details>
      ) : null}
      {actionError ? <p className="sync-status-track__error" role="alert">{actionError}</p> : null}
    </section>
  )
}

function entityLabel(entityType: string) {
  return ({
    bean: '咖啡豆',
    brewLog: '冲煮记录',
    brewTemplate: '冲煮模板',
    userSettings: '个人设置',
  } as Record<string, string>)[entityType] ?? '本地数据'
}

function formatCandidateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '时间待确认' : date.toLocaleString('zh-CN')
}

function toActionErrorMessage(error: unknown) {
  if (error instanceof Error && /not found|changed/i.test(error.message)) {
    return '这条本地修改已发生变化，请重新查看后再操作。'
  }
  return '操作未完成，请稍后再试。'
}
