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
  primary: BrewRecommendationCandidate
  references: BrewRecommendationCandidate[]
  templateCandidates: BrewTemplateCandidate[]
}

export type AiRecommendationResponse = {
  configured: boolean
  suggestion: string | null
  error?: string
}
