import { useEffect, useState } from 'react'
import { toSyncStatusView } from './syncStatusModel'
import { useSyncRuntime } from './SyncContext'
import {
  attentionCollectionKey,
  attentionItemKey,
  buildLegacyComparison,
  createAttentionActionGuard,
  toSafeActionError,
  toSafeAttentionItem,
} from './syncAttentionModel'
import {
  runGuardedAttentionAction,
  type AttentionAction,
  type AttentionActions,
} from './syncStatusActions'
import { subscribeToNetworkChanges } from '../../pwa/onlineStatusModel'
import type { SyncMutation } from './syncTypes'
import './syncStatus.css'

export function SyncStatusBanner() {
  const runtime = useSyncRuntime()
  const view = toSyncStatusView(runtime.state)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)

  useEffect(() => subscribeToNetworkChanges(
    window,
    () => setIsOnline(navigator.onLine),
  ), [])

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

      {runtime.state.kind !== 'protection' && runtime.attentionItems.length > 0 ? (
        <AttentionList
          key={attentionCollectionKey(runtime.attentionItems)}
          attentionItems={runtime.attentionItems}
          actions={runtime}
        />
      ) : null}
    </section>
  )
}

function AttentionList({
  attentionItems,
  actions,
}: {
  attentionItems: SyncMutation[]
  actions: AttentionActions
}) {
  const [guard] = useState(() => createAttentionActionGuard())
  const [busyItemKey, setBusyItemKey] = useState<string | null>(null)
  const [preview, setPreview] = useState<{
    itemKey: string
    comparison: ReturnType<typeof buildLegacyComparison>
  } | null>(null)
  const [actionError, setActionError] = useState<ReturnType<typeof toSafeActionError> | null>(null)

  useEffect(() => () => guard.stop(), [guard])

  function handleAction(action: AttentionAction, item: SyncMutation) {
    const itemKey = attentionItemKey(item)
    setBusyItemKey(itemKey)
    setActionError(null)
    setPreview(null)
    void runGuardedAttentionAction({
      guard,
      itemKey,
      action,
      mutationId: item.mutationId,
      actions,
      onResult: (result) => {
        if (result?.status === 'confirmation_required') {
          setPreview({
            itemKey,
            comparison: buildLegacyComparison(result.preview, attentionItems),
          })
        }
      },
      onError: (error) => setActionError(toSafeActionError(error)),
      onSettled: () => setBusyItemKey(null),
    })
  }

  return (
    <details className="sync-attention" open>
      <summary>查看需要处理的数据（{attentionItems.length}）</summary>
      <ul>
        {attentionItems.map((item) => {
          const itemKey = attentionItemKey(item)
          const safeItem = toSafeAttentionItem(item)
          const busy = busyItemKey === itemKey
          const comparison = preview?.itemKey === itemKey
            ? preview.comparison
            : null
          return (
            <li key={itemKey}>
              <div className="sync-attention__copy">
                <strong>{safeItem.title}</strong>
                <span>{safeItem.errorText}</span>
                {safeItem.errorCode ? <code>错误代码：{safeItem.errorCode}</code> : null}
              </div>
              {safeItem.localSummary ? (
                <SafeSummary summary={safeItem.localSummary} />
              ) : null}
              {comparison ? (
                <div className="sync-attention__preview">
                  <strong>本地待上传数据</strong>
                  {comparison.localTargets.map((summary, index) => (
                    <SafeSummary key={`${summary.title}:${index}`} summary={summary} />
                  ))}
                  {comparison.cloudCandidates.length > 0 ? (
                    <ul aria-label="云端同类型候选">
                      {comparison.cloudCandidates.map((candidate, index) => (
                        <li key={`${candidate.label}:${index}`}>
                          <strong>{candidate.label}</strong>
                          <span>
                            更新于 {formatCandidateTime(candidate.updatedAt)}
                            {candidate.deleted ? '；云端已删除' : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>当前云端快照没有同类型候选。</p>
                  )}
                  {comparison.canConfirm ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleAction('confirm', item)}
                    >
                      {busy ? '处理中…' : '确认重新上传'}
                    </button>
                  ) : (
                    <p className="sync-attention__blocked">{comparison.blockedReason}</p>
                  )}
                </div>
              ) : null}
              <div className="sync-attention__actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleAction('retry', item)}
                >
                  {busy ? '处理中…' : '重试'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleAction('discard', item)}
                >
                  放弃并恢复云端版本
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      {actionError ? (
        <p className="sync-status-track__error" role="alert">
          {actionError.text}
          {actionError.code ? <code>错误代码：{actionError.code}</code> : null}
        </p>
      ) : null}
    </details>
  )
}

function SafeSummary({
  summary,
}: {
  summary: NonNullable<ReturnType<typeof toSafeAttentionItem>['localSummary']>
}) {
  return (
    <div className="sync-attention__local-summary">
      <strong>{summary.title}</strong>
      {summary.facts.length > 0 ? <span>{summary.facts.join(' · ')}</span> : null}
    </div>
  )
}

function formatCandidateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '时间待确认' : date.toLocaleString('zh-CN')
}
