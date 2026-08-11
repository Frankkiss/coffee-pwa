import type {
  BrewTemplate,
  BrewTemplateCategory,
  BrewTemplateDifficulty,
  BrewTemplatePourStep,
  UserBrewTemplatePayload,
  UserBrewTemplateRow,
} from './brewTemplateTypes'
import type { BrewTemplateWriteInput } from './brewTemplateRepository'

export type BrewTemplateForm = {
  name: string
  category: BrewTemplateCategory
  difficulty: BrewTemplateDifficulty
  brewer: string
  filter: string
  doseGrams: number
  waterGrams: number
  ratio: string
  waterTemperatureMin: number
  waterTemperatureMax: number
  grindSize: string
  targetTimeMin: number
  targetTimeMax: number
  pourSteps: BrewTemplatePourStep[]
  suitableForText: string
  avoidForText: string
  flavorGoal: string
  adjustmentRulesText: string
  sourceNotes: string
  sourceUrlsText: string
  isChampionReference: boolean
}

export function createEmptyBrewTemplateForm(): BrewTemplateForm {
  return {
    name: '',
    category: 'daily-pourover',
    difficulty: 'easy',
    brewer: 'V60',
    filter: '',
    doseGrams: 15,
    waterGrams: 240,
    ratio: '1:16',
    waterTemperatureMin: 90,
    waterTemperatureMax: 93,
    grindSize: '中细研磨',
    targetTimeMin: 135,
    targetTimeMax: 165,
    pourSteps: [
      {
        order: 1,
        startSeconds: 0,
        endSeconds: 30,
        targetWaterGrams: 40,
        label: '闷蒸',
        action: '注水到 40g，确保粉层均匀湿润。',
      },
    ],
    suitableForText: '',
    avoidForText: '',
    flavorGoal: '',
    adjustmentRulesText: '',
    sourceNotes: '自定义模板',
    sourceUrlsText: '',
    isChampionReference: false,
  }
}

export function createBrewTemplateFormFromTemplate(
  template: BrewTemplate,
): BrewTemplateForm {
  return {
    name: template.name,
    category: template.category,
    difficulty: template.difficulty,
    brewer: template.brewer,
    filter: template.filter,
    doseGrams: template.doseGrams,
    waterGrams: template.waterGrams,
    ratio: template.ratio,
    waterTemperatureMin: template.waterTemperatureC.min,
    waterTemperatureMax: template.waterTemperatureC.max,
    grindSize: template.grindSize,
    targetTimeMin: template.targetTimeSeconds.min,
    targetTimeMax: template.targetTimeSeconds.max,
    pourSteps: normalizePourSteps(template.pourSteps),
    suitableForText: template.suitableFor.join('、'),
    avoidForText: template.avoidFor.join('、'),
    flavorGoal: template.flavorGoal,
    adjustmentRulesText: template.adjustmentRules.join('\n'),
    sourceNotes: template.sourceNotes,
    sourceUrlsText: template.sourceUrls.join('\n'),
    isChampionReference: template.isChampionReference,
  }
}

export function toBrewTemplateFromRow(row: UserBrewTemplateRow): BrewTemplate {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    difficulty: row.difficulty,
    brewer: row.brewer,
    filter: row.filter,
    doseGrams: Number(row.dose_grams),
    waterGrams: Number(row.water_grams),
    ratio: row.ratio,
    waterTemperatureC: {
      min: Number(row.water_temperature_min),
      max: Number(row.water_temperature_max),
    },
    grindSize: row.grind_size,
    targetTimeSeconds: {
      min: Number(row.target_time_min),
      max: Number(row.target_time_max),
    },
    pourSteps: normalizePourSteps(row.pour_steps),
    suitableFor: row.suitable_for ?? [],
    avoidFor: row.avoid_for ?? [],
    flavorGoal: row.flavor_goal,
    adjustmentRules: row.adjustment_rules ?? [],
    sourceNotes: row.source_notes,
    sourceUrls: row.source_urls ?? [],
    isChampionReference: row.is_champion_reference,
    source: 'user',
    userId: row.user_id,
    copiedFromTemplateId: row.copied_from_template_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toUserBrewTemplatePayload(
  form: BrewTemplateForm,
  userId: string,
  copiedFromTemplateId: string | null = null,
): UserBrewTemplatePayload {
  return {
    user_id: userId,
    name: form.name.trim(),
    category: form.category,
    difficulty: form.difficulty,
    brewer: form.brewer.trim(),
    filter: form.filter.trim(),
    dose_grams: form.doseGrams,
    water_grams: form.waterGrams,
    ratio: form.ratio.trim(),
    water_temperature_min: form.waterTemperatureMin,
    water_temperature_max: form.waterTemperatureMax,
    grind_size: form.grindSize.trim(),
    target_time_min: form.targetTimeMin,
    target_time_max: form.targetTimeMax,
    pour_steps: normalizePourSteps(form.pourSteps),
    suitable_for: splitTextList(form.suitableForText),
    avoid_for: splitTextList(form.avoidForText),
    flavor_goal: form.flavorGoal.trim(),
    adjustment_rules: splitTextList(form.adjustmentRulesText),
    source_notes: form.sourceNotes.trim(),
    source_urls: splitTextList(form.sourceUrlsText),
    is_champion_reference: form.isChampionReference,
    copied_from_template_id: copiedFromTemplateId,
  }
}

export function toBrewTemplateWriteInput(
  form: BrewTemplateForm,
  copiedFromTemplateId: string | null = null,
): BrewTemplateWriteInput {
  const payload = toUserBrewTemplatePayload(form, '', copiedFromTemplateId)
  const { user_id: _ownership, ...input } = payload
  void _ownership
  return input
}

export function splitTextList(text: string) {
  return text
    .split(/[\n,，、/]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function normalizePourSteps(
  steps: BrewTemplatePourStep[],
): BrewTemplatePourStep[] {
  return steps
    .map((step, index) => ({
      order: index + 1,
      startSeconds: Math.max(0, Number(step.startSeconds) || 0),
      endSeconds:
        step.endSeconds === null || step.endSeconds === undefined
          ? null
          : Math.max(0, Number(step.endSeconds) || 0),
      targetWaterGrams: Math.max(0, Number(step.targetWaterGrams) || 0),
      label: step.label.trim() || `第 ${index + 1} 段`,
      action: step.action.trim(),
    }))
    .sort((left, right) => left.order - right.order)
}

export function applyUserTemplateOverrides(
  systemTemplates: BrewTemplate[],
  userTemplates: BrewTemplate[],
): BrewTemplate[] {
  const replacementBySourceId = new Map<string, BrewTemplate>()
  const originalUserTemplates: BrewTemplate[] = []

  for (const template of userTemplates) {
    if (template.copiedFromTemplateId) {
      if (!replacementBySourceId.has(template.copiedFromTemplateId)) {
        replacementBySourceId.set(template.copiedFromTemplateId, template)
      }
      continue
    }

    originalUserTemplates.push(template)
  }

  return [
    ...systemTemplates.map((template) => replacementBySourceId.get(template.id) ?? template),
    ...originalUserTemplates,
  ]
}
