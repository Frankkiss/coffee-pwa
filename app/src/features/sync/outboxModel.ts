import {
  createDeletePayload,
  type SyncMutation,
  type SyncState,
} from './syncTypes'

const RETRY_BASE_DELAY_MS = 1_000
const RETRY_MAX_DELAY_MS = 60_000

const entityPriority: Record<SyncMutation['entityType'], number> = {
  bean: 0,
  brewTemplate: 1,
  userSettings: 1,
  brewLog: 2,
}

type IndexedMutation = {
  index: number
  mutation: SyncMutation
}

export type SendableMutationSelection = {
  mutation: SyncMutation
  coveredMutationIds: string[]
}

type IndexedSelection = SendableMutationSelection & { index: number }

type ParsedTimestamp = {
  wholeSecond: number
  fraction: string
}

const rfc3339Pattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/

export function compactMutations(mutations: SyncMutation[]): SyncMutation[] {
  return compactMutationSelections(mutations).map((item) => item.mutation)
}

export function orderMutations(mutations: SyncMutation[]): SyncMutation[] {
  return orderPendingEntries(
    mutations.map((mutation, index) => ({ index, mutation })),
  ).map((item) => cloneMutation(item.mutation))
}

export function selectSendableMutationBatch(
  mutations: SyncMutation[],
): SendableMutationSelection[] {
  return orderPendingEntries(
    selectUnblockedPending(compactMutationSelections(mutations)),
  ).map((item) => ({
    mutation: cloneMutation(item.mutation),
    coveredMutationIds: [...item.coveredMutationIds],
  }))
}

export function selectSendableMutations(
  mutations: SyncMutation[],
): SyncMutation[] {
  return selectSendableMutationBatch(mutations).map((item) => item.mutation)
}

export function nextRetryDelayMs(attemptCount: number): number {
  if (attemptCount === Number.POSITIVE_INFINITY) {
    return RETRY_MAX_DELAY_MS
  }

  const normalizedAttempt = Number.isFinite(attemptCount)
    ? Math.max(1, Math.floor(attemptCount))
    : 1
  if (normalizedAttempt >= 7) {
    return RETRY_MAX_DELAY_MS
  }

  return Math.min(
    RETRY_BASE_DELAY_MS * 2 ** (normalizedAttempt - 1),
    RETRY_MAX_DELAY_MS,
  )
}

export function isRetryableSyncError(error: unknown): boolean {
  const retryable = readProperty(error, 'retryable')
  if (typeof retryable === 'boolean') {
    return retryable
  }

  const status = readProperty(error, 'status')
  const numericStatus = typeof status === 'number' ? status : Number.NaN
  const code = stringProperty(error, 'code').toUpperCase()
  const name = stringProperty(error, 'name').toUpperCase()
  const message = stringProperty(error, 'message').toUpperCase()
  const classification = `${code} ${name} ${message}`

  if (
    Number.isFinite(numericStatus) &&
    numericStatus >= 400 &&
    numericStatus <= 499 &&
    numericStatus !== 408 &&
    numericStatus !== 429
  ) {
    return false
  }

  if (
    numericStatus === 408 ||
    numericStatus === 429 ||
    (Number.isFinite(numericStatus) &&
      numericStatus >= 500 &&
      numericStatus <= 599)
  ) {
    return true
  }

  if (
    /^(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|EAI_AGAIN)$/.test(
      code,
    ) ||
    name === 'NETWORKERROR' ||
    name === 'TIMEOUTERROR'
  ) {
    return true
  }

  if (
    /FAILED TO FETCH|FETCH FAILED|NETWORK REQUEST FAILED|NETWORK ?ERROR|LOAD FAILED|TIMED? ?OUT|CONNECTION (RESET|REFUSED)/.test(
      message,
    )
  ) {
    return true
  }

  if (
    /VALIDAT|UNAUTHORIZED|FORBIDDEN|AUTH|JWT|STALE|CORRUPT|INTEGRITY|MALFORMED/.test(
      classification,
    )
  ) {
    return false
  }

  return false
}

export function deriveSyncState(input: {
  online: boolean
  running: boolean
  mutations: SyncMutation[]
  lastSyncedAt: string | null
  retryMessage: string | null
}): SyncState {
  const attentionCount = input.mutations.filter(
    (mutation) => mutation.status === 'needs_attention',
  ).length
  const pendingCount = input.mutations.length - attentionCount

  if (attentionCount > 0) {
    return { kind: 'needs_attention', pendingCount, attentionCount }
  }
  if (input.running) {
    return { kind: 'syncing', pendingCount }
  }
  if (!input.online) {
    return { kind: 'offline', pendingCount }
  }
  if (input.retryMessage !== null) {
    return {
      kind: 'retrying',
      pendingCount,
      message: input.retryMessage,
    }
  }
  if (pendingCount === 0 && input.lastSyncedAt !== null) {
    return { kind: 'synced', lastSyncedAt: input.lastSyncedAt }
  }

  return {
    kind: 'retrying',
    pendingCount,
    message: pendingCount > 0 ? '等待同步' : '尚未完成首次同步',
  }
}

function compactMutationSelections(
  mutations: SyncMutation[],
): IndexedSelection[] {
  const pendingGroups = new Map<string, IndexedMutation[]>()
  const retained: IndexedSelection[] = []

  const flushPendingGroup = (key: string) => {
    const group = pendingGroups.get(key)
    if (!group) {
      return
    }
    retained.push(...compactPendingGroup(group))
    pendingGroups.delete(key)
  }

  const flushAllPendingGroups = () => {
    for (const key of [...pendingGroups.keys()]) {
      flushPendingGroup(key)
    }
  }

  mutations.forEach((mutation, index) => {
    const key = entityKey(mutation)
    if (mutation.status !== 'pending') {
      flushAllPendingGroups()
      retained.push({
        index,
        mutation: cloneMutation(mutation),
        coveredMutationIds: [mutation.mutationId],
      })
      return
    }

    const group = pendingGroups.get(key)
    const item = { index, mutation }
    if (group) {
      group.push(item)
    } else {
      pendingGroups.set(key, [item])
    }
  })

  flushAllPendingGroups()

  return retained.sort((left, right) => left.index - right.index)
}

function selectUnblockedPending(
  selections: IndexedSelection[],
): IndexedSelection[] {
  const blocked = new Set<IndexedSelection>(
    selections.filter((item) => item.mutation.status !== 'pending'),
  )

  let changed = true
  while (changed) {
    changed = false
    const blockedEntityKeys = new Set(
      [...blocked].map((item) => entityKey(item.mutation)),
    )
    const blockedBeanIds = new Set(
      [...blocked]
        .filter((item) => item.mutation.entityType === 'bean')
        .map((item) => item.mutation.entityId),
    )
    const blockedBrewBeanIds = new Set(
      [...blocked]
        .map((item) => referencedBeanId(item.mutation))
        .filter((beanId): beanId is string => beanId !== null),
    )

    for (const selection of selections) {
      if (blocked.has(selection)) {
        continue
      }
      const mutation = selection.mutation
      const beanId = referencedBeanId(mutation)
      const dependsOnBlocked =
        blockedEntityKeys.has(entityKey(mutation)) ||
        (beanId !== null && blockedBeanIds.has(beanId)) ||
        (mutation.entityType === 'bean' &&
          mutation.operation === 'delete' &&
          blockedBrewBeanIds.has(mutation.entityId))
      if (dependsOnBlocked) {
        blocked.add(selection)
        changed = true
      }
    }
  }

  return selections.filter(
    (item) => item.mutation.status === 'pending' && !blocked.has(item),
  )
}

function compactPendingGroup(
  group: IndexedMutation[],
): IndexedSelection[] {
  const last = group[group.length - 1]
  let latestUpsertIndex = -1
  for (let index = group.length - 1; index >= 0; index -= 1) {
    if (group[index].mutation.operation === 'upsert') {
      latestUpsertIndex = index
      break
    }
  }

  if (latestUpsertIndex === -1) {
    return [selection(last, group)]
  }

  const latestUpsert = group[latestUpsertIndex]
  const upsertSelection = selection(
    latestUpsert,
    group.slice(0, latestUpsertIndex + 1),
  )
  if (last.mutation.operation === 'upsert') {
    return [upsertSelection]
  }

  return [
    upsertSelection,
    selection(last, group.slice(latestUpsertIndex + 1)),
  ]
}

function selection(
  selected: IndexedMutation,
  covered: IndexedMutation[],
): IndexedSelection {
  return {
    index: selected.index,
    mutation: cloneMutation(selected.mutation),
    coveredMutationIds: covered.map((item) => item.mutation.mutationId),
  }
}

function orderPendingEntries<Entry extends IndexedMutation>(
  entries: Entry[],
): Entry[] {
  const entriesByUser = new Map<string, Entry[]>()
  for (const entry of entries) {
    const userEntries = entriesByUser.get(entry.mutation.userId)
    if (userEntries) {
      userEntries.push(entry)
    } else {
      entriesByUser.set(entry.mutation.userId, [entry])
    }
  }

  return [...entriesByUser.values()].flatMap((userEntries) =>
    stableTopologicalOrder(userEntries),
  )
}

function stableTopologicalOrder<Entry extends IndexedMutation>(
  entries: Entry[],
): Entry[] {
  const adjacency = new Map<Entry, Set<Entry>>()
  const indegree = new Map<Entry, number>()
  const entriesByEntity = new Map<string, Entry[]>()

  for (const entry of entries) {
    adjacency.set(entry, new Set())
    indegree.set(entry, 0)
    const key = entityKey(entry.mutation)
    const entityEntries = entriesByEntity.get(key)
    if (entityEntries) {
      entityEntries.push(entry)
    } else {
      entriesByEntity.set(key, [entry])
    }
  }

  for (const entityEntries of entriesByEntity.values()) {
    for (let index = 1; index < entityEntries.length; index += 1) {
      addDependency(
        entityEntries[index - 1],
        entityEntries[index],
        adjacency,
        indegree,
      )
    }
  }

  const beanMutationsById = new Map<string, Entry[]>()
  for (const entry of entries) {
    if (entry.mutation.entityType === 'bean') {
      const beanMutations = beanMutationsById.get(entry.mutation.entityId)
      if (beanMutations) {
        beanMutations.push(entry)
      } else {
        beanMutationsById.set(entry.mutation.entityId, [entry])
      }
    }
  }

  for (const entry of entries) {
    const beanId = referencedBeanId(entry.mutation)
    if (beanId === null) {
      continue
    }
    const beanMutations = beanMutationsById.get(beanId) ?? []
    const latestPriorBeanMutation = beanMutations
      .filter((beanMutation) => beanMutation.index < entry.index)
      .at(-1)
    if (latestPriorBeanMutation?.mutation.operation === 'upsert') {
      addDependency(
        latestPriorBeanMutation,
        entry,
        adjacency,
        indegree,
      )
    }
    for (const beanMutation of beanMutations) {
      if (
        beanMutation.mutation.operation === 'delete' &&
        beanMutation.index > entry.index
      ) {
        addDependency(entry, beanMutation, adjacency, indegree)
      }
    }
  }

  const available = entries
    .filter((entry) => indegree.get(entry) === 0)
    .sort(comparePendingEntries)
  const ordered: Entry[] = []

  while (available.length > 0) {
    const entry = available.shift()
    if (!entry) {
      break
    }
    ordered.push(entry)

    for (const dependent of adjacency.get(entry) ?? []) {
      const remaining = (indegree.get(dependent) ?? 0) - 1
      indegree.set(dependent, remaining)
      if (remaining === 0) {
        available.push(dependent)
        available.sort(comparePendingEntries)
      }
    }
  }

  if (ordered.length !== entries.length) {
    throw new Error('Sync mutation dependency cycle')
  }
  return ordered
}

function addDependency<Entry extends IndexedMutation>(
  prerequisite: Entry,
  dependent: Entry,
  adjacency: Map<Entry, Set<Entry>>,
  indegree: Map<Entry, number>,
) {
  const dependents = adjacency.get(prerequisite)
  if (!dependents || dependents.has(dependent)) {
    return
  }
  dependents.add(dependent)
  indegree.set(dependent, (indegree.get(dependent) ?? 0) + 1)
}

function comparePendingEntries(
  left: IndexedMutation,
  right: IndexedMutation,
): number {
  const timeDifference = compareRfc3339(
    left.mutation.queuedAt,
    right.mutation.queuedAt,
  )
  if (timeDifference !== 0) {
    return timeDifference
  }

  const priorityDifference =
    entityPriority[left.mutation.entityType] -
    entityPriority[right.mutation.entityType]
  if (priorityDifference !== 0) {
    return priorityDifference
  }

  return (
    compareStrings(left.mutation.mutationId, right.mutation.mutationId) ||
    left.index - right.index
  )
}

function referencedBeanId(mutation: SyncMutation): string | null {
  if (mutation.entityType !== 'brewLog' || mutation.operation !== 'upsert') {
    return null
  }
  const beanId = readProperty(mutation.payload, 'bean_id')
  return typeof beanId === 'string' ? beanId : null
}

function cloneMutation(mutation: SyncMutation): SyncMutation {
  if (mutation.operation === 'delete') {
    return {
      ...mutation,
      payload: createDeletePayload(),
    }
  }

  return structuredClone(mutation)
}

function entityKey(mutation: SyncMutation): string {
  return JSON.stringify([
    mutation.userId,
    mutation.entityType,
    mutation.entityId,
  ])
}

function compareRfc3339(left: string, right: string): number {
  const parsedLeft = parseRfc3339(left)
  const parsedRight = parseRfc3339(right)
  if (!parsedLeft || !parsedRight) {
    return compareStrings(left, right)
  }

  const wholeSecondDifference =
    parsedLeft.wholeSecond - parsedRight.wholeSecond
  if (wholeSecondDifference !== 0) {
    return wholeSecondDifference
  }

  const fractionLength = Math.max(
    parsedLeft.fraction.length,
    parsedRight.fraction.length,
  )
  return compareStrings(
    parsedLeft.fraction.padEnd(fractionLength, '0'),
    parsedRight.fraction.padEnd(fractionLength, '0'),
  )
}

function parseRfc3339(value: string): ParsedTimestamp | null {
  const match = rfc3339Pattern.exec(value)
  if (!match) {
    return null
  }

  const [, year, month, day, hour, minute, second, fraction = '', zone] =
    match
  const utcWholeSecond =
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ) / 1_000
  const offsetSeconds =
    zone === 'Z'
      ? 0
      : (match[9] === '+' ? 1 : -1) *
        (Number(match[10]) * 60 + Number(match[11])) *
        60

  return {
    wholeSecond: utcWholeSecond - offsetSeconds,
    fraction,
  }
}

function compareStrings(left: string, right: string): number {
  if (left === right) {
    return 0
  }
  return left < right ? -1 : 1
}

function readProperty(value: unknown, key: string): unknown {
  if (
    (typeof value !== 'object' || value === null) &&
    typeof value !== 'function'
  ) {
    return undefined
  }

  try {
    return Reflect.get(value, key)
  } catch {
    return undefined
  }
}

function stringProperty(value: unknown, key: string): string {
  const property = readProperty(value, key)
  return typeof property === 'string' ? property : ''
}
