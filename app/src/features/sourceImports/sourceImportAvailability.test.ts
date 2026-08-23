import { describe, expect, it } from 'vitest'
import { getSourceImportAvailability } from './sourceImportAvailability'

describe('source import availability', () => {
  it('keeps source parsing online-only with an actionable offline explanation', () => {
    expect(getSourceImportAvailability(false)).toEqual({
      enabled: false,
      message: '当前离线：图片和文字的 AI 解析需要联网；已选择内容会保留。',
    })
    expect(getSourceImportAvailability(true)).toEqual({ enabled: true, message: '' })
  })
})
