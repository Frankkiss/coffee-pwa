import type { BrewLog } from '../brews/brewTypes'
import { getBrewModeDisplayLabel } from '../brews/brewMode'
import { getCanonicalBrewRatio } from '../brews/brewRatio'
import { formatBlendComponents } from './blendComponents'
import type { Bean } from './beanTypes'

export type BeanDetailBrewSummary = {
  id: string
  brewedAt: string
  title: string
  summary: string
  ratingLabel: string | null
  isPinnedRecipe: boolean
  notes: string | null
}

export type BeanDetailView = {
  bean: Bean
  beanTypeLabel: string
  primaryMeta: string[]
  detailFields: Array<{ label: string; value: string }>
  blendLines: string[]
  flavorText: string
  stockLines: string[]
  sourceUrl: string | null
  notes: string | null
  brewCount: number
  pinnedCount: number
  bestBrew: BeanDetailBrewSummary | null
  recentBrews: BeanDetailBrewSummary[]
}

export function buildBeanDetailView(bean: Bean, brewLogs: BrewLog[]): BeanDetailView {
  const relatedBrewLogs = brewLogs
    .filter((log) => log.bean_id === bean.id)
    .sort((left, right) => right.brewed_at.localeCompare(left.brewed_at))
  const summaries = relatedBrewLogs.map(toBrewSummary)
  const bestBrew = [...summaries].sort(compareBestBrew)[0] ?? null

  return {
    bean,
    beanTypeLabel: bean.bean_type === 'blend' ? '拼配豆' : '单一产区 / SOE',
    primaryMeta: [bean.origin, bean.process, bean.roast_level].filter(isPresent),
    detailFields: buildDetailFields(bean),
    blendLines: buildBlendLines(bean),
    flavorText: buildFlavorText(bean),
    stockLines: buildStockLines(bean),
    sourceUrl: bean.source_url,
    notes: bean.notes,
    brewCount: relatedBrewLogs.length,
    pinnedCount: relatedBrewLogs.filter((log) => log.is_pinned_recipe).length,
    bestBrew,
    recentBrews: summaries.slice(0, 3),
  }
}

function buildDetailFields(bean: Bean) {
  return [
    field('烘焙商', bean.roaster),
    field('豆子类型', bean.bean_type === 'blend' ? '拼配豆' : '单一产区 / SOE'),
    field('产地', bean.origin),
    field('处理法', bean.process),
    field('品种', bean.variety),
    field('庄园 / 处理站', bean.farm_or_station),
    field('海拔', bean.altitude_meters ? `${bean.altitude_meters}m` : null),
    field('烘焙度', bean.roast_level),
    field('烘焙日期', bean.roast_date),
  ].filter((item): item is { label: string; value: string } => Boolean(item.value))
}

function buildBlendLines(bean: Bean) {
  if (bean.bean_type !== 'blend') {
    return []
  }

  const formatted = formatBlendComponents(bean.blend_components ?? [])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (formatted.length > 0) {
    return formatted
  }

  return (bean.blend_notes ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function buildFlavorText(bean: Bean) {
  return [bean.flavor_tags.join('、'), bean.flavor_notes].filter(isPresent).join(' · ') || '风味待补充'
}

function buildStockLines(bean: Bean) {
  return [
    bean.remaining_grams == null ? null : '剩余 ' + bean.remaining_grams + 'g',
    bean.purchase_date ? `购买日期 ${bean.purchase_date}` : null,
    bean.price ? `价格 ${bean.price}` : null,
  ].filter(isPresent)
}

function toBrewSummary(log: BrewLog): BeanDetailBrewSummary {
  return {
    id: log.id,
    brewedAt: log.brewed_at,
    title: formatShortDate(log.brewed_at),
    summary:
      [
        getBrewModeDisplayLabel(log),
        log.dripper,
        getCanonicalBrewRatio(log),
        log.water_temperature_c ? `${log.water_temperature_c}°C` : null,
        log.total_time_seconds ? `${log.total_time_seconds}s` : null,
        log.grind_setting,
      ]
        .filter(isPresent)
        .join(' / ') || '参数待补充',
    ratingLabel: log.rating ? `${log.rating}/5` : null,
    isPinnedRecipe: log.is_pinned_recipe,
    notes: log.notes,
  }
}

function compareBestBrew(left: BeanDetailBrewSummary, right: BeanDetailBrewSummary) {
  const leftRating = Number(left.ratingLabel?.split('/')[0] ?? 0)
  const rightRating = Number(right.ratingLabel?.split('/')[0] ?? 0)

  return rightRating - leftRating || right.brewedAt.localeCompare(left.brewedAt)
}

function field(label: string, value: string | number | null | undefined) {
  return {
    label,
    value: value === null || value === undefined || value === '' ? '' : String(value),
  }
}

function formatShortDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '日期待确认'
  }

  return `${date.getMonth() + 1}/${date.getDate()}`
}

function isPresent(value: string | null | undefined): value is string {
  return Boolean(value)
}
