import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'

export type RecommendedBrewParameters = {
  method: string | null
  dripper: string | null
  grindSetting: string | null
  ratio: string | null
  waterTemperatureC: number | null
  totalTimeSeconds: number | null
}

export type BrewRecommendationCandidate = {
  bean: Bean | null
  brewLog: BrewLog
  score: number
  reasons: string[]
  recommended: RecommendedBrewParameters
}

export type RuleRecommendationResult = {
  targetBean: Bean
  primary: BrewRecommendationCandidate
  references: BrewRecommendationCandidate[]
}

export type AiRecommendationResponse = {
  configured: boolean
  suggestion: string | null
  error?: string
}
