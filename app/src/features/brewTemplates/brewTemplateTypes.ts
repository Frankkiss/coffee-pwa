export type BrewTemplateCategory =
  | 'daily-pourover'
  | 'immersion-hybrid'
  | 'bean-specific'
  | 'cold-brew'
  | 'moka-pot'
  | 'champion-reference'

export type BrewTemplateDifficulty = 'easy' | 'medium' | 'advanced'
export type BrewTemplateSource = 'system' | 'user'

export type BrewTemplatePourStep = {
  order: number
  startSeconds: number
  endSeconds: number | null
  targetWaterGrams: number
  label: string
  action: string
}

export type BrewTemplate = {
  id: string
  name: string
  category: BrewTemplateCategory
  difficulty: BrewTemplateDifficulty
  brewer: string
  filter: string
  doseGrams: number
  waterGrams: number
  iceGrams?: number
  ratio: string
  waterTemperatureC: {
    min: number
    max: number
  }
  grindSize: string
  targetTimeSeconds: {
    min: number
    max: number
  }
  pourSteps: BrewTemplatePourStep[]
  suitableFor: string[]
  avoidFor: string[]
  flavorGoal: string
  adjustmentRules: string[]
  sourceNotes: string
  sourceUrls: string[]
  isChampionReference: boolean
  brewMode?: BrewMode
  brewVariant?: BrewVariant | null
  source?: BrewTemplateSource
  userId?: string
  copiedFromTemplateId?: string | null
  createdAt?: string
  updatedAt?: string
}

export type BrewTemplateModeFilter = '' | BrewMode | 'cold_brew_ready_to_drink' | 'cold_brew_concentrate'

export type BrewTemplateFilters = { mode: BrewTemplateModeFilter }

/**
 * A complete template row after server-response validation.
 * Never cast raw RPC data directly to this type.
 */
export type UserBrewTemplateRow = {
  id: string
  user_id: string
  name: string
  category: BrewTemplateCategory
  difficulty: BrewTemplateDifficulty
  brewer: string
  filter: string
  dose_grams: number
  water_grams: number
  ratio: string
  water_temperature_min: number
  water_temperature_max: number
  grind_size: string
  target_time_min: number
  target_time_max: number
  pour_steps: BrewTemplatePourStep[]
  suitable_for: string[]
  avoid_for: string[]
  flavor_goal: string
  adjustment_rules: string[]
  source_notes: string
  source_urls: string[]
  is_champion_reference: boolean
  copied_from_template_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  schema_version: number
}

export type UserBrewTemplatePayload = Omit<
  UserBrewTemplateRow,
  'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'schema_version'
>
import type { BrewMode, BrewVariant } from '../brews/brewTypes'
