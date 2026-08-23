import type { BeanBlendComponent, BeanForm, BeanType } from '../beans/beanTypes'
import type { JsonObject } from '../../lib/jsonTypes'

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
  beanType: BeanType
  blendComponents: BeanBlendComponent[]
  blendNotes: string
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

export type SourceImportImage = {
  dataUrl: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
}

export type SourceImportRequest = {
  pastedText: string
  image?: SourceImportImage
}

export type SourceImportRecordInput = {
  userId: string
  sourceUrl: string
  status: 'draft' | 'saved' | 'failed'
  extractedPayload: SourceImportResponse | SourceImportDraft | Record<string, unknown>
  selectedPayload?: BeanForm | Record<string, unknown>
  errorMessage?: string | null
}

export type SourceImportRow = {
  id: string
  user_id: string
  source_url: string
  source_type: string
  status: 'draft' | 'saved' | 'failed'
  extracted_payload: JsonObject
  selected_payload: JsonObject
  error_message: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  schema_version: number
}
