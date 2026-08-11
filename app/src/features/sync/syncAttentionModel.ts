import type { RetryMutationResult } from './syncManager'
import type { SyncMutation } from './syncTypes'

export type SafeLocalSummary = {
  title: string
  facts: string[]
}

export type SafeAttentionItem = {
  title: string
  errorText: string
  errorCode: string | null
  localSummary: SafeLocalSummary | null
}

type LegacyPreview = Extract<
  RetryMutationResult,
  { status: 'confirmation_required' }
>['preview']

const legacyCode = 'LEGACY_CREATE_REQUIRES_CONFIRMATION'

const errorTextByCode: Readonly<Record<string, string>> = {
  [legacyCode]: '这条旧版新增记录可能已经存在于云端，请比较后再决定是否重新上传。',
  INVALID_SYNC_OPERATION: '这条修改的格式无法安全同步。请重试；若持续出现，可放弃并恢复云端版本。',
  LOCAL_SYNC_DATA_CORRUPT: '本地同步数据需要处理。请先导出备份，再决定是否恢复云端版本。',
  SYNC_EPOCH_MISMATCH: '云端数据版本已经变化。请重试以获取最新版本。',
}

const genericErrorText = '同步未完成。请重试；若持续出现，可放弃并恢复云端版本。'

const displayableErrorCodes = new Set([
  legacyCode,
  'INVALID_SYNC_OPERATION',
  'LOCAL_SYNC_DATA_CORRUPT',
  'SYNC_EPOCH_MISMATCH',
  'STALE_SYNC_EPOCH',
  'INVALID_SYNC_RESPONSE',
  'DUPLICATE_SYNC_MUTATION_ID',
  'LOCAL_SYNC_MUTATION_NOT_FOUND',
  'LOCAL_SYNC_MUTATION_STATE_CHANGED',
  'LEGACY_CREATE_CHAIN_CHANGED',
  'SYNC_LOCK_LOST',
])

export function toSafeAttentionItem(item: SyncMutation): SafeAttentionItem {
  const errorCode = safeErrorCode(item.lastErrorCode)
  return {
    title: entityLabel(item.entityType),
    errorText: errorCode === null
      ? genericErrorText
      : errorTextByCode[errorCode] ?? genericErrorText,
    errorCode,
    localSummary: toSafeLocalSummary(item),
  }
}

export function toSafeActionError(error: unknown) {
  const code = safeErrorCode(readErrorCode(error))
  const text = code === 'LOCAL_SYNC_MUTATION_NOT_FOUND' ||
    code === 'LOCAL_SYNC_MUTATION_STATE_CHANGED' ||
    code === 'LEGACY_CREATE_CHAIN_CHANGED'
    ? '这条本地修改已发生变化，请重新查看后再操作。'
    : '操作未完成，请稍后重试。'
  return { text, code }
}

export function attentionItemKey(item: SyncMutation) {
  return [
    item.mutationId,
    item.lastErrorCode ?? '',
    item.status,
    item.attemptCount,
    item.baseSyncEpoch,
    item.entityType,
    item.operation,
    item.queuedAt,
    stableFingerprint(JSON.stringify([
      item.lastErrorMessage,
      item.payload,
    ])),
  ].join('|')
}

export function attentionCollectionKey(items: SyncMutation[]) {
  return items.map(attentionItemKey).sort().join('::')
}

export function createAttentionActionGuard() {
  let generation = 0
  let active = true
  return {
    begin(itemKey: string) {
      generation += 1
      return { generation, itemKey }
    },
    isCurrent(token: { generation: number; itemKey: string }, itemKey: string) {
      return active && token.generation === generation && token.itemKey === itemKey
    },
    invalidate() {
      generation += 1
    },
    stop() {
      active = false
      generation += 1
    },
  }
}

export function buildLegacyComparison(
  preview: LegacyPreview,
  attentionItems: SyncMutation[],
) {
  const relatedIds = new Set(preview.relatedMutationIds)
  relatedIds.add(preview.target.mutationId)
  const related = attentionItems.filter((item) => relatedIds.has(item.mutationId))
  const latestUpsertByEntity = new Map<string, SyncMutation>()
  for (const item of related) {
    if (item.operation === 'upsert') {
      latestUpsertByEntity.set(`${item.entityType}:${item.entityId}`, item)
    }
  }
  const grouped = [...latestUpsertByEntity.values()]
  const localTargets = grouped.flatMap((item) => {
    const summary = toSafeLocalSummary(item)
    return summary === null ? [] : [summary]
  })
  const missingSummary = localTargets.length !== latestUpsertByEntity.size || localTargets.length === 0
  const allLegacyBeans = new Map<string, SyncMutation>()
  for (const item of attentionItems) {
    if (
      item.entityType === 'bean' &&
      item.operation === 'upsert' &&
      item.status === 'needs_attention' &&
      item.lastErrorCode === legacyCode
    ) {
      allLegacyBeans.set(item.entityId, item)
    }
  }
  const beanGroups = [...allLegacyBeans.values()]
  const beanSignatures = beanGroups.flatMap((item) => {
    const summary = toSafeLocalSummary(item)
    return summary === null ? [] : [summarySignature(summary)]
  })
  const beansDistinct = new Set(beanSignatures).size === beanGroups.length
  const canConfirm = !missingSummary && beansDistinct

  return {
    localTargets,
    cloudCandidates: preview.cloudCandidates.flatMap((candidate) => {
      const label = safeText(candidate.label)
      if (label === null) return []
      return [{
        label,
        updatedAt: safeTimestamp(candidate.updatedAt),
        deleted: candidate.deletedAt !== null,
      }]
    }),
    canConfirm,
    blockedReason: canConfirm ? null : '无法安全比较',
  }
}

function toSafeLocalSummary(item: SyncMutation): SafeLocalSummary | null {
  if (item.operation !== 'upsert') return null
  const payload = item.payload as Record<string, unknown>
  switch (item.entityType) {
    case 'bean': {
      const name = safeText(payload.name)
      if (name === null) return null
      return {
        title: name,
        facts: compactFacts([
          ['烘焙商', payload.roaster],
          ['产地', payload.origin],
          ['烘焙日', payload.roast_date],
        ]),
      }
    }
    case 'brewLog': {
      const method = safeText(payload.method)
      const brewedAt = safeText(payload.brewed_at)
      if (method === null || brewedAt === null) return null
      return {
        title: method,
        facts: [
          `冲煮时间：${brewedAt}`,
          `关联咖啡豆：${typeof payload.bean_id === 'string' && payload.bean_id ? '已关联' : '未关联'}`,
        ],
      }
    }
    case 'brewTemplate': {
      const name = safeText(payload.name)
      return name === null ? null : { title: name, facts: [] }
    }
    case 'userSettings': {
      const units = isRecord(payload.preferred_units)
        ? payload.preferred_units
        : null
      if (units === null) return null
      const facts = ['weight', 'temperature', 'volume'].flatMap((key) => {
        const value = safeText(units[key])
        return value === null ? [] : [`${unitLabel(key)}：${value}`]
      })
      return facts.length === 0 ? null : { title: '偏好单位', facts }
    }
  }
}

function compactFacts(entries: Array<[string, unknown]>) {
  return entries.flatMap(([label, value]) => {
    const text = safeText(value)
    return text === null ? [] : [`${label}：${text}`]
  })
}

function safeText(value: unknown) {
  if (typeof value !== 'string') return null
  const text = [...value]
    .map((character) => {
      const code = character.charCodeAt(0)
      return code <= 31 || code === 127 ? ' ' : character
    })
    .join('')
    .trim()
    .slice(0, 100)
  return text || null
}

function safeTimestamp(value: string) {
  return Number.isNaN(Date.parse(value)) ? '时间待确认' : value
}

function safeErrorCode(value: string | null) {
  return value !== null && displayableErrorCodes.has(value) ? value : null
}

function readErrorCode(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null
  return typeof error.code === 'string' ? error.code : null
}

function summarySignature(summary: SafeLocalSummary) {
  return `${summary.title}\u0000${summary.facts.join('\u0000')}`
}

function stableFingerprint(value: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function entityLabel(entityType: SyncMutation['entityType']) {
  return {
    bean: '咖啡豆',
    brewLog: '冲煮记录',
    brewTemplate: '冲煮模板',
    userSettings: '个人设置',
  }[entityType]
}

function unitLabel(key: string) {
  return ({ weight: '重量', temperature: '温度', volume: '容量' } as Record<string, string>)[key]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
