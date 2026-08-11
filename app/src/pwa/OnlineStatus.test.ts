import { describe, expect, it, vi } from 'vitest'
import { buildOnlineStatusText, subscribeToNetworkChanges } from './onlineStatusModel'

describe('buildOnlineStatusText', () => {
  it('keeps network availability secondary to actual sync state', () => {
    expect(buildOnlineStatusText(
      { kind: 'retrying', pendingCount: 1, message: 'waiting' },
      true,
    )).toBe('1 条修改待重试；网络可用，AI 生成与来源解析可以使用')
  })

  it('reports offline tools without claiming synced data is online', () => {
    const text = buildOnlineStatusText(
      { kind: 'synced', lastSyncedAt: '2026-08-11T00:00:00.000Z' },
      false,
    )
    expect(text).toContain('已同步（最后同步：')
    expect(text).toContain('；网络离线，AI 生成与来源解析暂不可用')
  })

  it('subscribes to both online and offline changes and cleans them up', () => {
    const target = new EventTarget()
    const changed = vi.fn()
    const cleanup = subscribeToNetworkChanges(target, changed)
    target.dispatchEvent(new Event('offline'))
    target.dispatchEvent(new Event('online'))
    cleanup()
    target.dispatchEvent(new Event('offline'))
    expect(changed).toHaveBeenCalledTimes(2)
  })
})
