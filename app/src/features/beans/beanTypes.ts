export type BeanType = 'single_origin' | 'blend'

export type BeanBlendComponent = {
  origin: string
  process: string
  variety: string
  percentage: number | null
  role: string
  notes: string
}

export type Bean = {
  id: string
  user_id: string
  name: string
  roaster: string | null
  origin: string | null
  farm_or_station: string | null
  process: string | null
  variety: string | null
  altitude_meters: number | null
  roast_date: string | null
  roast_level: string | null
  flavor_tags: string[]
  flavor_notes: string | null
  net_weight_grams: number | null
  remaining_grams: number | null
  price: number | null
  purchase_date: string | null
  source_url: string | null
  image_url: string | null
  bean_type?: BeanType
  blend_components?: BeanBlendComponent[]
  blend_notes?: string | null
  notes: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  schema_version: number
}

export type BeanForm = {
  name: string
  roaster: string
  origin: string
  farmOrStation: string
  process: string
  variety: string
  altitudeMeters: string
  roastDate: string
  roastLevel: string
  flavorTags: string
  flavorNotes: string
  netWeightGrams: string
  remainingGrams: string
  price: string
  purchaseDate: string
  sourceUrl: string
  beanType: BeanType
  blendComponentsText: string
  notes: string
}

export type BeanInsertPayload = {
  user_id: string
  name: string
  roaster: string | null
  origin: string | null
  farm_or_station: string | null
  process: string | null
  variety: string | null
  altitude_meters: number | null
  roast_date: string | null
  roast_level: string | null
  flavor_tags: string[]
  flavor_notes: string | null
  net_weight_grams: number | null
  remaining_grams: number | null
  price: number | null
  purchase_date: string | null
  source_url: string | null
  bean_type: BeanType
  blend_components: BeanBlendComponent[]
  blend_notes: string | null
  notes: string | null
}

export type BeanUpdatePayload = Omit<BeanInsertPayload, 'user_id'>

export type BeanFilters = {
  search: string
  process: string
  roastLevel: string
}
