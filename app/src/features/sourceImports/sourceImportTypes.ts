import type { BeanForm } from '../beans/beanTypes'

export type SourceImportConfidence = 'low' | 'medium' | 'high' | ''

export type SourceImportDraft = {
  name: string
  roaster: string
  origin: string
  farmOrStation: string
  process: string
  variety: string
  altitudeMeters: number | null
  roastDate: string
  roastLevel: string
  flavorTags: string[]
  flavorNotes: string
  netWeightGrams: number | null
  price: number | null
  sourceUrl: string
  notes: string
  confidence: SourceImportConfidence
  missingFields: string[]
}

export type SourceImportResponse = {
  configured: boolean
  sourceUrl: string
  draft: SourceImportDraft | null
  rawTextLength?: number
  error?: string
}

export type SourceImportRecordInput = {
  userId: string
  sourceUrl: string
  status: 'draft' | 'saved' | 'failed'
  extractedPayload: SourceImportResponse | SourceImportDraft | Record<string, unknown>
  selectedPayload?: BeanForm | Record<string, unknown>
  errorMessage?: string | null
}
