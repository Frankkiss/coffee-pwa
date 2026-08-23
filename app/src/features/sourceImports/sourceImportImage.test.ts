import { describe, expect, it } from 'vitest'
import {
  MAX_SOURCE_IMPORT_IMAGE_BYTES,
  readSourceImportImage,
  validateSourceImportImage,
} from './sourceImportImage'

function imageFile(
  type: string,
  bytes: Uint8Array = new Uint8Array([0xff, 0xd8, 0xff]),
) {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return new File([buffer], 'coffee-bag.jpg', { type })
}

describe('source import image', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])(
    'accepts supported image type %s',
    (type) => {
      expect(validateSourceImportImage(imageFile(type))).toBeNull()
    },
  )

  it('rejects unsupported image types', () => {
    expect(validateSourceImportImage(imageFile('image/gif'))).toBe(
      '图片仅支持 JPEG、PNG 或 WebP 格式。',
    )
  })

  it('rejects images larger than 8 MiB', () => {
    const file = imageFile(
      'image/jpeg',
      new Uint8Array(MAX_SOURCE_IMPORT_IMAGE_BYTES + 1),
    )

    expect(validateSourceImportImage(file)).toBe('图片不能超过 8 MB。')
  })

  it('encodes a validated image as a data URL request object', async () => {
    const result = await readSourceImportImage(
      imageFile('image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
    )

    expect(result).toEqual({
      mediaType: 'image/png',
      dataUrl: 'data:image/png;base64,iVBORw==',
    })
  })
})
