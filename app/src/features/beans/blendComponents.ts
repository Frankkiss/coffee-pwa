import type { BeanBlendComponent, BeanType } from './beanTypes'

const knownOrigins = [
  '埃塞俄比亚',
  '哥伦比亚',
  '巴西',
  '肯尼亚',
  '危地马拉',
  '哥斯达黎加',
  '巴拿马',
  '洪都拉斯',
  '秘鲁',
  '卢旺达',
  '云南',
]

const knownProcesses = [
  '厌氧日晒',
  '厌氧水洗',
  '厌氧蜜处理',
  '二氧化碳浸渍',
  '蜜处理',
  '共发酵',
  '水洗',
  '日晒',
  '厌氧',
]

const knownVarieties = [
  '粉波旁',
  '黄波旁',
  '红波旁',
  '原生种',
  '铁皮卡',
  '卡杜拉',
  '卡杜艾',
  '卡斯蒂优',
  '波旁',
  '瑰夏',
  'SL28',
  'SL34',
]

export function normalizeBeanType(value: unknown): BeanType {
  return value === 'blend' ? 'blend' : 'single_origin'
}

export function parseBlendComponentsText(value: string): BeanBlendComponent[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseBlendLine)
}

export function normalizeBlendComponents(value: unknown): BeanBlendComponent[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null
      }

      const record = item as Record<string, unknown>

      return {
        origin: stringValue(record.origin),
        process: stringValue(record.process),
        variety: stringValue(record.variety),
        percentage: percentageValue(record.percentage),
        role: stringValue(record.role),
        notes: stringValue(record.notes),
      }
    })
    .filter((component): component is BeanBlendComponent =>
      Boolean(
        component &&
          (component.origin ||
            component.process ||
            component.variety ||
            component.percentage !== null ||
            component.role ||
            component.notes),
      ),
    )
}

export function formatBlendComponents(components: BeanBlendComponent[]) {
  return components
    .map((component) =>
      [
        component.percentage !== null ? `${component.percentage}%` : '',
        component.origin,
        component.process,
        component.variety,
        component.role,
      ]
        .filter(Boolean)
        .join(' ')
        .concat(component.notes ? `，${component.notes}` : ''),
    )
    .filter(Boolean)
    .join('\n')
}

function parseBlendLine(line: string): BeanBlendComponent {
  const percentage = parsePercentage(line)
  const withoutPercentage = line.replace(/^\s*\d+(?:\.\d+)?\s*%?\s*/, '').trim()
  const [descriptor, ...noteParts] = withoutPercentage.split(/[，,；;]/)
  const notes = noteParts.join('，').trim()
  const origin = findKnownTerm(descriptor, knownOrigins)
  const process = findKnownTerm(descriptor, knownProcesses)
  const variety = findKnownTerm(descriptor, knownVarieties)

  if (!origin && !process && !variety && percentage === null) {
    return {
      origin: '',
      process: '',
      variety: '',
      percentage: null,
      role: '',
      notes: line,
    }
  }

  return {
    origin,
    process,
    variety,
    percentage,
    role: '',
    notes,
  }
}

function parsePercentage(line: string) {
  const match = line.match(/^\s*(\d+(?:\.\d+)?)\s*%?/)

  if (!match) {
    return null
  }

  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

function findKnownTerm(text: string, terms: string[]) {
  return terms.find((term) => text.includes(term)) ?? ''
}

function percentageValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(/%$/, ''))
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function stringValue(value: unknown) {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return ''
}
