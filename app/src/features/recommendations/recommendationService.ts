import type { SupabaseClient } from '@supabase/supabase-js'
import { listBeans } from '../beans/beanService'
import { listBrewLogs } from '../brews/brewLogService'
import { brewTemplates } from '../brewTemplates/brewTemplates'
import { listUserBrewTemplates } from '../brewTemplates/brewTemplateService'
import type {
  AiRecommendationResponse,
  RuleRecommendationResult,
} from './recommendationTypes'
import { generateRuleRecommendation } from './ruleRecommendation'
import type { SavedRecommendationPayload } from './savedRecommendation'
import type { SavedRecommendationRow } from './savedRecommendationList'
import { normalizeAiRecommendationResponse } from './structuredAiRecommendation'

export async function loadRuleRecommendationData(supabase: SupabaseClient) {
  const [beans, brewLogs, userTemplates] = await Promise.all([
    listBeans(supabase),
    listBrewLogs(supabase),
    listUserBrewTemplates(supabase),
  ])

  return {
    beans,
    brewLogs,
    templates: [...brewTemplates, ...userTemplates],
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

  return generateRuleRecommendation(targetBean, data.beans, data.brewLogs, data.templates)
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
      templateCandidates: recommendation.templateCandidates,
    },
  })

  if (error) {
    return {
      configured: false,
      suggestion: null,
      structured: null,
      error: error.message,
    }
  }

  return normalizeAiRecommendationResponse(data)
}

export async function saveRecommendation(
  supabase: SupabaseClient,
  payload: SavedRecommendationPayload,
) {
  const { data, error } = await supabase
    .from('ai_recommendations')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function listSavedRecommendations(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('ai_recommendations')
    .select(
      'id, bean_id, input_context, recommendation, model_name, accepted, created_at',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as SavedRecommendationRow[]
}

export async function updateSavedRecommendationAccepted(
  supabase: SupabaseClient,
  id: string,
  accepted: boolean,
) {
  const { error } = await supabase
    .from('ai_recommendations')
    .update({ accepted })
    .eq('id', id)

  if (error) {
    throw new Error(error.message)
  }
}

export async function softDeleteSavedRecommendation(
  supabase: SupabaseClient,
  id: string,
) {
  const { error } = await supabase
    .from('ai_recommendations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    throw new Error(error.message)
  }
}
