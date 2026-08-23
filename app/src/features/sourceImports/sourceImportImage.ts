import type { SourceImportImage } from './sourceImportTypes'

export const MAX_SOURCE_IMPORT_IMAGE_BYTES = 8 * 1024 * 1024

const supportedTypes = new Set<SourceImportImage['mediaType']>([
  'image/jpeg',
  'image/png',
  'image/webp',
])

export function validateSourceImportImage(file: File) {
  if (!supportedTypes.has(file.type as SourceImportImage['mediaType'])) {
    return '图片仅支持 JPEG、PNG 或 WebP 格式。'
  }

  if (file.size > MAX_SOURCE_IMPORT_IMAGE_BYTES) {
    return '图片不能超过 8 MB。'
  }

  return null
}

export async function readSourceImportImage(file: File): Promise<SourceImportImage> {
  const validationError = validateSourceImportImage(file)
  if (validationError) throw new Error(validationError)

  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }

  const mediaType = file.type as SourceImportImage['mediaType']
  return {
    mediaType,
    dataUrl: `data:${mediaType};base64,${btoa(binary)}`,
  }
}
