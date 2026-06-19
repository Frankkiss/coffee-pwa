import type { Bean } from '../beans/beanTypes'
import { splitMultiValueText } from '../beans/blendComponents'

type ProcessFamily = 'washed' | 'natural' | 'honey' | 'anaerobic' | 'wet_hulled'
type RoastBand = 'light' | 'medium' | 'dark'
type AltitudeBand = 'low' | 'medium' | 'high' | 'very_high'

const processMatchers: Array<[ProcessFamily, string[]]> = [
  ['anaerobic', ['anaerobic', 'carbonic', 'co-ferment', 'coferment', 'ferment', '\u538c\u6c27', '\u53d1\u9175']],
  ['washed', ['washed', 'wash', 'wet process', '\u6c34\u6d17']],
  ['natural', ['natural', 'dry process', 'sun dried', '\u65e5\u6652', '\u81ea\u7136']],
  ['honey', ['honey', 'pulped natural', '\u871c\u5904\u7406', '\u871c']],
  ['wet_hulled', ['wet hulled', 'giling basah', '\u6e7f\u5228']],
]

export function normalizeRuleText(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() ?? ''
}

export function getProcessFamily(value: string | null | undefined): ProcessFamily | null {
  const normalized = normalizeRuleText(value)

  if (!normalized) {
    return null
  }

  return processMatchers.find(([, tokens]) => tokens.some((token) => normalized.includes(token)))?.[0] ?? null
}

export function getBeanProcessFamilies(bean: Bean) {
  const families = new Set<ProcessFamily>()
  const directFamily = getProcessFamily(bean.process)

  if (directFamily) {
    families.add(directFamily)
  }

  splitMultiValueText(bean.process).forEach((process) => {
    const family = getProcessFamily(process)

    if (family) {
      families.add(family)
    }
  })

  for (const component of bean.blend_components ?? []) {
    const family = getProcessFamily(component.process)

    if (family) {
      families.add(family)
    }
  }

  return Array.from(families)
}

export function getRoastBand(value: string | null | undefined): RoastBand | null {
  const normalized = normalizeRuleText(value)

  if (!normalized) {
    return null
  }

  if (['dark', 'full city', '\u6df1', '\u91cd'].some((token) => normalized.includes(token))) {
    return 'dark'
  }

  if (['medium', 'city', '\u4e2d'].some((token) => normalized.includes(token))) {
    return 'medium'
  }

  if (['light', '\u6d45', '\u6781\u6d45', 'nordic'].some((token) => normalized.includes(token))) {
    return 'light'
  }

  return null
}

export function getAltitudeBand(value: number | null | undefined): AltitudeBand | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  if (value >= 2000) {
    return 'very_high'
  }

  if (value >= 1600) {
    return 'high'
  }

  if (value >= 1200) {
    return 'medium'
  }

  return 'low'
}

export function countSharedRuleTokens(left: string | null | undefined, right: string | null | undefined) {
  const rightTokens = new Set(tokenizeRuleText(right))

  return tokenizeRuleText(left).filter((token) => rightTokens.has(token)).length
}

export function getSharedBeanFlavorTags(targetBean: Bean, sourceBean: Bean | null) {
  if (!sourceBean) {
    return []
  }

  const sourceTags = new Set(sourceBean.flavor_tags.map(normalizeRuleText))

  return targetBean.flavor_tags.filter((tag) => sourceTags.has(normalizeRuleText(tag)))
}

export function buildBeanTemplateTerms(bean: Bean) {
  const terms = new Set<string>()

  addTerm(terms, bean.process)
  addTerm(terms, bean.roast_level)
  addTerm(terms, bean.variety)
  addTerm(terms, bean.origin)
  addTerm(terms, bean.farm_or_station)
  bean.flavor_tags.forEach((tag) => addTerm(terms, tag))

  for (const family of getBeanProcessFamilies(bean)) {
    addTerm(terms, family)
  }

  const roastBand = getRoastBand(bean.roast_level)
  if (roastBand) {
    addTerm(terms, roastBand)
  }

  const altitudeBand = getAltitudeBand(bean.altitude_meters)
  if (altitudeBand === 'high' || altitudeBand === 'very_high') {
    addTerm(terms, 'high altitude')
    addTerm(terms, 'high density')
    addTerm(terms, '\u9ad8\u6d77\u62d4')
    addTerm(terms, '\u9ad8\u5bc6\u5ea6')
  }

  if (bean.bean_type === 'blend') {
    addTerm(terms, 'blend')
    for (const component of bean.blend_components ?? []) {
      addTerm(terms, component.origin)
      addTerm(terms, component.process)
      addTerm(terms, component.variety)
    }
  }

  return terms
}

export function templateTermMatches(beanTerms: Set<string>, values: string[]) {
  return values.filter((value) => beanTerms.has(normalizeRuleText(value)))
}

export function isExtractiveStyleBean(bean: Bean) {
  const roastBand = getRoastBand(bean.roast_level)
  const altitudeBand = getAltitudeBand(bean.altitude_meters)

  return roastBand === 'light' && (altitudeBand === 'high' || altitudeBand === 'very_high')
}

function tokenizeRuleText(value: string | null | undefined) {
  return splitMultiValueText(value)
    .flatMap((part) => normalizeRuleText(part).split(/[^\p{L}\p{N}]+/u))
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)
}

function addTerm(terms: Set<string>, value: string | null | undefined) {
  const normalized = normalizeRuleText(value)

  if (normalized) {
    terms.add(normalized)
  }
}