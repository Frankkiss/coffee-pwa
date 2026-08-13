import { unzipSync, strFromU8 } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import { sha256Hex } from './backupChecksum'
import { createCompleteBackup } from './imageBackup'
import type { BackupV2Document } from './backupTypes'

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 20 }, (_, index) => index)])
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])

describe('complete image backup', () => {
  it('keeps data unchanged, includes a verified image, and creates a deterministic ZIP', async () => {
    const document = await backupWithImages(['https://img.example/bag.jpg'])
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow' })
      return streamedResponse(jpeg, 'image/jpeg', 'https://cdn.example/final.jpg')
    })
    const codec = vi.fn(async () => ({ bytes: new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]), mediaType: 'image/webp' as const }))

    const first = await createCompleteBackup(document, fetchImpl, { codec })
    const second = await createCompleteBackup(document, fetchImpl, { codec })
    const files = unzipSync(first.zipBytes)
    const archivePath = first.document.manifest.images[0].archivePath as string
    const archived = files[archivePath]
    const backup = JSON.parse(strFromU8(files['backup.json'])) as BackupV2Document

    expect(first.document.data).toBe(document.data)
    expect(first.document.manifest.backupMode).toBe('complete')
    expect(first.document.manifest.checksum).toBe(await sha256Hex(document.data))
    expect(first.document.manifest.images[0]).toMatchObject({
      entityId: 'bean-1', archivePath, status: 'included',
      mediaType: 'image/webp', byteLength: archived.length,
    })
    expect(first.document.manifest.images[0].checksum).toBe(await digestBytes(archived))
    expect(backup).toEqual(first.document)
    expect(first.zipBytes).toEqual(second.zipBytes)
  })

  it.each([
    ['network', async () => { throw new TypeError('network') }, 'IMAGE_NETWORK_FAILED'],
    ['bad type', async () => streamedResponse(jpeg, 'text/html'), 'IMAGE_TYPE_REJECTED'],
    ['magic mismatch', async () => streamedResponse(png, 'image/jpeg'), 'IMAGE_MAGIC_MISMATCH'],
  ])('keeps backup.json when an image has a %s failure', async (_label, fetchImpl, code) => {
    const result = await createCompleteBackup(
      await backupWithImages(['https://img.example/a.jpg']), fetchImpl,
    )
    expect(Object.keys(unzipSync(result.zipBytes))).toEqual(['backup.json'])
    expect(result.document.manifest.images[0]).toMatchObject({ status: 'missing', errorCode: code, archivePath: null })
    expect(result.document.manifest.warnings).toContain(code)
  })

  it('enforces the byte limit while streaming and cancels the reader', async () => {
    let cancelled = false
    let pulls = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        controller.enqueue(new Uint8Array(3 * 1024 * 1024).fill(pulls === 1 ? 0xff : 1))
      },
      cancel() { cancelled = true },
    })
    const result = await createCompleteBackup(await backupWithImages(['https://img.example/a.jpg']), async () =>
      new Response(body, { headers: { 'content-type': 'image/jpeg' } }))
    expect(result.document.manifest.images[0].errorCode).toBe('IMAGE_TOO_LARGE')
    expect(cancelled).toBe(true)
    expect(pulls).toBeLessThanOrEqual(3)
  })

  it('times out a stalled request with a stable code', async () => {
    const result = await createCompleteBackup(
      await backupWithImages(['https://img.example/a.jpg']),
      async () => new Promise<Response>(() => undefined),
      { timeoutMs: 5 },
    )
    expect(result.document.manifest.images[0].errorCode).toBe('IMAGE_TIMEOUT')
    expect(unzipSync(result.zipBytes)['backup.json']).toBeDefined()
  })

  it('applies the per-image deadline to a stalled codec', async () => {
    const result = await createCompleteBackup(
      await backupWithImages(['https://img.example/a.jpg']),
      async () => streamedResponse(jpeg, 'image/jpeg'),
      { timeoutMs: 5, codec: async () => new Promise(() => undefined) },
    )
    expect(result.document.manifest.images[0].errorCode).toBe('IMAGE_TIMEOUT')
  })

  it('does not expand stalled codec work after the two workers time out', async () => {
    let started = 0
    let active = 0
    let maxActive = 0
    const result = await createCompleteBackup(
      await backupWithImages(Array.from({ length: 20 }, (_, index) => `https://img.example/${index}.jpg`)),
      async () => streamedResponse(jpeg, 'image/jpeg'),
      {
        timeoutMs: 5,
        codec: async (_bytes, _type, signal) => {
          started += 1
          active += 1
          maxActive = Math.max(maxActive, active)
          await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
          active -= 1
          return null
        },
      },
    )
    expect(started).toBe(2)
    expect(maxActive).toBe(2)
    expect(active).toBe(0)
    expect(result.document.manifest.images.filter((item) => item.errorCode === 'IMAGE_TIMEOUT')).toHaveLength(2)
    expect(result.document.manifest.images.filter((item) => item.errorCode === 'IMAGE_DEADLINE_BUDGET')).toHaveLength(18)
  })

  it('sorts warning codes independently of concurrent completion order', async () => {
    const document = await backupWithImages(['https://img.example/slow.jpg', 'https://img.example/fast.jpg'])
    const run = async (reverse: boolean) => createCompleteBackup(document, async (url) => {
      await new Promise((resolve) => setTimeout(resolve, url.includes(reverse ? 'fast' : 'slow') ? 4 : 0))
      return url.includes('slow')
        ? streamedResponse(jpeg, 'text/html')
        : streamedResponse(png, 'image/jpeg')
    })
    const first = await run(false)
    const second = await run(true)
    expect(first.document.manifest.warnings).toEqual(['IMAGE_MAGIC_MISMATCH', 'IMAGE_TYPE_REJECTED'])
    expect(first.zipBytes).toEqual(second.zipBytes)
  })

  it('rejects unsafe initial and redirected URLs without leaking credentials', async () => {
    const fetchImpl = vi.fn(async () => streamedResponse(jpeg, 'image/jpeg', 'http://other.example/a.jpg'))
    const result = await createCompleteBackup(
      await backupWithImages(['http://other.example/a.jpg', 'https://img.example/b.jpg']),
      fetchImpl,
      { origin: 'http://coffee.example' },
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(result.document.manifest.images.map((item) => item.errorCode)).toEqual([
      'IMAGE_URL_REJECTED', 'IMAGE_REDIRECT_REJECTED',
    ])
  })

  it('limits collection to 100 images and uses collision-safe archive names', async () => {
    const urls = Array.from({ length: 102 }, (_, index) => `https://img.example/${index}.jpg`)
    const result = await createCompleteBackup(await backupWithImages(urls), async () => streamedResponse(jpeg, 'image/jpeg'))
    expect(result.document.manifest.images).toHaveLength(102)
    expect(result.document.manifest.images.filter((item) => item.status === 'included')).toHaveLength(100)
    expect(result.document.manifest.images.at(-1)?.errorCode).toBe('IMAGE_COUNT_LIMIT')
    const paths = result.document.manifest.images.flatMap((item) => item.archivePath ?? [])
    expect(new Set(paths).size).toBe(paths.length)
    expect(paths.every((path) => /^images\/bean-[a-z0-9_-]+-[0-9a-f]{8}\.(jpeg|png|webp)$/.test(path))).toBe(true)
  })

  it('derives stable safe paths from entity IDs and resolves normalized collisions', async () => {
    const document = await backupWithImages(['https://img.example/a.jpg', 'https://img.example/b.jpg'])
    document.data.beans[0].id = '../Bean A'
    document.data.beans[1].id = '..\\bean a'
    const result = await createCompleteBackup(document, async () => streamedResponse(jpeg, 'image/jpeg'))
    const archivePaths = result.document.manifest.images.map((item) => item.archivePath as string)
    expect(archivePaths[0]).not.toBe(archivePaths[1])
    expect(archivePaths.every((path) => !path.includes('..') && !path.includes('\\'))).toBe(true)
  })

  it('retains the original when a codec claims WebP but returns other bytes', async () => {
    const result = await createCompleteBackup(await backupWithImages(['https://img.example/a.jpg']), async () => streamedResponse(jpeg, 'image/jpeg'), {
      codec: async () => ({ bytes: png, mediaType: 'image/webp' }),
    })
    expect(result.document.manifest.images[0]).toMatchObject({ mediaType: 'image/jpeg' })
  })

  it('retains validated original bytes when codec is unavailable or produces a larger file', async () => {
    const document = await backupWithImages(['https://img.example/a.jpg', 'https://img.example/b.jpg'])
    let call = 0
    const result = await createCompleteBackup(document, async () => streamedResponse(jpeg, 'image/jpeg'), {
      codec: async () => ++call === 1 ? null : { bytes: new Uint8Array(100), mediaType: 'image/webp' },
    })
    expect(result.document.manifest.images.map((item) => item.mediaType)).toEqual(['image/jpeg', 'image/jpeg'])
  })

  it.each([
    ['IMAGE_DECODE_FAILED'], ['IMAGE_CANVAS_FAILED'],
  ])('records stable codec failure %s without blocking the logical backup', async (code) => {
    const result = await createCompleteBackup(await backupWithImages(['https://img.example/a.jpg']), async () => streamedResponse(jpeg, 'image/jpeg'), {
      codec: async () => { throw Object.assign(new Error('private detail'), { code }) },
    })
    expect(result.document.manifest.images[0].errorCode).toBe(code)
    expect(unzipSync(result.zipBytes)['backup.json']).toBeDefined()
  })
})

async function backupWithImages(urls: string[]): Promise<BackupV2Document> {
  const beans = urls.map((image_url, index) => ({
    id: `bean-${index + 1}`, user_id: 'user-1', name: `Bean ${index}`, roaster: null,
    origin: null, farm_or_station: null, process: null, variety: null,
    altitude_meters: null, roast_date: null, roast_level: null, flavor_tags: [],
    flavor_notes: null, net_weight_grams: null, price: null, purchase_date: null,
    source_url: null, image_url, notes: null, created_at: '2026-08-12T00:00:00Z',
    updated_at: '2026-08-12T00:00:00Z', deleted_at: null, schema_version: 1,
  }))
  const data = { profile: null, userSettings: null, beans, brewLogs: [], brewTemplates: [], aiRecommendations: [], sourceImports: [] }
  return { schemaVersion: 2, manifest: { exportedAt: '2026-08-12T00:00:00Z', appVersion: '1.0.0', backupMode: 'lightweight', recordCounts: { profile: 0, userSettings: 0, beans: beans.length, brewLogs: 0, brewTemplates: 0, aiRecommendations: 0, sourceImports: 0 }, checksumAlgorithm: 'SHA-256', checksum: await sha256Hex(data), images: [], warnings: [] }, data }
}

function streamedResponse(bytes: Uint8Array, type: string, url = '') {
  const response = new Response(new Blob([bytes as BlobPart]), { headers: { 'content-type': type } })
  if (url) Object.defineProperty(response, 'url', { value: url })
  return response
}

async function digestBytes(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
