import type { BackupV2Document } from './backupTypes'

const checksumPattern = /^[0-9a-f]{64}$/

export function canonicalJson(value: unknown): string {
  return serializeProtocolJson(value, new Set<object>())
}

export async function sha256Hex(value: unknown): Promise<string> {
  const subtle = globalThis.crypto?.subtle

  if (!subtle) {
    throw new Error('SHA-256 is unavailable in this runtime')
  }

  const bytes = new TextEncoder().encode(canonicalJson(value))
  const digest = await subtle.digest('SHA-256', bytes)

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function verifyBackupChecksum(document: BackupV2Document): Promise<boolean> {
  if (!checksumPattern.test(document.manifest.checksum)) {
    return false
  }

  const actual = await sha256Hex(document.data)
  return actual === document.manifest.checksum
}

function serializeProtocolJson(value: unknown, ancestors: Set<object>): string {
  if (value === null) {
    return 'null'
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }

  if (typeof value === 'number') {
    return serializeProtocolNumber(value)
  }

  if (typeof value !== 'object') {
    throw protocolJsonError()
  }

  if (ancestors.has(value)) {
    throw protocolJsonError()
  }

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      const ownKeys = Reflect.ownKeys(value)
      if (
        ownKeys.length !== value.length + 1 ||
        ownKeys.some(
          (key) =>
            typeof key === 'symbol' ||
            (key !== 'length' && !isArrayIndex(key, value.length)),
        )
      ) {
        throw protocolJsonError()
      }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
        if (!descriptor?.enumerable || !('value' in descriptor)) {
          throw protocolJsonError()
        }
      }
      return `[${value.map((item) => serializeProtocolJson(item, ancestors)).join(',')}]`
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw protocolJsonError()
    }

    const ownKeys = Reflect.ownKeys(value)
    if (ownKeys.some((key) => typeof key === 'symbol')) {
      throw protocolJsonError()
    }

    const keys = ownKeys as string[]
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor?.enumerable || !('value' in descriptor)) {
        throw protocolJsonError()
      }
    }

    keys.sort()
    return `{${keys
      .map(
        (key) =>
          `${JSON.stringify(key)}:${serializeProtocolJson(
            (value as Record<string, unknown>)[key],
            ancestors,
          )}`,
      )
      .join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

function serializeProtocolNumber(value: number) {
  if (!Number.isFinite(value)) {
    throw protocolJsonError()
  }

  const absolute = Math.abs(value)

  if (Number.isInteger(value)) {
    if (!Number.isSafeInteger(value)) {
      throw protocolJsonError()
    }
  } else {
    if ((absolute !== 0 && absolute < 0.000001) || absolute >= 1e21) {
      throw protocolJsonError()
    }

    const digits = JSON.stringify(value)
      .replace(/[^0-9]/g, '')
      .replace(/^0+/, '')

    if (digits.length > 15) {
      throw protocolJsonError()
    }
  }

  return JSON.stringify(value)
}

function isArrayIndex(key: string, length: number) {
  const index = Number(key)
  return Number.isInteger(index) && index >= 0 && index < length && String(index) === key
}

function protocolJsonError() {
  return new TypeError('Backup checksum accepts protocol JSON values only')
}
