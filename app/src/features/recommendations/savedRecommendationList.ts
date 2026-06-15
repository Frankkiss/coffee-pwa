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
  modelName: string | null
  accepted: boolean
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
    modelName: row.model_name,
    accepted: row.accepted === true,
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
  const suggestion = getNestedString(row.recommendation, ['ai', 'suggestion'])

  if (!suggestion) {
    return '仅保存了规则推荐。'
  }

  return suggestion.length > maxSummaryLength
    ? `${suggestion.slice(0, maxSummaryLength)}...`
    : suggestion
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

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
