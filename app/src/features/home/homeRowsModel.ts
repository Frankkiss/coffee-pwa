import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'

export type HomeRows = {
  beans: Bean[]
  brewLogs: BrewLog[]
}

export type OwnedHomeRows = {
  ownerId: string | null
  rows: HomeRows
}

const emptyHomeRows: HomeRows = { beans: [], brewLogs: [] }

export function createOwnedHomeRows(
  ownerId: string | null,
  rows: HomeRows = emptyHomeRows,
): OwnedHomeRows {
  return { ownerId, rows }
}

export function selectHomeRowsForOwner(
  value: OwnedHomeRows,
  ownerId: string,
): HomeRows {
  return value.ownerId === ownerId ? value.rows : emptyHomeRows
}
