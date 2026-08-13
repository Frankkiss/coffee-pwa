import type { SyncState } from './syncTypes'

export type SyncStatusView = {
  tone: 'success' | 'neutral' | 'warning' | 'danger'
  title: string
  canRetry: boolean
  detail?: string
}

export function toSyncStatusView(state: SyncState): SyncStatusView {
  switch (state.kind) {
    case 'protection':
      return {
        tone: 'warning',
        title: '同步写入已暂停。现有本地和云端数据仍可查看与导出，请等待恢复通知。',
        canRetry: false,
      }
    case 'synced':
      return {
        tone: 'success',
        title: '已同步',
        canRetry: false,
        detail: `最后同步：${formatLastSyncedAt(state.lastSyncedAt)}`,
      }
    case 'syncing':
      return {
        tone: 'neutral',
        title: state.pendingCount > 0
          ? `正在同步 ${state.pendingCount} 条修改`
          : '正在检查云端数据',
        canRetry: false,
      }
    case 'offline':
      return {
        tone: 'warning',
        title: state.pendingCount > 0
          ? `离线，${state.pendingCount} 条修改待同步`
          : '当前离线',
        canRetry: false,
      }
    case 'retrying':
      return {
        tone: 'warning',
        title: state.pendingCount > 0
          ? `${state.pendingCount} 条修改待重试`
          : '同步暂未完成，正在重试',
        canRetry: true,
      }
    case 'needs_attention':
      return {
        tone: 'danger',
        title: `${state.attentionCount} 条数据需要处理`,
        canRetry: true,
      }
  }
}

function formatLastSyncedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间待确认'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}
