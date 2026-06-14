import { describe, expect, it } from 'vitest'
import { appendOcrText } from './imageOcr'

describe('appendOcrText', () => {
  it('uses recognized text when the current text is empty', () => {
    expect(appendOcrText('', '  Ethiopia Guji\nWashed  ')).toBe('Ethiopia Guji\nWashed')
  })

  it('appends recognized text after existing text with a clear separator', () => {
    expect(appendOcrText('Taobao link notes', 'Origin: Ethiopia')).toBe(
      'Taobao link notes\n\n--- 图片识别文字 ---\nOrigin: Ethiopia',
    )
  })

  it('keeps existing text unchanged when OCR text is blank', () => {
    expect(appendOcrText('Existing text', '   ')).toBe('Existing text')
  })
})
