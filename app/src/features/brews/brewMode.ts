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

export function allowsIceGrams(mode: unknown, variant: unknown) {
  return mode === 'iced_pourover'
    || (mode === 'cold_brew' && variant === 'concentrate')
}

type BrewModeDisplayInput = {
  brew_mode?: string | null
  brew_variant?: string | null
  method?: string | null
}

const modeLabels: Record<BrewMode, string> = {
  hot_pourover: '热手冲',
  iced_pourover: '冰手冲',
  cold_brew: '冷萃',
  espresso: '意式',
}

const variantLabels: Record<BrewVariant, string> = {
  ready_to_drink: '直接饮用',
  concentrate: '浓缩基底',
}

export function getBrewModeDisplayLabel(input: BrewModeDisplayInput) {
  const method = input.method?.trim() ?? ''
  const mode = normalizeBrewMode(input)
  if (!mode) return method

  const parts = [modeLabels[mode]]
  const variant = normalizeBrewVariant(mode, input.brew_variant)
  if (variant) parts.push(variantLabels[variant])
  if (method && !isDefaultMethod(mode, method)) parts.push(method)
  return parts.join(' · ')
}

function isDefaultMethod(mode: BrewMode, method: string) {
  const normalized = method.trim().toLowerCase()
  if (mode === 'hot_pourover') return /^(手冲|pourover|pour-over|filter)$/.test(normalized)
  if (mode === 'iced_pourover') {
    return /^(手冲|冰手冲|iced\s*(pourover|pour-over|filter))$/.test(normalized)
  }
  if (mode === 'cold_brew') return /^(冷萃|cold\s*brew)$/.test(normalized)
  return /^(意式|espresso|浓缩咖啡)$/.test(normalized)
}
