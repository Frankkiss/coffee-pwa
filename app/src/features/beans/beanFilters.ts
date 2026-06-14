import type { Bean, BeanFilters } from './beanTypes'

export function filterBeans(beans: Bean[], filters: BeanFilters) {
  const search = filters.search.trim().toLowerCase()

  return beans.filter((bean) => {
    if (filters.process && bean.process !== filters.process) {
      return false
    }

    if (filters.roastLevel && bean.roast_level !== filters.roastLevel) {
      return false
    }

    if (!search) {
      return true
    }

    return [
      bean.name,
      bean.roaster,
      bean.origin,
      bean.farm_or_station,
      bean.variety,
      bean.notes,
    ]
      .filter((value): value is string => typeof value === 'string')
      .some((value) => value.toLowerCase().includes(search))
  })
}
