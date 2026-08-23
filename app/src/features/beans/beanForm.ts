import type {
  Bean,
  BeanBlendComponent,
  BeanForm,
  BeanInsertPayload,
  BeanUpdatePayload,
} from './beanTypes'
import {
  normalizeBlendComponents,
  normalizeBeanType,
  parseBlendComponentsText,
} from './blendComponents'

export function createInitialBeanForm(): BeanForm {
  return {
    name: '',
    roaster: '',
    origin: '',
    farmOrStation: '',
    process: '',
    variety: '',
    altitudeMeters: '',
    roastDate: '',
    roastLevel: '',
    flavorTags: '',
    flavorNotes: '',
    netWeightGrams: '',
    remainingGrams: '',
    price: '',
    purchaseDate: '',
    sourceUrl: '',
    beanType: 'single_origin',
    blendComponents: [],
    blendNotes: '',
    notes: '',
  }
}

export function toBeanInsertPayload(form: BeanForm, userId: string): BeanInsertPayload {
  return {
    user_id: userId,
    ...toBeanUpdatePayload(form),
  }
}

export function createBeanFormFromBean(bean: Bean): BeanForm {
  return {
    name: bean.name,
    roaster: bean.roaster ?? '',
    origin: bean.origin ?? '',
    farmOrStation: bean.farm_or_station ?? '',
    process: bean.process ?? '',
    variety: bean.variety ?? '',
    altitudeMeters: numberToFormValue(bean.altitude_meters),
    roastDate: bean.roast_date ?? '',
    roastLevel: bean.roast_level ?? '',
    flavorTags: bean.flavor_tags.join(', '),
    flavorNotes: bean.flavor_notes ?? '',
    netWeightGrams: numberToFormValue(bean.net_weight_grams),
    remainingGrams: numberToFormValue(bean.remaining_grams ?? null),
    price: numberToFormValue(bean.price),
    purchaseDate: bean.purchase_date ?? '',
    sourceUrl: bean.source_url ?? '',
    beanType: normalizeBeanType(bean.bean_type),
    blendComponents: createEditableBlendComponents(bean),
    blendNotes: bean.blend_notes ?? '',
    notes: bean.notes ?? '',
  }
}

export function toBeanUpdatePayload(form: BeanForm): BeanUpdatePayload {
  const name = form.name.trim()

  if (!name) {
    throw new Error('咖啡豆名称不能为空')
  }

  return {
    name,
    roaster: optionalText(form.roaster),
    origin: optionalText(form.origin),
    farm_or_station: optionalText(form.farmOrStation),
    process: optionalText(form.process),
    variety: optionalText(form.variety),
    altitude_meters: optionalNumber(form.altitudeMeters),
    roast_date: optionalText(form.roastDate),
    roast_level: optionalText(form.roastLevel),
    flavor_tags: parseFlavorTags(form.flavorTags),
    flavor_notes: optionalText(form.flavorNotes),
    net_weight_grams: optionalNumber(form.netWeightGrams),
    remaining_grams: optionalNonNegativeNumber(form.remainingGrams),
    price: optionalNumber(form.price),
    purchase_date: optionalText(form.purchaseDate),
    source_url: optionalText(form.sourceUrl),
    bean_type: normalizeBeanType(form.beanType),
    blend_components:
      normalizeBeanType(form.beanType) === 'blend'
        ? normalizeBlendComponents(form.blendComponents)
        : [],
    blend_notes:
      normalizeBeanType(form.beanType) === 'blend' ? optionalText(form.blendNotes) : null,
    notes: optionalText(form.notes),
  }
}

function createEditableBlendComponents(bean: Bean): BeanBlendComponent[] {
  const structuredComponents = normalizeBlendComponents(bean.blend_components ?? [])

  if (structuredComponents.length > 0) {
    return structuredComponents
  }

  return parseBlendComponentsText(bean.blend_notes ?? '')
}

function numberToFormValue(value: number | null) {
  return value === null ? '' : String(value)
}

function optionalText(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function optionalNumber(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return null
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}
function optionalNonNegativeNumber(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return null
  }

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) {
    throw new Error('剩余克数必须是有效数字')
  }
  if (parsed < 0) {
    throw new Error('剩余克数不能小于 0')
  }
  return parsed
}


function parseFlavorTags(value: string) {
  const tags = value
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)

  return Array.from(new Set(tags))
}
