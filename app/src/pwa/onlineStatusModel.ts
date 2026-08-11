import { toSyncStatusView } from '../features/sync/syncStatusModel'
import type { SyncState } from '../features/sync/syncTypes'

export function buildOnlineStatusText(syncState: SyncState, isOnline: boolean) {
  const syncView = toSyncStatusView(syncState)
  const syncText = syncView.detail
    ? `${syncView.title}（${syncView.detail}）`
    : syncView.title
  const networkText = isOnline
    ? '网络可用，AI 生成与来源解析可以使用'
    : '网络离线，AI 生成与来源解析暂不可用'
  return `${syncText}；${networkText}`
}

export function subscribeToNetworkChanges(
  target: EventTarget,
  changed: () => void,
) {
  target.addEventListener('online', changed)
  target.addEventListener('offline', changed)
  return () => {
    target.removeEventListener('online', changed)
    target.removeEventListener('offline', changed)
  }
}
