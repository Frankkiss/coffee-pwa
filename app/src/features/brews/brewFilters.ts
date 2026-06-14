import type { BrewLog, BrewLogFilters } from './brewTypes'

export function filterBrewLogs(logs: BrewLog[], filters: BrewLogFilters) {
  const query = filters.query.trim().toLowerCase()

  return logs.filter((log) => {
    if (filters.beanId && log.bean_id !== filters.beanId) {
      return false
    }

    if (filters.method && log.method !== filters.method) {
      return false
    }

    if (filters.pinned === 'pinned' && !log.is_pinned_recipe) {
      return false
    }

    if (filters.pinned === 'unpinned' && log.is_pinned_recipe) {
      return false
    }

    if (!query) {
      return true
    }

    return createSearchText(log).includes(query)
  })
}

function createSearchText(log: BrewLog) {
  return [
    log.method,
    log.dripper,
    log.filter_paper,
    log.grinder,
    log.grind_setting,
    log.ratio,
    log.notes,
    ...log.flavor_tags,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase()
}
