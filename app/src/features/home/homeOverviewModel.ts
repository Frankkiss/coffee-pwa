import type { BackupReminderView } from '../backup/backupReminder'
import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'

export type HomeOverviewInput = {
  beans: Bean[]
  brewLogs: BrewLog[]
  backupReminder: BackupReminderView
  email: string | null | undefined
  isOnline: boolean
}

export type HomeOverviewStat = {
  label: string
  value: string
  caption: string
}

export type HomeOverviewBean = {
  id: string
  name: string
  meta: string
  note: string
  tag: string
}

export type HomeOverviewBrew = {
  id: string
  beanName: string
  summary: string
  brewedAt: string
  rating: string | null
}

export type HomeRecommendationParameter = {
  label: string
  value: string
}

export type HomeRecommendationPreview = {
  title: string
  status: string
  source: string
  actionLabel: string
  parameters: HomeRecommendationParameter[]
}

export type HomeOverviewView = {
  accountLabel: string
  syncLabel: string
  stats: HomeOverviewStat[]
  currentBeans: HomeOverviewBean[]
  recentBrews: HomeOverviewBrew[]
  recommendationPreview: HomeRecommendationPreview
  backup: BackupReminderView
}

export function buildHomeOverview(input: HomeOverviewInput): HomeOverviewView {
  const beanNameById = new Map(input.beans.map((bean) => [bean.id, bean.name]))
  const sortedBeans = [...input.beans].sort((left, right) =>
    right.created_at.localeCompare(left.created_at),
  )
  const sortedBrews = [...input.brewLogs].sort((left, right) =>
    right.brewed_at.localeCompare(left.brewed_at),
  )

  return {
    accountLabel: formatAccountLabel(input.email),
    syncLabel: input.isOnline ? '云同步在线' : '离线模式',
    stats: [
      { label: '豆仓', value: String(input.beans.length), caption: '支咖啡豆' },
      { label: '冲煮', value: String(input.brewLogs.length), caption: '条记录' },
      {
        label: '推荐',
        value: input.brewLogs.length > 0 ? '可用' : '待记录',
        caption: 'DeepSeek + 规则',
      },
      {
        label: '备份',
        value: formatBackupValue(input.backupReminder),
        caption: input.backupReminder.title,
      },
    ],
    currentBeans: sortedBeans.slice(0, 3).map(toHomeBean),
    recentBrews: sortedBrews.slice(0, 3).map((brewLog) =>
      toHomeBrew(brewLog, beanNameById),
    ),
    recommendationPreview: buildRecommendationPreview(sortedBrews, beanNameById),
    backup: input.backupReminder,
  }
}

function toHomeBean(bean: Bean): HomeOverviewBean {
  return {
    id: bean.id,
    name: bean.name,
    meta: bean.flavor_tags.slice(0, 3).join('、') || bean.flavor_notes || '风味待记录',
    note: '',
    tag: bean.roast_level || (bean.bean_type === 'blend' ? '拼配' : '单品'),
  }
}

function toHomeBrew(
  brewLog: BrewLog,
  beanNameById: Map<string, string>,
): HomeOverviewBrew {
  return {
    id: brewLog.id,
    beanName: brewLog.bean_id
      ? beanNameById.get(brewLog.bean_id) ?? '未知咖啡豆'
      : '未绑定豆子',
    summary: formatBrewSummary(brewLog),
    brewedAt: formatShortDate(brewLog.brewed_at),
    rating: typeof brewLog.rating === 'number' ? `${brewLog.rating}/5` : null,
  }
}

export function formatBrewSummary(brewLog: BrewLog) {
  return (
    [
      brewLog.method,
      brewLog.dripper,
      brewLog.ratio,
      typeof brewLog.water_temperature_c === 'number'
        ? `${brewLog.water_temperature_c}°C`
        : null,
      typeof brewLog.total_time_seconds === 'number'
        ? `${brewLog.total_time_seconds}s`
        : null,
      brewLog.grind_setting,
    ]
      .filter(Boolean)
      .join(' / ') || '参数待补充'
  )
}

function buildRecommendationPreview(
  sortedBrews: BrewLog[],
  beanNameById: Map<string, string>,
): HomeRecommendationPreview {
  const bestBrew = [...sortedBrews].sort(compareRecommendationBrews)[0]

  if (!bestBrew) {
    return {
      title: '冲煮方案推荐',
      status: '待记录',
      source: '规则推荐需要历史参数',
      actionLabel: '去生成',
      parameters: [
        { label: '粉水比', value: '待生成' },
        { label: '水温', value: '待生成' },
        { label: '研磨', value: '待生成' },
        { label: '时间', value: '待生成' },
      ],
    }
  }

  return {
    title: bestBrew.bean_id
      ? beanNameById.get(bestBrew.bean_id) ?? '未知咖啡豆'
      : '未绑定豆子',
    status: '可生成',
    source: formatRecommendationSource(bestBrew),
    actionLabel: '打开推荐',
    parameters: [
      { label: '粉水比', value: bestBrew.ratio ?? '待补充' },
      {
        label: '水温',
        value:
          typeof bestBrew.water_temperature_c === 'number'
            ? `${bestBrew.water_temperature_c}°C`
            : '待补充',
      },
      { label: '研磨', value: bestBrew.grind_setting ?? '待补充' },
      {
        label: '时间',
        value:
          typeof bestBrew.total_time_seconds === 'number'
            ? `${bestBrew.total_time_seconds}s`
            : '待补充',
      },
    ],
  }
}

function compareRecommendationBrews(left: BrewLog, right: BrewLog) {
  if (left.is_pinned_recipe !== right.is_pinned_recipe) {
    return left.is_pinned_recipe ? -1 : 1
  }

  const leftRating = left.rating ?? 0
  const rightRating = right.rating ?? 0

  if (leftRating !== rightRating) {
    return rightRating - leftRating
  }

  return right.brewed_at.localeCompare(left.brewed_at)
}

function formatRecommendationSource(brewLog: BrewLog) {
  const prefix = brewLog.is_pinned_recipe ? '来自已钉选方案' : '来自高分记录'

  if (typeof brewLog.rating === 'number') {
    return `${prefix} · ${brewLog.rating}/5`
  }

  return prefix
}

export function formatShortDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '日期待确认'
  }

  return `${date.getMonth() + 1}/${date.getDate()}`
}

function formatAccountLabel(email: string | null | undefined) {
  if (!email) {
    return '咖Day'
  }

  return email.split('@')[0] || email
}

function formatBackupValue(backupReminder: BackupReminderView) {
  if (backupReminder.daysSinceExport === null) {
    return '未备份'
  }

  return `${backupReminder.daysSinceExport}天前`
}
