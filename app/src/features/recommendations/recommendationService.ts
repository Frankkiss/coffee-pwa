import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertSyncWritesEnabled,
  type EffectiveSyncMode,
} from '../sync/syncFeatureFlag'
import type { createUserSettingsRepository } from '../settings/userSettingsRepository'
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
import { buildAiRecommendationContext } from './aiRecommendationContext'
import { normalizeAiRecommendationResponse } from './structuredAiRecommendation'

type RuleRecommendationRepositories = {
  beans: Pick<ReturnType<typeof createBeanRepository>, 'listBeans'>
  brewLogs: Pick<ReturnType<typeof createBrewLogRepository>, 'listBrewLogs'>
  userSettings?: Pick<ReturnType<typeof createUserSettingsRepository>, 'getUserSettings'>
  brewTemplates: Pick<ReturnType<typeof createBrewTemplateRepository>, 'listBrewTemplates'>
}

export async function loadRuleRecommendationData(repositories: RuleRecommendationRepositories) {
  const [beans, brewLogs, userTemplates, settings] = await Promise.all([
    repositories.beans.listBeans(),
    repositories.brewLogs.listBrewLogs(),
    repositories.brewTemplates.listBrewTemplates(),
    repositories.userSettings?.getUserSettings() ?? Promise.resolve(null),
  ])

  return {
    beans,
    brewLogs,
    templates: [
      ...brewTemplates,
      ...userTemplates.map(toBrewTemplateFromRow),
    ],
    settings,
  }
}

export function createRecommendationForContext(
  context: import('./recommendationContext').RecommendationContext,
  data: Awaited<ReturnType<typeof loadRuleRecommendationData>>,
) {
  return generateRuleRecommendation(context, data.beans, data.brewLogs, data.templates)
}

export async function requestAiRecommendation(
  supabase: SupabaseClient,
  recommendation: RuleRecommendationResult,
): Promise<AiRecommendationResponse> {
  const context = buildAiRecommendationContext(recommendation)
  const { data, error } = await supabase.functions.invoke('recommend-brew', { body: context })

  if (error) {
    return {
      configured: true,
      suggestion: null,
      structured: null,
      error: 'AI_FUNCTION_ERROR',
    }
  }

  return normalizeAiRecommendationResponse(data, context)
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
