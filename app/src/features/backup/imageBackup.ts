import { strToU8, zipSync, type Zippable } from 'fflate'
import { sha256Hex } from './backupChecksum'
import type { BackupImageManifestEntry, BackupV2Document } from './backupTypes'

const MAX_IMAGES = 100
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024
const MAX_ARCHIVED_BYTES = 50 * 1024 * 1024
const MAX_CONCURRENCY = 2
const IMAGE_TIMEOUT_MS = 10_000
const ZIP_DATE = new Date('1980-01-01T00:00:00.000Z')
const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const stableErrorCodes = new Set([
  'IMAGE_CANVAS_FAILED', 'IMAGE_COUNT_LIMIT', 'IMAGE_DECODE_FAILED',
  'IMAGE_DEADLINE_BUDGET',
  'IMAGE_HTTP_FAILED', 'IMAGE_MAGIC_MISMATCH', 'IMAGE_NETWORK_FAILED',
  'IMAGE_READ_FAILED', 'IMAGE_REDIRECT_REJECTED', 'IMAGE_TIMEOUT',
  'IMAGE_TOO_LARGE', 'IMAGE_TOTAL_BUDGET_EXCEEDED', 'IMAGE_TYPE_REJECTED',
  'IMAGE_UNKNOWN_FAILED', 'IMAGE_URL_REJECTED',
])

type FetchImage = (input: string, init?: RequestInit) => Promise<Response>
type EncodedImage = { bytes: Uint8Array; mediaType: 'image/webp' }
export type ImageBackupCodec = (
  bytes: Uint8Array,
  mediaType: string,
  signal: AbortSignal,
) => Promise<EncodedImage | null>

export type CompleteBackupOptions = {
  origin?: string
  codec?: ImageBackupCodec
  timeoutMs?: number
}

export async function createCompleteBackup(
  source: BackupV2Document,
  fetchImpl: FetchImage,
  options: CompleteBackupOptions = {},
) {
  const candidates = source.data.beans
    .filter((bean) => typeof bean.image_url === 'string' && bean.image_url.length > 0)
    .map((bean, index) => ({ bean, index }))
  const entries = new Map<string, Uint8Array>()
  const manifest = new Array<BackupImageManifestEntry>(candidates.length)
  const warnings = new Set<string>()
  let archivedBytes = 0
  let cursor = 0

  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENCY, MAX_IMAGES, candidates.length) },
    async () => {
      while (cursor < Math.min(candidates.length, MAX_IMAGES)) {
        const taskIndex = cursor++
        const candidate = candidates[taskIndex]
        const originalUrl = candidate.bean.image_url as string
        try {
          const final = await withDeadline(async (signal) => {
            const collected = await collectImage(originalUrl, fetchImpl, options, signal)
            return encodeImage(collected.bytes, collected.mediaType, signal, options.codec)
          }, options.timeoutMs ?? IMAGE_TIMEOUT_MS)
          if (archivedBytes + final.bytes.length > MAX_ARCHIVED_BYTES) {
            throw imageError('IMAGE_TOTAL_BUDGET_EXCEEDED')
          }
          archivedBytes += final.bytes.length
          const archivePath = await archivePathFor(candidate.bean.id, final.mediaType)
          entries.set(archivePath, final.bytes)
          manifest[taskIndex] = {
            entityType: 'bean', entityId: candidate.bean.id, originalUrl,
            archivePath, mediaType: final.mediaType, byteLength: final.bytes.length,
            checksum: await digestBytes(final.bytes), status: 'included', errorCode: null,
          }
        } catch (error) {
          const code = stableErrorCode(error)
          warnings.add(code)
          manifest[taskIndex] = missingEntry(candidate.bean.id, originalUrl, code)
          if (code === 'IMAGE_TIMEOUT') break
        }
      }
    },
  )
  await Promise.all(workers)

  for (let index = 0; index < Math.min(candidates.length, MAX_IMAGES); index += 1) {
    if (manifest[index]) continue
    const { bean } = candidates[index]
    const code = 'IMAGE_DEADLINE_BUDGET'
    warnings.add(code)
    manifest[index] = missingEntry(bean.id, bean.image_url as string, code)
  }

  for (let index = MAX_IMAGES; index < candidates.length; index += 1) {
    const { bean } = candidates[index]
    const code = 'IMAGE_COUNT_LIMIT'
    warnings.add(code)
    manifest[index] = missingEntry(bean.id, bean.image_url as string, code)
  }

  const document: BackupV2Document = {
    ...source,
    manifest: {
      ...source.manifest,
      backupMode: 'complete',
      checksum: await sha256Hex(source.data),
      images: manifest,
      warnings: [...new Set([...source.manifest.warnings, ...warnings])].sort(),
    },
    data: source.data,
  }
  const zipEntries: Zippable = {
    'backup.json': [strToU8(JSON.stringify(document, null, 2)), { mtime: ZIP_DATE }],
  }
  for (const [path, bytes] of [...entries].sort(([left], [right]) => left.localeCompare(right))) {
    zipEntries[path] = [bytes, { mtime: ZIP_DATE }]
  }
  return { document, zipBytes: zipSync(zipEntries, { level: 6 }) }
}

async function collectImage(
  url: string,
  fetchImpl: FetchImage,
  options: CompleteBackupOptions,
  signal: AbortSignal,
) {
  if (!isAllowedUrl(url, options.origin)) throw imageError('IMAGE_URL_REJECTED')
  try {
    const response = await Promise.race([
      fetchImpl(url, {
        signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'follow',
      }),
      abortPromise(signal),
    ])
    if (response.url && !isAllowedUrl(response.url, options.origin)) {
      throw imageError('IMAGE_REDIRECT_REJECTED')
    }
    if (!response.ok) throw imageError('IMAGE_HTTP_FAILED')
    const mediaType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? ''
    if (!acceptedTypes.has(mediaType)) throw imageError('IMAGE_TYPE_REJECTED')
    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
      throw imageError('IMAGE_TOO_LARGE')
    }
    const bytes = await readBounded(response, MAX_RESPONSE_BYTES, signal)
    if (!matchesMagic(bytes, mediaType)) throw imageError('IMAGE_MAGIC_MISMATCH')
    return { bytes, mediaType }
  } catch (error) {
    if (isImageError(error)) throw error
    throw imageError('IMAGE_NETWORK_FAILED')
  }
}

async function readBounded(response: Response, limit: number, signal: AbortSignal) {
  const reader = response.body?.getReader()
  if (!reader) throw imageError('IMAGE_READ_FAILED')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const result = await Promise.race([reader.read(), abortPromise(signal)])
      if (result.done) break
      length += result.value.length
      if (length > limit) {
        await reader.cancel()
        throw imageError('IMAGE_TOO_LARGE')
      }
      chunks.push(result.value)
    }
  } catch (error) {
    if (isImageError(error)) throw error
    throw imageError('IMAGE_READ_FAILED')
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}

async function encodeImage(bytes: Uint8Array, mediaType: string, signal: AbortSignal, codec = browserCodec) {
  const encoded = await codec(bytes, mediaType, signal)
  if (!encoded || encoded.bytes.length >= bytes.length
    || encoded.mediaType !== 'image/webp'
    || !matchesMagic(encoded.bytes, encoded.mediaType)) return { bytes, mediaType }
  return encoded
}

async function browserCodec(bytes: Uint8Array, mediaType: string, signal: AbortSignal): Promise<EncodedImage | null> {
  throwIfAborted(signal)
  if (typeof createImageBitmap !== 'function') return null
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: mediaType }))
    throwIfAborted(signal)
  } catch {
    throw imageError('IMAGE_DECODE_FAILED')
  }
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height)
      const context = canvas.getContext('2d')
      if (!context) throw imageError('IMAGE_CANVAS_FAILED')
      context.drawImage(bitmap, 0, 0, width, height)
      const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.82 })
      throwIfAborted(signal)
      return { bytes: new Uint8Array(await blob.arrayBuffer()), mediaType: 'image/webp' }
    }
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw imageError('IMAGE_CANVAS_FAILED')
    context.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82))
    throwIfAborted(signal)
    if (!blob) throw imageError('IMAGE_CANVAS_FAILED')
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mediaType: 'image/webp' }
  } catch (error) {
    if (isImageError(error)) throw error
    throw imageError('IMAGE_CANVAS_FAILED')
  } finally {
    bitmap.close()
  }
}

function isAllowedUrl(value: string, origin = globalThis.location?.origin) {
  try {
    const url = new URL(value, origin)
    if (url.username || url.password) return false
    if (url.protocol === 'https:') return true
    return url.protocol === 'http:' && Boolean(origin) && url.origin === new URL(origin).origin
  } catch { return false }
}

function matchesMagic(bytes: Uint8Array, mediaType: string) {
  if (mediaType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mediaType === 'image/png') return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)
  return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
}

function extensionFor(mediaType: string) {
  return mediaType === 'image/jpeg' ? 'jpeg' : mediaType.split('/')[1]
}

async function archivePathFor(entityId: string, mediaType: string) {
  const slug = entityId.toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'item'
  const suffix = (await digestBytes(new TextEncoder().encode(entityId))).slice(0, 8)
  return `images/bean-${slug}-${suffix}.${extensionFor(mediaType)}`
}

async function withDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number) {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const running = operation(controller.signal)
  try {
    return await Promise.race([
      running,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort()
          reject(imageError('IMAGE_TIMEOUT'))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
    controller.abort()
    void running.catch(() => undefined)
  }
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw imageError('IMAGE_TIMEOUT')
}

async function digestBytes(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function missingEntry(entityId: string, originalUrl: string, errorCode: string): BackupImageManifestEntry {
  return { entityType: 'bean', entityId, originalUrl, archivePath: null, mediaType: null, byteLength: 0, checksum: null, status: 'missing', errorCode }
}

function imageError(code: string) { return Object.assign(new Error(code), { code }) }
function isImageError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && typeof (error as { code?: unknown }).code === 'string'
}
function stableErrorCode(error: unknown) {
  const code = isImageError(error) ? error.code : 'IMAGE_UNKNOWN_FAILED'
  return stableErrorCodes.has(code) ? code : 'IMAGE_UNKNOWN_FAILED'
}
function abortPromise(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(imageError('IMAGE_TIMEOUT'))
    else signal.addEventListener('abort', () => reject(imageError('IMAGE_TIMEOUT')), { once: true })
  })
}
