import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SyncedStatus } from './SyncStatusBanner'

describe('SyncedStatus', () => {
  it('keeps the successful state compact while preserving details', () => {
    const markup = renderToStaticMarkup(
      <SyncedStatus
        detail="最后同步：2026/08/23 15:25"
        isOnline
      />,
    )

    expect(markup).toContain('<details')
    expect(markup).toContain('<summary')
    expect(markup).toContain('✓ 已同步 · 15:25')
    expect(markup).toContain('最后同步：2026/08/23 15:25')
    expect(markup).toContain('网络可用；AI 生成与来源解析可以使用')
  })
})
