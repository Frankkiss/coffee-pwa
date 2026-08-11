import type { BrewLog } from '../brews/brewTypes'
import type { EntitySyncStatus } from './syncRuntimeModel'

export function getEntitySyncBadge(status: EntitySyncStatus | undefined) {
  if (status === 'pending') return '待同步'
  if (status === 'needs_attention') return '需要处理'
  return null
}

export function filterBrewLogsForBean(brewLogs: BrewLog[], beanId: string) {
  return brewLogs.filter((brewLog) => brewLog.bean_id === beanId)
}
