import type { BrewMode, BrewVariant } from './brewTypes'

const brewModes = new Set<BrewMode>([
  'hot_pourover',
  'iced_pourover',
  'cold_brew',
  'espresso',
])

const brewVariants = new Set<BrewVariant>(['ready_to_drink', 'concentrate'])

export function isBrewMode(value: unknown): value is BrewMode {
  return typeof value === 'string' && brewModes.has(value as BrewMode)
}

export function normalizeBrewMode(input: {
  brew_mode?: string | null
  method?: string | null
}): BrewMode | null {
  if (isBrewMode(input.brew_mode)) return input.brew_mode

  const method = input.method?.trim().toLowerCase() ?? ''
  if (/冰手冲|iced\s*(pour|filter)/.test(method)) return 'iced_pourover'
  if (/冷萃|cold\s*brew/.test(method)) return 'cold_brew'
  if (/意式|espresso|浓缩咖啡/.test(method)) return 'espresso'
  if (/手冲|pourover|pour-over|filter/.test(method)) return 'hot_pourover'
  return null
}

export function normalizeBrewVariant(
  mode: BrewMode | null,
  value: unknown,
): BrewVariant | null {
  return mode === 'cold_brew' && typeof value === 'string' && brewVariants.has(value as BrewVariant)
    ? (value as BrewVariant)
    : null
}
