import type { BrewForm, BrewLog, BrewLogInsertPayload, BrewLogUpdatePayload } from './brewTypes'
import { isMethodCompatible } from './brewMethodLinkage'
import { normalizeBrewMode, normalizeBrewVariant } from './brewMode'
import { deriveRatioFromMasses } from './brewRatio'

export function createInitialBrewForm(beanId = ''): BrewForm {
  return {
    beanId,
    method: '',
    brewMode: '',
    brewVariant: '',
    iceGrams: '',
    beverageGrams: '',
    dripper: '',
    filterPaper: '',
    grinder: '',
    grindSetting: '',
    coffeeGrams: '',
    waterGrams: '',
    waterTemperatureC: '',
    totalTimeSeconds: '',
    rating: '',
    acidity: '',
    sweetness: '',
    bitterness: '',
    astringency: '',
    body: '',
    aftertaste: '',
    flavorTags: '',
    notes: '',
    isPinnedRecipe: false,
  }
}

export function withFallbackBeanId(form: BrewForm, fallbackBeanId: string): BrewForm {
  if (form.beanId || !fallbackBeanId) {
    return form
  }

  return { ...form, beanId: fallbackBeanId }
}

export function createBrewFormFromLog(log: BrewLog): BrewForm {
  const brewMode = normalizeBrewMode(log)
  return {
    beanId: log.bean_id ?? '',
    method: log.method ?? '',
    brewMode: brewMode ?? '',
    brewVariant: normalizeBrewVariant(brewMode, log.brew_variant) ?? '',
    iceGrams: numberToFormValue(log.ice_grams ?? null),
    beverageGrams: numberToFormValue(log.beverage_grams ?? null),
    dripper: log.dripper ?? '',
    filterPaper: log.filter_paper ?? '',
    grinder: log.grinder ?? '',
    grindSetting: log.grind_setting ?? '',
    coffeeGrams: numberToFormValue(log.coffee_grams),
    waterGrams: numberToFormValue(log.water_grams),
    waterTemperatureC: numberToFormValue(log.water_temperature_c),
    totalTimeSeconds: numberToFormValue(log.total_time_seconds),
    rating: numberToFormValue(log.rating),
    acidity: numberToFormValue(log.acidity),
    sweetness: numberToFormValue(log.sweetness),
    bitterness: numberToFormValue(log.bitterness),
    astringency: numberToFormValue(log.astringency),
    body: numberToFormValue(log.body),
    aftertaste: numberToFormValue(log.aftertaste),
    flavorTags: log.flavor_tags.join(', '),
    notes: log.notes ?? '',
    isPinnedRecipe: log.is_pinned_recipe,
  }
}

export function toBrewLogInsertPayload(
  form: BrewForm,
  userId: string,
): BrewLogInsertPayload {
  return {
    ...toBrewLogUpdatePayload(form),
    user_id: userId,
  }
}

export function toBrewLogUpdatePayload(form: BrewForm): BrewLogUpdatePayload {
  const beanId = form.beanId.trim()

  if (!beanId) {
    throw new Error('请选择咖啡豆')
  }

  const coffeeGrams = optionalNumber(form.coffeeGrams)
  const brewMode = form.brewMode || null
  const method = brewMode === 'cold_brew' ? '冷萃' : form.method.trim()

  if (brewMode && method && !isMethodCompatible(brewMode, method)) {
    throw new Error('冲煮类型与具体方法不一致')
  }

  const brewVariant = normalizeBrewVariant(brewMode, form.brewVariant)
  const waterGrams = brewMode === 'espresso' ? null : optionalNumber(form.waterGrams)
  const storesIceGrams = brewMode === 'iced_pourover'
    || (brewMode === 'cold_brew' && brewVariant === 'concentrate')
  const iceGrams = storesIceGrams ? optionalNumber(form.iceGrams) : null
  const beverageGrams = brewMode === 'espresso' ? optionalNumber(form.beverageGrams) : null
  return {
    bean_id: beanId,
    method: optionalText(method),
    brew_mode: brewMode,
    brew_variant: brewVariant,
    ice_grams: iceGrams,
    beverage_grams: beverageGrams,
    dripper: optionalText(form.dripper),
    filter_paper: optionalText(form.filterPaper),
    grinder: optionalText(form.grinder),
    grind_setting: optionalText(form.grindSetting),
    coffee_grams: coffeeGrams,
    water_grams: waterGrams,
    ratio: deriveRatioFromMasses(brewMode, coffeeGrams, waterGrams, beverageGrams),
    water_temperature_c: optionalNumber(form.waterTemperatureC),
    total_time_seconds: optionalNumber(form.totalTimeSeconds),
    pour_steps: [],
    rating: optionalNumber(form.rating),
    acidity: optionalNumber(form.acidity),
    sweetness: optionalNumber(form.sweetness),
    bitterness: optionalNumber(form.bitterness),
    astringency: optionalNumber(form.astringency),
    body: optionalNumber(form.body),
    aftertaste: optionalNumber(form.aftertaste),
    flavor_tags: parseFlavorTags(form.flavorTags),
    is_pinned_recipe: form.isPinnedRecipe,
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

function numberToFormValue(value: number | null) {
  return value === null ? '' : String(value)
}

function parseFlavorTags(value: string) {
  const tags = value
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)

  return Array.from(new Set(tags))
}
