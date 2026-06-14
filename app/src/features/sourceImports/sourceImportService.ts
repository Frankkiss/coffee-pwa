import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeSourceImportDraft } from './sourceImportMapping'
import type {
  SourceImportRequest,
  SourceImportRecordInput,
  SourceImportResponse,
} from './sourceImportTypes'

export async function requestSourceImport(
  supabase: SupabaseClient,
  input: SourceImportRequest,
): Promise<SourceImportResponse> {
  const { data, error } = await supabase.functions.invoke('import-source', {
    body: input,
  })

  if (error) {
    return {
      configured: false,
      sourceUrl: input.url,
      draft: null,
      error: error.message,
    }
  }

  const response = data as SourceImportResponse

  return {
    ...response,
    sourceUrl: response.sourceUrl || input.url,
    draft: response.draft ? normalizeSourceImportDraft(response.draft) : null,
  }
}

export async function recordSourceImport(
  supabase: SupabaseClient,
  input: SourceImportRecordInput,
) {
  const { data, error } = await supabase
    .from('source_imports')
    .insert({
      user_id: input.userId,
      source_url: input.sourceUrl,
      source_type: 'single_url',
      status: input.status,
      extracted_payload: input.extractedPayload,
      selected_payload: input.selectedPayload ?? {},
      error_message: input.errorMessage ?? null,
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}
