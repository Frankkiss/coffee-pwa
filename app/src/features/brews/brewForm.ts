import type { BrewForm, BrewLogInsertPayload } from './brewTypes'

export function createInitialBrewForm(beanId = ''): BrewForm {
  return {
    beanId,
    method: '',
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

export function toBrewLogInsertPayload(
  form: BrewForm,
  userId: string,
): BrewLogInsertPayload {
  const beanId = form.beanId.trim()

  if (!beanId) {
    throw new Error('请选择咖啡豆')
  }

  const coffeeGrams = optionalNumber(form.coffeeGrams)
  const waterGrams = optionalNumber(form.waterGrams)

  return {
    user_id: userId,
    bean_id: beanId,
    method: optionalText(form.method),
    dripper: optionalText(form.dripper),
    filter_paper: optionalText(form.filterPaper),
    grinder: optionalText(form.grinder),
    grind_setting: optionalText(form.grindSetting),
    coffee_grams: coffeeGrams,
    water_grams: waterGrams,
    ratio: calculateRatio(coffeeGrams, waterGrams),
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

function calculateRatio(coffeeGrams: number | null, waterGrams: number | null) {
  if (!coffeeGrams || !waterGrams) {
    return null
  }

  const ratio = waterGrams / coffeeGrams
  return `1:${Number.isInteger(ratio) ? ratio : ratio.toFixed(1)}`
}

function parseFlavorTags(value: string) {
  const tags = value
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)

  return Array.from(new Set(tags))
}
