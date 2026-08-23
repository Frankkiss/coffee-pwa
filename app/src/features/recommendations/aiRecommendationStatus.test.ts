import { describe, expect, it } from 'vitest'
import { getAiRecommendationStatusMessage } from './aiRecommendationStatus'
import type { AiRecommendationResponse } from './recommendationTypes'

function response(overrides: Partial<AiRecommendationResponse>): AiRecommendationResponse {
  return {
    configured: true,
    suggestion: null,
    structured: null,
    ...overrides,
  }
}

describe('getAiRecommendationStatusMessage', () => {
  it('distinguishes missing configuration from runtime failures', () => {
    expect(getAiRecommendationStatusMessage(response({ configured: false })))
      .toBe('DeepSeek 未配置，先显示规则推荐。')
    expect(getAiRecommendationStatusMessage(response({ error: 'AI_TIMEOUT' })))
      .toBe('DeepSeek 响应超时，先显示规则推荐。')
    expect(getAiRecommendationStatusMessage(response({ suggestion: '越界原文', error: 'AI_BOUNDARY_VIOLATION' })))
      .toBe('DeepSeek 返回参数超出规则范围，已改用规则方案。')
    expect(getAiRecommendationStatusMessage(response({ error: 'AI_UPSTREAM_ERROR' })))
      .toBe('AI 推荐暂时不可用，先显示规则推荐。')
    expect(getAiRecommendationStatusMessage(response({ error: 'AI_FUNCTION_ERROR' })))
      .toBe('AI 推荐暂时不可用，先显示规则推荐。')
  })

  it('uses a stable fallback for configured responses without usable output', () => {
    expect(getAiRecommendationStatusMessage(response({})))
      .toBe('DeepSeek 未返回可用建议，先显示规则推荐。')
    expect(getAiRecommendationStatusMessage(response({ error: 'PRIVATE DETAIL' })))
      .toBe('AI 推荐暂时不可用，先显示规则推荐。')
  })

  it('returns no status message when a suggestion can be displayed', () => {
    expect(getAiRecommendationStatusMessage(response({ suggestion: '可用建议' })))
      .toBeNull()
  })
})
