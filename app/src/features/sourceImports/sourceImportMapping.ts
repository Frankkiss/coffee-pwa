import { createInitialBeanForm } from '../beans/beanForm'
import type { BeanForm } from '../beans/beanTypes'
import type { SourceImportConfidence, SourceImportDraft } from './sourceImportTypes'

export function normalizeSourceImportDraft(input: unknown): SourceImportDraft {
  const record = isRecord(input) ? input : {}

  return {
    name: stringValue(record.name),
    roaster: stringValue(record.roaster),
    origin: stringValue(record.origin),
    farmOrStation: stringValue(record.farmOrStation ?? record.farm_or_station),
    process: stringValue(record.process),
    variety: stringValue(record.variety),
    altitudeMeters: numberValue(record.altitudeMeters ?? record.altitude_meters),
    roastDate: stringValue(record.roastDate ?? record.roast_date),
    roastLevel: stringValue(record.roastLevel ?? record.roast_level),
    flavorTags: listValue(record.flavorTags ?? record.flavor_tags),
    flavorNotes: stringValue(record.flavorNotes ?? record.flavor_notes),
    netWeightGrams: numberValue(record.netWeightGrams ?? record.net_weight_grams),
    price: numberValue(record.price),
    sourceUrl: stringValue(record.sourceUrl ?? record.source_url),
    notes: stringValue(record.notes),
    confidence: confidenceValue(record.confidence),
    missingFields: listValue(record.missingFields ?? record.missing_fields),
  }
}

export function createBeanFormFromSourceDraft(draft: SourceImportDraft): BeanForm {
  return {
    ...createInitialBeanForm(),
    name: draft.name,
    roaster: draft.roaster,
    origin: draft.origin,
    farmOrStation: draft.farmOrStation,
    process: draft.process,
    variety: draft.variety,
    altitudeMeters: numberToFormValue(draft.altitudeMeters),
    roastDate: draft.roastDate,
    roastLevel: draft.roastLevel,
    flavorTags: draft.flavorTags.join(', '),
    flavorNotes: draft.flavorNotes,
    netWeightGrams: numberToFormValue(draft.netWeightGrams),
    price: numberToFormValue(draft.price),
    sourceUrl: draft.sourceUrl,
    notes: draft.notes,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function numberToFormValue(value: number | null) {
  return value === null ? '' : String(value)
}

function listValue(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,，、]/) : []
  const normalized = values.map(stringValue).filter(Boolean)

  return Array.from(new Set(normalized))
}

function confidenceValue(value: unknown): SourceImportConfidence {
  const normalized = stringValue(value).toLowerCase()

  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
    return normalized
  }

  return ''
}
