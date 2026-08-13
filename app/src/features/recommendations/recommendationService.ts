import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertSyncWritesEnabled,
  type EffectiveSyncMode,
} from '../sync/syncFeatureFlag'
import type { createBeanRepository } from '../beans/beanRepository'
import type { createBrewLogRepository } from '../brews/brewLogRepository'
import type { createBrewTemplateRepository } from '../brewTemplates/brewTemplateRepository'
import { toBrewTemplateFromRow } from '../brewTemplates/brewTemplateModel'
import { brewTemplates } from '../brewTemplates/brewTemplates'
import type {
  AiRecommendationResponse,
  RuleRecommendationResult,
} from './recommendationTypes'
import { generateRuleRecommendation } from './ruleRecommendation'
import type { SavedRecommendationPayload } from './savedRecommendation'
import { normalizeAiRecommendationResponse } from './structuredAiRecommendation'

type RuleRecommendationRepositories = {
  beans: Pick<ReturnType<typeof createBeanRepository>, 'listBeans'>
  brewLogs: Pick<ReturnType<typeof createBrewLogRepository>, 'listBrewLogs'>
  brewTemplates: Pick<ReturnType<typeof createBrewTemplateRepository>, 'listBrewTemplates'>
}

export async function loadRuleRecommendationData(repositories: RuleRecommendationRepositories) {
  const [beans, brewLogs, userTemplates] = await Promise.all([
    repositories.beans.listBeans(),
    repositories.brewLogs.listBrewLogs(),
    repositories.brewTemplates.listBrewTemplates(),
  ])

  return {
    beans,
    brewLogs,
    templates: [
      ...brewTemplates,
      ...userTemplates.map(toBrewTemplateFromRow),
    ],
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
      finalRuleRecommendation: recommendation.recommended,
      confidence: recommendation.confidence,
      baseSource: recommendation.baseSource,
      beanAdjustmentReasons: recommendation.beanAdjustmentReasons,
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
  syncMode: EffectiveSyncMode = 'enabled',
) {
  assertSyncWritesEnabled(syncMode)
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

export async function updateSavedRecommendationAccepted(
  supabase: SupabaseClient,
  id: string,
  accepted: boolean,
  syncMode: EffectiveSyncMode = 'enabled',
) {
  assertSyncWritesEnabled(syncMode)
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
  syncMode: EffectiveSyncMode = 'enabled',
) {
  assertSyncWritesEnabled(syncMode)
  const { error } = await supabase
    .from('ai_recommendations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    throw new Error(error.message)
  }
}
