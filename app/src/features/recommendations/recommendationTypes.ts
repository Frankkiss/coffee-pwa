import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import type { BrewMode, BrewVariant } from '../brews/brewTypes'
import type { FeedbackAdjustment } from './feedbackAdjustments'
import type { FreshnessAdjustment } from './freshnessRules'

export type RecommendedBrewParameters = {
  method: string | null
  brewMode?: BrewMode
  brewVariant?: BrewVariant | null
  grinder?: string | null
  coffeeGrams?: number | null
  waterGrams?: number | null
  iceGrams?: number | null
  beverageGrams?: number | null
  bloomTimeDeltaSeconds?: number
  dripper: string | null
  grindSetting: string | null
  ratio: string | null
  waterTemperatureC: number | null
  totalTimeSeconds: number | null
}

export type RecommendationConfidence = 'high' | 'medium' | 'low'

export type RecommendationNumericRange = { min: number; max: number }

export type RecommendationAllowedRanges = {
  ratioDenominator: RecommendationNumericRange
  waterTemperatureC: RecommendationNumericRange | null
  coffeeGrams: RecommendationNumericRange
  waterGrams: RecommendationNumericRange | null
  iceGrams: RecommendationNumericRange | null
  beverageGrams: RecommendationNumericRange | null
  totalTimeSeconds: RecommendationNumericRange
}

export type RecommendationSelection = {
  mode: BrewMode
  variant: BrewVariant | null
  brewer: string
  grinder: string
  espressoDoseGrams: number | null
  tasteGoals: string[]
}

export type RecommendationFeedbackSource = {
  brewLogId: string
  rating: number
  notes: string
}

export type RuleRecommendationBaseSource =
  | {
      type: 'history'
      label: string
      brewLogId: string
      templateId?: never
    }
  | {
      type: 'template'
      label: string
      templateId: string
      brewLogId?: never
    }

export type BrewRecommendationCandidate = {
  bean: Bean | null
  brewLog: BrewLog
  score: number
  reasons: string[]
  recommended: RecommendedBrewParameters
}

export type BrewTemplateCandidate = {
  id: string
  name: string
  brewer: string
  ratio: string
  waterTemperature: string
  targetTime: string
  pourSummary: string
  isChampionReference: boolean
  score: number
  reasons: string[]
}

export type RuleRecommendationResult = {
  targetBean: Bean
  primary: BrewRecommendationCandidate | null
  references: BrewRecommendationCandidate[]
  templateCandidates: BrewTemplateCandidate[]
  recommended: RecommendedBrewParameters
  confidence: RecommendationConfidence
  baseSource: RuleRecommendationBaseSource
  beanAdjustmentReasons: string[]
  feedbackAdjustments?: FeedbackAdjustment[]
  feedbackSource?: RecommendationFeedbackSource | null
  freshnessAdjustment?: FreshnessAdjustment
  selection?: RecommendationSelection
  allowedRanges?: RecommendationAllowedRanges
}

export type AiRecommendationResponse = {
  configured: boolean
  suggestion: string | null
  structured: StructuredAiRecommendation | null
  error?: string
}

export type StructuredAiRecipe = {
  method: string | null
  brewMode?: BrewMode | null
  brewVariant?: BrewVariant | null
  dripper: string | null
  grinder?: string | null
  grindSetting: string | null
  waterTemperatureC: number | null
  coffeeGrams: number | null
  waterGrams: number | null
  iceGrams?: number | null
  beverageGrams?: number | null
  ratio: string | null
  totalTimeSeconds: number | null
}

export type StructuredAiStepTarget = 'water' | 'ice' | 'beverage' | 'none'

export type StructuredAiBrewStep = {
  label: string
  time: string
  startSeconds: number | null
  endSeconds: number | null
  targetType: StructuredAiStepTarget
  targetGrams: number | null
  action: string
}

export type StructuredAiRecommendation = {
  summary: string
  recipe: StructuredAiRecipe
  pourPlan: StructuredAiBrewStep[]
  adjustments: string[]
  reasons: string[]
  riskNotes: string[]
  rawText: string
}
