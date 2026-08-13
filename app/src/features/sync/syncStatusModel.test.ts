import { describe, expect, it } from 'vitest'
import { toSyncStatusView } from './syncStatusModel'

describe('toSyncStatusView', () => {
  it('describes protection mode without claiming synchronization or offering writes', () => {
    const view = toSyncStatusView({ kind: 'protection' })
    expect(view).toEqual({
      tone: 'warning',
      title: '同步写入已暂停',
      detail: '现有本地和云端数据仍可查看与导出，请等待恢复通知。',
      canRetry: false,
    })
    expect(JSON.stringify(view)).not.toContain('已同步')
  })

  it('describes offline pending work without offering an unavailable retry', () => {
    expect(toSyncStatusView({ kind: 'offline', pendingCount: 2 })).toEqual({
      tone: 'warning',
      title: '离线，2 条修改待同步',
      canRetry: false,
    })
  })

  it('gives attention precedence over pending work', () => {
    expect(
      toSyncStatusView({
        kind: 'needs_attention',
        pendingCount: 1,
        attentionCount: 1,
      }),
    ).toEqual({
      tone: 'danger',
      title: '1 条数据需要处理',
      canRetry: true,
    })
  })

  it.each([
    [{ kind: 'synced', lastSyncedAt: '2026-08-11T00:00:00.000Z' } as const, '已同步', 'success', false, 'last-synced'],
    [{ kind: 'syncing', pendingCount: 0 } as const, '正在检查云端数据', 'neutral', false, undefined],
    [{ kind: 'syncing', pendingCount: 3 } as const, '正在同步 3 条修改', 'neutral', false, undefined],
    [{ kind: 'retrying', pendingCount: 0, message: '稍后重试' } as const, '同步暂未完成，正在重试', 'warning', true, undefined],
    [{ kind: 'retrying', pendingCount: 2, message: '稍后重试' } as const, '2 条修改待重试', 'warning', true, undefined],
    [{ kind: 'offline', pendingCount: 0 } as const, '当前离线', 'warning', false, undefined],
    [{ kind: 'needs_attention', pendingCount: 2, attentionCount: 3 } as const, '3 条数据需要处理', 'danger', true, undefined],
  ])('maps %o to user-facing status', (state, title, tone, canRetry, detail) => {
    const result = toSyncStatusView(state)
    if (detail === 'last-synced') {
      expect(result).toMatchObject({ title, tone, canRetry })
      expect(result.detail).toMatch(/^最后同步：/)
      expect(result.detail).not.toContain('时间待确认')
    } else {
      expect(result).toEqual({ title, tone, canRetry })
    }
  })
})
