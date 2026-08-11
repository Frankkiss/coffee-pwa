import { describe, expect, it } from 'vitest'
import type { BackupV2Document } from './backupTypes'
import {
  canonicalJson,
  sha256Hex,
  verifyBackupChecksum,
} from './backupChecksum'

describe('backup checksum', () => {
  it('sorts object keys recursively without changing array order', async () => {
    const left = {
      beans: [{ id: 'b', tags: ['x', 'y'] }],
      settings: { z: 1, a: 2 },
    }
    const right = {
      settings: { a: 2, z: 1 },
      beans: [{ tags: ['x', 'y'], id: 'b' }],
    }
    const reversedArray = {
      settings: { a: 2, z: 1 },
      beans: [{ tags: ['y', 'x'], id: 'b' }],
    }

    expect(canonicalJson(left)).toBe(canonicalJson(right))
    expect(canonicalJson(left)).not.toBe(canonicalJson(reversedArray))
    expect(await sha256Hex(left)).toBe(await sha256Hex(right))
  })

  it('encodes protocol JSON deterministically without insignificant whitespace', () => {
    expect(canonicalJson({ z: null, a: '咖啡', n: -0, nested: { b: true, a: 1.5 } })).toBe(
      '{"a":"咖啡","n":0,"nested":{"a":1.5,"b":true},"z":null}',
    )
  })

  it.each([
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['negative infinity', Number.NEGATIVE_INFINITY],
    ['undefined', undefined],
    ['function', () => undefined],
    ['symbol', Symbol('unsupported')],
    ['bigint', 1n],
    ['Date', new Date('2026-08-08T00:00:00.000Z')],
    ['Map', new Map([['key', 'value']])],
    ['Set', new Set(['value'])],
    ['typed array', new Uint8Array([1, 2])],
  ])('rejects unsupported %s values', (_label, value) => {
    expect(() => canonicalJson(value)).toThrow(/protocol JSON/i)
  })

  it('rejects unsupported nested values, sparse arrays, symbol keys, and cycles', () => {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    const symbolKey = Symbol('hidden')
    const sparseArray = new Array<unknown>(2)
    sparseArray[1] = 'value'

    expect(() => canonicalJson({ nested: undefined })).toThrow(/protocol JSON/i)
    expect(() => canonicalJson(sparseArray)).toThrow(/protocol JSON/i)
    expect(() => canonicalJson({ [symbolKey]: 'hidden', visible: true })).toThrow(/protocol JSON/i)
    expect(() => canonicalJson(cycle)).toThrow(/protocol JSON/i)
  })

  it('rejects array metadata and accessors that JSON would silently ignore or execute', () => {
    const arrayWithSymbol = ['value'] as unknown[] & Record<symbol, unknown>
    arrayWithSymbol[Symbol('hidden')] = true
    const arrayWithGetter = ['value']
    Object.defineProperty(arrayWithGetter, '0', { enumerable: true, get: () => 'value' })

    expect(() => canonicalJson(arrayWithSymbol)).toThrow(/protocol JSON/i)
    expect(() => canonicalJson(arrayWithGetter)).toThrow(/protocol JSON/i)
    expect(() => canonicalJson({ get value() { return 'value' } })).toThrow(/protocol JSON/i)
  })

  it('hashes UTF-8 bytes to a lowercase SHA-256 hex digest', async () => {
    expect(await sha256Hex('咖啡')).toBe(
      '9d0d261e29e255f78009fc8fb24302a053a7b78af22574a3ad8142cb61b75424',
    )
  })

  it('verifies only data and requires canonical lowercase checksum hex', async () => {
    const data = {
      profile: null,
      userSettings: null,
      beans: [],
      brewLogs: [],
      brewTemplates: [],
      aiRecommendations: [],
      sourceImports: [],
    }
    const checksum = await sha256Hex(data)
    const document = {
      schemaVersion: 2,
      manifest: {
        exportedAt: '2026-08-08T00:00:00.000Z',
        appVersion: 'test',
        backupMode: 'lightweight',
        recordCounts: {
          profile: 0,
          userSettings: 0,
          beans: 0,
          brewLogs: 0,
          brewTemplates: 0,
          aiRecommendations: 0,
          sourceImports: 0,
        },
        checksumAlgorithm: 'SHA-256',
        checksum,
        images: [],
        warnings: [],
      },
      data,
    } satisfies BackupV2Document

    expect(await verifyBackupChecksum(document)).toBe(true)
    expect(
      await verifyBackupChecksum({
        ...document,
        manifest: { ...document.manifest, appVersion: 'changed' },
      }),
    ).toBe(true)
    expect(
      await verifyBackupChecksum({
        ...document,
        manifest: { ...document.manifest, checksum: checksum.toUpperCase() },
      }),
    ).toBe(false)
    expect(
      await verifyBackupChecksum({
        ...document,
        manifest: { ...document.manifest, checksum: 'not-a-checksum' },
      }),
    ).toBe(false)
    expect(
      await verifyBackupChecksum({
        ...document,
        data: {
          ...data,
          profile: {
            id: 'changed',
            display_name: null,
            created_at: '2026-08-08T00:00:00.000Z',
            updated_at: '2026-08-08T00:00:00.000Z',
            schema_version: 1,
          },
        },
      }),
    ).toBe(false)
  })
})
