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

export type HomeOverviewView = {
  accountLabel: string
  syncLabel: string
  stats: HomeOverviewStat[]
  currentBeans: HomeOverviewBean[]
  recentBrews: HomeOverviewBrew[]
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
