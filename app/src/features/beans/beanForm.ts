import type { BeanForm, BeanInsertPayload } from './beanTypes'

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
    notes: '',
  }
}

export function toBeanInsertPayload(form: BeanForm, userId: string): BeanInsertPayload {
  const name = form.name.trim()

  if (!name) {
    throw new Error('咖啡豆名称不能为空')
  }

  return {
    user_id: userId,
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
    remaining_grams: optionalNumber(form.remainingGrams),
    price: optionalNumber(form.price),
    purchase_date: optionalText(form.purchaseDate),
    source_url: optionalText(form.sourceUrl),
    notes: optionalText(form.notes),
  }
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

function parseFlavorTags(value: string) {
  const tags = value
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)

  return Array.from(new Set(tags))
}
