import type { Bean } from '../beans/beanTypes'
import { formatBlendComponents } from '../beans/blendComponents'
import type { BrewLog } from '../brews/brewTypes'

type CsvKind = 'beans' | 'brew-logs'

export function buildBeansCsv(beans: Bean[]) {
  return buildCsv(
    [
      '名称',
      '烘焙商',
      '豆子类型',
      '产地',
      '庄园/处理站',
      '处理法',
      '品种',
      '海拔',
      '烘焙日期',
      '烘焙度',
      '风味标签',
      '净含量',
      '剩余克数',
      '拼配组成',
      '备注',
      '创建时间',
      '更新时间',
    ],
    beans.map((bean) => [
      bean.name,
      bean.roaster,
      bean.bean_type === 'blend' ? '拼配豆' : '单一产区',
      bean.origin,
      bean.farm_or_station,
      bean.process,
      bean.variety,
      bean.altitude_meters,
      bean.roast_date,
      bean.roast_level,
      bean.flavor_tags.join('、'),
      bean.net_weight_grams,
      bean.remaining_grams ?? null,
      bean.bean_type === 'blend'
        ? bean.blend_notes ?? formatBlendComponents(bean.blend_components ?? [])
        : null,
      bean.notes,
      bean.created_at,
      bean.updated_at,
    ]),
  )
}

export function buildBrewLogsCsv(brewLogs: BrewLog[]) {
  return buildCsv(
    [
      '咖啡豆ID',
      '冲煮时间',
      '方式',
      '冲煮模式',
      '冷萃类型',
      '冰量',
      '意式出液克数',
      '器具',
      '滤纸',
      '磨豆机',
      '研磨度',
      '粉量',
      '水量',
      '粉水比（冰手冲仅热水）',
      '水温',
      '总时间',
      '评分',
      '酸',
      '甜',
      '苦',
      '涩',
      '醇厚度',
      '余韵',
      '风味标签',
      '候选推荐方案',
      '备注',
      '创建时间',
      '更新时间',
    ],
    brewLogs.map((log) => [
      log.bean_id,
      log.brewed_at,
      log.method,
      log.brew_mode ?? null,
      log.brew_variant ?? null,
      log.ice_grams ?? null,
      log.beverage_grams ?? null,
      log.dripper,
      log.filter_paper,
      log.grinder,
      log.grind_setting,
      log.coffee_grams,
      log.water_grams,
      log.ratio,
      log.water_temperature_c,
      log.total_time_seconds,
      log.rating,
      log.acidity,
      log.sweetness,
      log.bitterness,
      log.astringency,
      log.body,
      log.aftertaste,
      log.flavor_tags.join('、'),
      log.is_pinned_recipe ? '是' : '否',
      log.notes,
      log.created_at,
      log.updated_at,
    ]),
  )
}

export function createCsvFileName(kind: CsvKind, date: Date) {
  return `coffee-${kind}-${date.toISOString().slice(0, 10)}.csv`
}

function buildCsv(headers: string[], rows: Array<Array<string | number | boolean | null>>) {
  return [headers, ...rows].map((row) => row.map(formatCsvCell).join(',')).join('\n')
}

function formatCsvCell(value: string | number | boolean | null) {
  if (value === null) {
    return ''
  }

  const text = String(value)
  const escaped = text.replaceAll('"', '""')

  if (/[",\n\r]/.test(escaped)) {
    return `"${escaped}"`
  }

  return escaped
}
