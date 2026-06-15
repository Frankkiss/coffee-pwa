export type BrewTemplateCategory =
  | 'daily-pourover'
  | 'immersion-hybrid'
  | 'bean-specific'
  | 'cold-brew'
  | 'champion-reference'

export type BrewTemplateDifficulty = 'easy' | 'medium' | 'advanced'

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
}

export type BrewTemplateFilters = {
  brewer: string
  flavor: string
  difficulty: BrewTemplateDifficulty | ''
  includeChampionReferences: boolean
}
