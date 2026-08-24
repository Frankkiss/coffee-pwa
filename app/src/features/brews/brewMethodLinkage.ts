import type { BrewMode } from './brewTypes'

type BrewModeValue = BrewMode | ''

const methodModes: Record<string, readonly BrewMode[]> = {
  手冲: ['hot_pourover', 'iced_pourover'],
  爱乐压: ['hot_pourover'],
  法压: ['hot_pourover'],
  冷萃: ['cold_brew'],
  意式: ['espresso'],
  摩卡壶: ['espresso'],
}

const defaultMethodByMode: Record<BrewMode, string> = {
  hot_pourover: '手冲',
  iced_pourover: '手冲',
  cold_brew: '冷萃',
  espresso: '意式',
}

export function isMethodCompatible(mode: BrewModeValue, method: string) {
  if (!mode || !method) return true
  const modes = methodModes[method]
  return modes ? modes.includes(mode) : true
}

export function linkMethodToMode(method: string, currentMode: BrewModeValue) {
  const modes = methodModes[method]
  const brewMode = modes?.includes(currentMode as BrewMode)
    ? currentMode
    : modes?.[0] ?? currentMode

  return { brewMode, method }
}

export function linkModeToMethod(brewMode: BrewModeValue, currentMethod: string) {
  if (!brewMode || isMethodCompatible(brewMode, currentMethod)) {
    return { brewMode, method: currentMethod }
  }

  return { brewMode, method: defaultMethodByMode[brewMode] }
}
