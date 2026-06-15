export type SavedRecommendationRow = {
  id: string
  bean_id: string | null
  input_context: unknown
  recommendation: unknown
  model_name: string | null
  accepted: boolean | null
  created_at: string
}

export type SavedRecommendationCard = {
  id: string
  targetName: string
  createdAtLabel: string
  parameterSummary: string
  aiSummary: string
  aiDetail: string
  ruleReasons: string[]
  templateNames: string[]
  modelName: string | null
  accepted: boolean
  acceptedLabel: string
}

const maxSummaryLength = 120

export function toSavedRecommendationCards(rows: SavedRecommendationRow[]) {
  return [...rows]
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .map(toSavedRecommendationCard)
}

export function toSavedRecommendationCard(row: SavedRecommendationRow): SavedRecommendationCard {
  return {
    id: row.id,
    targetName: getTargetName(row),
    createdAtLabel: formatShortDate(row.created_at),
    parameterSummary: getParameterSummary(row),
    aiSummary: getAiSummary(row),
    aiDetail: getAiDetail(row),
    ruleReasons: getRuleReasons(row),
    templateNames: getTemplateNames(row),
    modelName: row.model_name,
    accepted: row.accepted === true,
    acceptedLabel: row.accepted === true ? '已采纳' : '未采纳',
  }
}

function getTargetName(row: SavedRecommendationRow) {
  const targetName = getNestedString(row.input_context, [
    'targetBean',
    'name',
  ])

  return targetName || row.bean_id || '未知咖啡豆'
}

function getParameterSummary(row: SavedRecommendationRow) {
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

function getAiSummary(row: SavedRecommendationRow) {
  const suggestion = getAiDetail(row)

  if (!suggestion) {
    return '仅保存了规则推荐。'
  }

  return suggestion.length > maxSummaryLength
    ? `${suggestion.slice(0, maxSummaryLength)}...`
    : suggestion
}

function getAiDetail(row: SavedRecommendationRow) {
  return getNestedString(row.recommendation, ['ai', 'suggestion']) ?? ''
}

function getRuleReasons(row: SavedRecommendationRow) {
  return getNestedStringArray(row.recommendation, ['rule', 'reasons'])
}

function getTemplateNames(row: SavedRecommendationRow) {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
