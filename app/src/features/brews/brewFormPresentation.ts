import type { BrewMode, BrewVariant } from './brewTypes'

export function getBrewFormPresentation(
  mode: BrewMode | '',
  variant: BrewVariant | '',
) {
  return {
    showMethod: mode !== 'cold_brew',
    showIceGrams:
      mode === 'iced_pourover' ||
      (mode === 'cold_brew' && variant === 'concentrate'),
  }
}
