import type { BrewLog } from './brewTypes'

type DetailField = {
  label: string
  value: string
}

type PourStepView = {
  title: string
  detail: string
}

export type BrewLogDetailView = {
  title: string
  subtitle: string
  brewedAtLabel: string
  updatedAtLabel: string
  parameterFields: DetailField[]
  sensoryFields: DetailField[]
  pourSteps: PourStepView[]
  pourStepEmptyText: string
  ratingLabel: string
  flavorTags: string[]
  notes: string
  isPinnedRecipe: boolean
  pinActionLabel: string
}

export function buildBrewLogDetailView(log: BrewLog, beanName: string): BrewLogDetailView {
  const method = textOrEmpty(log.method)
  const dripper = textOrEmpty(log.dripper)
  const subtitleParts = [method, dripper].filter(Boolean)

  return {
    title: beanName.trim() || '未绑定豆子',
    subtitle: subtitleParts.length > 0 ? subtitleParts.join(' / ') : '方式待补充',
    brewedAtLabel: formatDateTime(log.brewed_at),
    updatedAtLabel: formatDateTime(log.updated_at),
    parameterFields: buildParameterFields(log),
    sensoryFields: buildSensoryFields(log),
    pourSteps: normalizePourSteps(log.pour_steps),
    pourStepEmptyText: '暂未记录分段注水',
    ratingLabel: log.rating === null ? '未评分' : `${log.rating} / 5`,
    flavorTags: log.flavor_tags,
    notes: textOrEmpty(log.notes) || '还没有记录口感备注。',
    isPinnedRecipe: log.is_pinned_recipe,
    pinActionLabel: log.is_pinned_recipe ? '取消候选方案' : '设为候选方案',
  }
}

function buildParameterFields(log: BrewLog): DetailField[] {
  return [
    textField('滤纸', log.filter_paper),
    textField('磨豆机', log.grinder),
    textField('研磨度', log.grind_setting),
    numberField('粉量', log.coffee_grams, ' g'),
    numberField('水量', log.water_grams, ' g'),
    textField('粉水比', log.ratio),
    numberField('水温', log.water_temperature_c, '°C'),
    timeField('总时间', log.total_time_seconds),
  ].filter((field): field is DetailField => field !== null)
}

function buildSensoryFields(log: BrewLog): DetailField[] {
  return [
    numberField('酸质', log.acidity, ' / 5'),
    numberField('甜感', log.sweetness, ' / 5'),
    numberField('苦感', log.bitterness, ' / 5'),
    numberField('涩感', log.astringency, ' / 5'),
    numberField('醇厚度', log.body, ' / 5'),
    numberField('余韵', log.aftertaste, ' / 5'),
  ].filter((field): field is DetailField => field !== null)
}

function normalizePourSteps(steps: unknown[]): PourStepView[] {
  return steps
    .map((step, index) => normalizePourStep(step, index))
    .filter((step): step is PourStepView => step !== null)
}

function normalizePourStep(step: unknown, index: number): PourStepView | null {
  if (!step || typeof step !== 'object') {
    return null
  }

  const record = step as Record<string, unknown>
  const title = stringValue(record.label) || stringValue(record.title) || `第 ${index + 1} 段`
  const detailParts = [
    stringValue(record.time) || stringValue(record.timeRange),
    formatWaterValue(record.water) || formatWaterValue(record.waterGrams),
    stringValue(record.note) || stringValue(record.description),
  ].filter(Boolean)

  if (detailParts.length === 0) {
    return null
  }

  return {
    title,
    detail: detailParts.join(' / '),
  }
}

function textField(label: string, value: string | null): DetailField | null {
  const text = textOrEmpty(value)
  return text ? { label, value: text } : null
}

function numberField(label: string, value: number | null, suffix: string): DetailField | null {
  return value === null ? null : { label, value: `${value}${suffix}` }
}

function timeField(label: string, value: number | null): DetailField | null {
  return value === null ? null : { label, value: formatSeconds(value) }
}

function textOrEmpty(value: string | null) {
  return value?.trim() ?? ''
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function formatWaterValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value} g` : stringValue(value)
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function formatDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '时间未知'
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
