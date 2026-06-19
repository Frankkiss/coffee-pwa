import type {
  AiRecommendationResponse,
  RuleRecommendationResult,
} from './recommendationTypes'

export type SavedRecommendationPayload = {
  user_id: string
  bean_id: string
  input_context: Record<string, unknown>
  recommendation: Record<string, unknown>
  model_name: string | null
  accepted: boolean
}

type BuildSavedRecommendationPayloadInput = {
  userId: string
  ruleRecommendation: RuleRecommendationResult
  aiRecommendation: AiRecommendationResponse | null
}

export const deepSeekRecommendationModel = 'deepseek-v4-pro'

export function buildSavedRecommendationPayload({
  userId,
  ruleRecommendation,
  aiRecommendation,
}: BuildSavedRecommendationPayloadInput): SavedRecommendationPayload {
  const recommended = ruleRecommendation.recommended ?? ruleRecommendation.primary?.recommended ?? null
  const confidence = ruleRecommendation.confidence ?? 'medium'
  const baseSource = ruleRecommendation.baseSource ?? (ruleRecommendation.primary
    ? { type: 'history' as const, label: ruleRecommendation.primary.bean?.name ?? ruleRecommendation.primary.brewLog.id, brewLogId: ruleRecommendation.primary.brewLog.id }
    : null)
  const beanAdjustmentReasons = ruleRecommendation.beanAdjustmentReasons ?? []

  return {
    user_id: userId,
    bean_id: ruleRecommendation.targetBean.id,
    input_context: {
      targetBean: summarizeBean(ruleRecommendation.targetBean),
      primaryBrewLogId: ruleRecommendation.primary?.brewLog.id ?? null,
      baseSource,
      confidence,
      referenceBrewLogIds: ruleRecommendation.references.map(
        (candidate) => candidate.brewLog.id,
      ),
      referenceBeans: ruleRecommendation.references.map((candidate) =>
        candidate.bean ? summarizeBean(candidate.bean) : null,
      ),
      templateCandidates: ruleRecommendation.templateCandidates,
    },
    recommendation: {
      type: 'brew_recommendation',
      source: aiRecommendation?.configured && aiRecommendation.suggestion
        ? 'rule_plus_ai'
        : 'rule_only',
      rule: {
        recommended,
        score: ruleRecommendation.primary?.score ?? null,
        reasons: ruleRecommendation.primary?.reasons ?? [],
        confidence,
        baseSource,
        beanAdjustmentReasons,
        templateCandidates: ruleRecommendation.templateCandidates,
      },
      ai: {
        configured: aiRecommendation?.configured ?? false,
        suggestion: aiRecommendation?.suggestion ?? null,
        structured: aiRecommendation?.structured ?? null,
        error: aiRecommendation?.error ?? null,
      },
    },
    model_name: aiRecommendation?.configured ? deepSeekRecommendationModel : null,
    accepted: false,
  }
}

function summarizeBean(bean: RuleRecommendationResult['targetBean']) {
  return {
    id: bean.id,
    name: bean.name,
    origin: bean.origin,
    process: bean.process,
    variety: bean.variety,
    farmOrStation: bean.farm_or_station,
    altitudeMeters: bean.altitude_meters,
    roastLevel: bean.roast_level,
    flavorTags: bean.flavor_tags,
  }
}