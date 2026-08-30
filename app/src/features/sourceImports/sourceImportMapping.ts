import { createInitialBeanForm } from '../beans/beanForm'
import type { BeanBlendComponent, BeanForm } from '../beans/beanTypes'
import {
  normalizeBeanType,
  normalizeBlendComponents,
} from '../beans/blendComponents'
import type { SourceImportConfidence, SourceImportDraft } from './sourceImportTypes'

export function normalizeSourceImportDraft(input: unknown): SourceImportDraft {
  const record = isRecord(input) ? input : {}

  return {
    name: stringValue(record.name),
    roaster: stringValue(record.roaster),
    origin: localizeKnownTerm(record.origin, originTerms),
    farmOrStation: stringValue(record.farmOrStation ?? record.farm_or_station),
    process: localizeKnownTerm(record.process, processTerms),
    variety: localizeKnownTerm(record.variety, varietyTerms),
    altitudeMeters: numberValue(record.altitudeMeters ?? record.altitude_meters),
    roastDate: stringValue(record.roastDate ?? record.roast_date),
    roastLevel: localizeKnownTerm(record.roastLevel ?? record.roast_level, roastLevelTerms),
    flavorTags: listValue(record.flavorTags ?? record.flavor_tags, flavorTagTerms),
    flavorNotes: stringValue(record.flavorNotes ?? record.flavor_notes),
    netWeightGrams: numberValue(record.netWeightGrams ?? record.net_weight_grams),
    price: numberValue(record.price),
    sourceUrl: stringValue(record.sourceUrl ?? record.source_url),
    beanType: normalizeSourceBeanType(record.beanType ?? record.bean_type),
    blendComponents: normalizeSourceBlendComponents(
      record.blendComponents ?? record.blend_components,
    ),
    blendNotes: stringValue(record.blendNotes ?? record.blend_notes),
    notes: stringValue(record.notes),
    confidence: confidenceValue(record.confidence),
    missingFields: listValue(record.missingFields ?? record.missing_fields, missingFieldTerms).filter(
      (field) => !ignoredMissingFields.has(termKey(field)),
    ),
  }
}

export function createBeanFormFromSourceDraft(draft: SourceImportDraft): BeanForm {
  return {
    ...createInitialBeanForm(),
    name: draft.name,
    roaster: draft.roaster,
    origin: draft.origin,
    farmOrStation: draft.farmOrStation,
    process: draft.process,
    variety: draft.variety,
    altitudeMeters: numberToFormValue(draft.altitudeMeters),
    roastDate: draft.roastDate,
    roastLevel: draft.roastLevel,
    flavorTags: draft.flavorTags.join(', '),
    flavorNotes: draft.flavorNotes,
    netWeightGrams: numberToFormValue(draft.netWeightGrams),
    price: numberToFormValue(draft.price),
    sourceUrl: '',
    beanType: draft.beanType,
    blendComponents: [],
    blendNotes: '',
    notes: draft.notes,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown) {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return ''
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function numberToFormValue(value: number | null) {
  return value === null ? '' : String(value)
}

function listValue(value: unknown, dictionary?: Record<string, string>) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,，、]/) : []
  const normalized = values
    .map((item) => localizeKnownTerm(item, dictionary))
    .filter(Boolean)

  return Array.from(new Set(normalized))
}

function normalizeSourceBeanType(value: unknown) {
  const normalized = termKey(stringValue(value))

  if (normalized === 'blend' || normalized === '拼配' || normalized === '拼配豆') {
    return 'blend'
  }

  return normalizeBeanType(value)
}

function normalizeSourceBlendComponents(value: unknown): BeanBlendComponent[] {
  return normalizeBlendComponents(value).map((component) => ({
    origin: localizeKnownTerm(component.origin, originTerms),
    process: localizeKnownTerm(component.process, processTerms),
    variety: localizeKnownTerm(component.variety, varietyTerms),
    percentage: component.percentage,
    role: component.role,
    notes: component.notes,
  }))
}

function localizeKnownTerm(value: unknown, dictionary?: Record<string, string>) {
  const normalized = stringValue(value)

  if (!dictionary || !normalized) {
    return normalized
  }

  return dictionary[termKey(normalized)] ?? normalized
}

function termKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[()（）]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

const originTerms: Record<string, string> = {
  brazil: '巴西',
  burundi: '布隆迪',
  bolivia: '玻利维亚',
  china: '中国',
  colombia: '哥伦比亚',
  'costa rica': '哥斯达黎加',
  ecuador: '厄瓜多尔',
  ethiopia: '埃塞俄比亚',
  guatemala: '危地马拉',
  honduras: '洪都拉斯',
  indonesia: '印度尼西亚',
  kenya: '肯尼亚',
  mexico: '墨西哥',
  nicaragua: '尼加拉瓜',
  panama: '巴拿马',
  peru: '秘鲁',
  rwanda: '卢旺达',
  'el salvador': '萨尔瓦多',
  yunnan: '云南',
}

const processTerms: Record<string, string> = {
  washed: '水洗',
  wash: '水洗',
  'washed process': '水洗',
  natural: '日晒',
  'natural process': '日晒',
  'dry process': '日晒',
  honey: '蜜处理',
  'honey process': '蜜处理',
  anaerobic: '厌氧',
  'anaerobic natural': '厌氧日晒',
  'anaerobic washed': '厌氧水洗',
  'anaerobic honey': '厌氧蜜处理',
  'carbonic maceration': '二氧化碳浸渍',
  'co ferment': '共发酵',
  'co fermented': '共发酵',
  fermentation: '发酵处理',
}

const roastLevelTerms: Record<string, string> = {
  'extremely light': '极浅烘',
  'extremely light roast': '极浅烘',
  'ultra light': '极浅烘',
  'ultra light roast': '极浅烘',
  'very light': '极浅烘',
  'very light roast': '极浅烘',
  light: '浅烘',
  'light roast': '浅烘',
  'medium light': '中浅烘',
  'medium light roast': '中浅烘',
  medium: '中烘',
  'medium roast': '中烘',
  'medium dark': '中深烘',
  'medium dark roast': '中深烘',
  dark: '深烘',
  'dark roast': '深烘',
}

const varietyTerms: Record<string, string> = {
  heirloom: '原生种',
  bourbon: '波旁',
  typica: '铁皮卡',
  gesha: '瑰夏',
  geisha: '瑰夏',
  caturra: '卡杜拉',
  catuai: '卡杜艾',
  castillo: '卡斯蒂优',
  sl28: 'SL28',
  sl34: 'SL34',
}

const flavorTagTerms: Record<string, string> = {
  almond: '杏仁',
  apple: '苹果',
  apricot: '杏桃',
  berry: '莓果',
  berries: '莓果',
  'black tea': '红茶',
  blueberry: '蓝莓',
  caramel: '焦糖',
  cherry: '樱桃',
  chocolate: '巧克力',
  citrus: '柑橘',
  clean: '干净',
  cocoa: '可可',
  floral: '花香',
  flower: '花香',
  grapefruit: '葡萄柚',
  grape: '葡萄',
  'green tea': '绿茶',
  hazelnut: '榛果',
  honey: '蜂蜜',
  jasmine: '茉莉',
  juicy: '多汁',
  lemon: '柠檬',
  lime: '青柠',
  mango: '芒果',
  nut: '坚果',
  nuts: '坚果',
  oolong: '乌龙茶',
  orange: '橙子',
  peach: '桃子',
  pineapple: '菠萝',
  plum: '李子',
  raisin: '葡萄干',
  raspberry: '覆盆子',
  strawberry: '草莓',
  sweet: '甜感',
  tea: '茶感',
  'tropical fruit': '热带水果',
  winey: '酒香',
}

const missingFieldTerms: Record<string, string> = {
  altitude: '海拔',
  'altitude meters': '海拔',
  farm: '庄园',
  'farm or station': '庄园或处理站',
  'flavor notes': '风味描述',
  'flavor tags': '风味标签',
  origin: '产地',
  price: '价格',
  process: '处理法',
  roaster: '烘焙商',
  'roast date': '烘焙日期',
  'roast level': '烘焙度',
  station: '处理站',
  variety: '品种',
}

const ignoredMissingFields = new Set(['net weight', 'weight', '净含量', '剩余量'])

function confidenceValue(value: unknown): SourceImportConfidence {
  const normalized = stringValue(value).toLowerCase()

  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
    return normalized
  }

  return ''
}
