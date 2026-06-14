import { createWorker } from 'tesseract.js'

const OCR_SEPARATOR = '--- 图片识别文字 ---'

export function appendOcrText(currentText: string, recognizedText: string) {
  const current = currentText.trim()
  const recognized = recognizedText.trim()

  if (!recognized) {
    return currentText
  }

  if (!current) {
    return recognized
  }

  return `${current}\n\n${OCR_SEPARATOR}\n${recognized}`
}

export async function recognizeCoffeeImageText(image: File) {
  const worker = await createWorker('chi_sim+eng')

  try {
    const result = await worker.recognize(image)
    return result.data.text.trim()
  } finally {
    await worker.terminate()
  }
}
