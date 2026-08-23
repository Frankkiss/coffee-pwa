import type { AiRecommendationResponse } from './recommendationTypes'

export function getAiRecommendationStatusMessage(
  response: AiRecommendationResponse,
) {
  if (response.structured) return null
  if (response.error === 'AI_BOUNDARY_VIOLATION') return 'DeepSeek 返回参数超出规则范围，已改用规则方案。'
  if (!response.configured) {
    return 'DeepSeek 未配置，先显示规则推荐。'
  }
  if (response.error === 'AI_TIMEOUT') {
    return 'DeepSeek 响应超时，先显示规则推荐。'
  }
  if (response.suggestion) return null
  if (response.error) {
    return 'AI 推荐暂时不可用，先显示规则推荐。'
  }
  return 'DeepSeek 未返回可用建议，先显示规则推荐。'
}
