export type BrewLog = {
  id: string
  user_id: string
  bean_id: string | null
  brewed_at: string
  method: string | null
  dripper: string | null
  filter_paper: string | null
  grinder: string | null
  grind_setting: string | null
  coffee_grams: number | null
  water_grams: number | null
  ratio: string | null
  water_temperature_c: number | null
  total_time_seconds: number | null
  pour_steps: unknown[]
  rating: number | null
  acidity: number | null
  sweetness: number | null
  bitterness: number | null
  astringency: number | null
  body: number | null
  aftertaste: number | null
  flavor_tags: string[]
  is_pinned_recipe: boolean
  notes: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  schema_version: number
}

export type BrewForm = {
  beanId: string
  method: string
  dripper: string
  filterPaper: string
  grinder: string
  grindSetting: string
  coffeeGrams: string
  waterGrams: string
  waterTemperatureC: string
  totalTimeSeconds: string
  rating: string
  acidity: string
  sweetness: string
  bitterness: string
  astringency: string
  body: string
  aftertaste: string
  flavorTags: string
  notes: string
  isPinnedRecipe: boolean
}

export type BrewLogFilters = {
  query: string
  beanId: string
  method: string
  pinned: 'all' | 'pinned' | 'unpinned'
}

export type BrewLogUpdatePayload = {
  bean_id: string
  method: string | null
  dripper: string | null
  filter_paper: string | null
  grinder: string | null
  grind_setting: string | null
  coffee_grams: number | null
  water_grams: number | null
  ratio: string | null
  water_temperature_c: number | null
  total_time_seconds: number | null
  pour_steps: unknown[]
  rating: number | null
  acidity: number | null
  sweetness: number | null
  bitterness: number | null
  astringency: number | null
  body: number | null
  aftertaste: number | null
  flavor_tags: string[]
  is_pinned_recipe: boolean
  notes: string | null
}

export type BrewLogInsertPayload = BrewLogUpdatePayload & {
  user_id: string
}
