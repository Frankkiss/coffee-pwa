import type { SupabaseClient } from '@supabase/supabase-js'
import { listBeans } from '../beans/beanService'
import { listBrewLogs } from '../brews/brewLogService'
import type {
  AiRecommendationResponse,
  RuleRecommendationResult,
} from './recommendationTypes'
import { generateRuleRecommendation } from './ruleRecommendation'

export async function loadRuleRecommendationData(supabase: SupabaseClient) {
  const [beans, brewLogs] = await Promise.all([
    listBeans(supabase),
    listBrewLogs(supabase),
  ])

  return {
    beans,
    brewLogs,
  }
}

export function createRecommendationForBean(
  beanId: string,
  data: Awaited<ReturnType<typeof loadRuleRecommendationData>>,
) {
  const targetBean = data.beans.find((bean) => bean.id === beanId)

  if (!targetBean) {
    return null
  }

  return generateRuleRecommendation(targetBean, data.beans, data.brewLogs)
}

export async function requestAiRecommendation(
  supabase: SupabaseClient,
  recommendation: RuleRecommendationResult,
): Promise<AiRecommendationResponse> {
  const { data, error } = await supabase.functions.invoke('recommend-brew', {
    body: {
      targetBean: recommendation.targetBean,
      primaryRecommendation: recommendation.primary,
      references: recommendation.references,
    },
  })

  if (error) {
    return {
      configured: false,
      suggestion: null,
      error: error.message,
    }
  }

  return data as AiRecommendationResponse
}
