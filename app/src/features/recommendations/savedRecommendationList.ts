import type { JsonObject } from '../../lib/jsonTypes'

export type SavedRecommendationRow = {
  id: string
  user_id: string
  bean_id: string | null
  input_context: JsonObject
  recommendation: JsonObject
  model_name: string | null
  accepted: boolean | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  schema_version: number
}

export type SavedRecommendationDisplayRow = Pick<
  SavedRecommendationRow,
  | 'id'
  | 'bean_id'
  | 'input_context'
  | 'recommendation'
  | 'model_name'
  | 'accepted'
  | 'created_at'
>

export type SavedRecommendationCard = {
  id: string
  targetName: string
  createdAtLabel: string
  parameterSummary: string
  aiSummary: string
  aiDetail: string
  structuredSummary: string
  structuredRecipeSummary: string
  pourPlan: string[]
  aiAdjustments: string[]
  aiReasons: string[]
  aiRiskNotes: string[]
  ruleReasons: string[]
  templateNames: string[]
  modelName: string | null
  accepted: boolean
  acceptedLabel: string
}

const maxSummaryLength = 120

export function toSavedRecommendationCards(rows: SavedRecommendationDisplayRow[]) {
  return [...rows]
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .map(toSavedRecommendationCard)
}

export function toSavedRecommendationCard(
  row: SavedRecommendationDisplayRow,
): SavedRecommendationCard {
  return {
    id: row.id,
    targetName: getTargetName(row),
    createdAtLabel: formatShortDate(row.created_at),
    parameterSummary: getParameterSummary(row),
    aiSummary: getAiSummary(row),
    aiDetail: getAiDetail(row),
    structuredSummary: getStructuredSummary(row),
    structuredRecipeSummary: getStructuredRecipeSummary(row),
    pourPlan: getStructuredPourPlan(row),
    aiAdjustments: getNestedStringArray(row.recommendation, ['ai', 'structured', 'adjustments']),
    aiReasons: getNestedStringArray(row.recommendation, ['ai', 'structured', 'reasons']),
    aiRiskNotes: getNestedStringArray(row.recommendation, ['ai', 'structured', 'riskNotes']),
    ruleReasons: getRuleReasons(row),
    templateNames: getTemplateNames(row),
    modelName: row.model_name,
    accepted: row.accepted === true,
    acceptedLabel: row.accepted === true ? '已采纳' : '未采纳',
  }
}

function getTargetName(row: SavedRecommendationDisplayRow) {
  const targetName = getNestedString(row.input_context, [
    'targetBean',
    'name',
  ])

  return targetName || row.bean_id || '未知咖啡豆'
}

function getParameterSummary(row: SavedRecommendationDisplayRow) {
  const recommended = getNestedRecord(row.recommendation, [
    'rule',
    'recommended',
  ])

  if (!recommended) {
    return '参数待补充'
  }

  return (
    [
      getString(recommended.method),
      getString(recommended.dripper),
      getString(recommended.ratio),
      typeof recommended.waterTemperatureC === 'number'
        ? `${recommended.waterTemperatureC}°C`
        : null,
      typeof recommended.totalTimeSeconds === 'number'
        ? `${recommended.totalTimeSeconds}s`
        : null,
      getString(recommended.grindSetting),
    ]
      .filter(Boolean)
      .join(' / ') || '参数待补充'
  )
}

function getAiSummary(row: SavedRecommendationDisplayRow) {
  const suggestion = getAiDetail(row)

  if (!suggestion) {
    return '仅保存了规则推荐。'
  }

  return suggestion.length > maxSummaryLength
    ? `${suggestion.slice(0, maxSummaryLength)}...`
    : suggestion
}

function getAiDetail(row: SavedRecommendationDisplayRow) {
  return (
    getNestedString(row.recommendation, ['ai', 'structured', 'rawText']) ??
    getNestedString(row.recommendation, ['ai', 'suggestion']) ??
    ''
  )
}

function getStructuredSummary(row: SavedRecommendationDisplayRow) {
  return getNestedString(row.recommendation, ['ai', 'structured', 'summary']) ?? ''
}

function getStructuredRecipeSummary(row: SavedRecommendationDisplayRow) {
  const recipe = getNestedRecord(row.recommendation, ['ai', 'structured', 'recipe'])

  if (!recipe) {
    return ''
  }

  return formatRecipeSummary(recipe)
}

function getStructuredPourPlan(row: SavedRecommendationDisplayRow) {
  return getNestedArray(row.recommendation, ['ai', 'structured', 'pourPlan'])
    .map(formatPourStep)
    .filter((line): line is string => Boolean(line))
}

function getRuleReasons(row: SavedRecommendationDisplayRow) {
  return getNestedStringArray(row.recommendation, ['rule', 'reasons'])
}

function getTemplateNames(row: SavedRecommendationDisplayRow) {
  const candidates = getNestedArray(row.recommendation, ['rule', 'templateCandidates'])

  return candidates
    .map((candidate) => getString(isRecord(candidate) ? candidate.name : null))
    .filter((name): name is string => Boolean(name))
}

function formatShortDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '日期待确认'
  }

  return `${date.getMonth() + 1}/${date.getDate()}`
}

function getNestedRecord(value: unknown, path: string[]): Record<string, unknown> | null {
  let current = value

  for (const key of path) {
    if (!isRecord(current)) {
      return null
    }
    current = current[key]
  }

  return isRecord(current) ? current : null
}

function getNestedString(value: unknown, path: string[]) {
  const leaf = path.reduce<unknown>((current, key) => {
    if (!isRecord(current)) {
      return null
    }
    return current[key]
  }, value)

  return getString(leaf)
}

function getNestedArray(value: unknown, path: string[]) {
  const leaf = path.reduce<unknown>((current, key) => {
    if (!isRecord(current)) {
      return null
    }
    return current[key]
  }, value)

  return Array.isArray(leaf) ? leaf : []
}

function getNestedStringArray(value: unknown, path: string[]) {
  return getNestedArray(value, path)
    .map(getString)
    .filter((item): item is string => Boolean(item))
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function formatRecipeSummary(recipe: Record<string, unknown>) {
  return (
    [
      getString(recipe.method),
      getString(recipe.dripper),
      getString(recipe.ratio),
      getNumber(recipe.waterTemperatureC) !== null ? `${recipe.waterTemperatureC}°C` : null,
      getNumber(recipe.totalTimeSeconds) !== null ? `${recipe.totalTimeSeconds}s` : null,
      getString(recipe.grindSetting),
    ]
      .filter(Boolean)
      .join(' / ') || ''
  )
}

function formatPourStep(step: unknown) {
  if (!isRecord(step)) {
    return null
  }

  const label = getString(step.label) ?? '分段'
  const targetGrams = getNumber(step.targetGrams) ?? getNumber(step.waterGrams)
  const targetType = getString(step.targetType)
    ?? (getNumber(step.waterGrams) !== null ? 'water' : null)
  const targetLabel = targetType === 'ice' ? '冰量'
    : targetType === 'beverage' ? '出液'
    : targetType === 'water' ? '水量'
    : null
  const amount = targetLabel && targetGrams !== null ? `${targetLabel} ${targetGrams}g` : null
  const parts = [
    getString(step.time),
    amount,
    getString(step.action),
  ].filter(Boolean)

  return parts.length > 0 ? `${label}：${parts.join(' / ')}` : null
}
