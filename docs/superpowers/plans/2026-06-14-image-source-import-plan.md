# Image Source Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add image import to source import so product screenshots can be OCRed locally, edited as text, then parsed by the existing DeepSeek source-import flow.

**Architecture:** Keep the current Supabase Edge Function contract text-first. Add a browser-side OCR adapter and a small pure text merge helper in the source import feature. The OCR layer is isolated so a future DeepSeek multimodal service can replace it without changing draft preview or confirmed save behavior.

**Tech Stack:** React, TypeScript, Tesseract.js, Supabase JS, Supabase Edge Functions, DeepSeek, Vitest, Vite.

---

## File Structure

- Modify `app/package.json` and `app/package-lock.json` to add `tesseract.js`.
- Create `app/src/features/sourceImports/imageOcr.ts` for OCR and text-merge helpers.
- Create `app/src/features/sourceImports/imageOcr.test.ts` for pure helper behavior.
- Modify `app/src/features/sourceImports/SourceImportPanel.tsx` to add the image picker, OCR action, and status handling.
- Modify `app/src/features/sourceImports/sourceImports.css` for the compact image import block.
- No Supabase schema change is required.
- No Edge Function change is required for v1 because images stay local and only OCR text is sent to the existing parser.

## Task 1: OCR Text Merge Helper

**Files:**
- Create: `app/src/features/sourceImports/imageOcr.ts`
- Create: `app/src/features/sourceImports/imageOcr.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { appendOcrText } from './imageOcr'

describe('appendOcrText', () => {
  it('uses recognized text when the current text is empty', () => {
    expect(appendOcrText('', '  Ethiopia Guji\\nWashed  ')).toBe('Ethiopia Guji\\nWashed')
  })

  it('appends recognized text after existing text with a clear separator', () => {
    expect(appendOcrText('淘宝链接信息', '产地：埃塞俄比亚')).toBe(
      '淘宝链接信息\\n\\n--- 图片识别文字 ---\\n产地：埃塞俄比亚',
    )
  })

  it('keeps existing text unchanged when OCR text is blank', () => {
    expect(appendOcrText('已有文本', '   ')).toBe('已有文本')
  })
})
```

- [ ] **Step 2: Run focused test to verify RED**

Run: `npm test --prefix app -- src/features/sourceImports/imageOcr.test.ts`

Expected: fail because `imageOcr.ts` does not exist.

- [ ] **Step 3: Implement helper**

```ts
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
```

- [ ] **Step 4: Re-run focused test**

Run: `npm test --prefix app -- src/features/sourceImports/imageOcr.test.ts`

Expected: pass.

## Task 2: OCR Adapter

**Files:**
- Modify: `app/package.json`
- Modify: `app/package-lock.json`
- Modify: `app/src/features/sourceImports/imageOcr.ts`

- [ ] **Step 1: Install dependency**

Run: `npm install --prefix app tesseract.js`

Expected: `tesseract.js` appears in `dependencies`.

- [ ] **Step 2: Add OCR adapter**

Add to `imageOcr.ts`:

```ts
import { createWorker } from 'tesseract.js'

export async function recognizeCoffeeImageText(image: File) {
  const worker = await createWorker('chi_sim+eng')

  try {
    const result = await worker.recognize(image)
    return result.data.text.trim()
  } finally {
    await worker.terminate()
  }
}
```

- [ ] **Step 3: Type-check through build later**

Run in verification task because the dependency type shape is checked by TypeScript build.

## Task 3: Source Import UI

**Files:**
- Modify: `app/src/features/sourceImports/SourceImportPanel.tsx`
- Modify: `app/src/features/sourceImports/sourceImports.css`

- [ ] **Step 1: Add state and imports**

Import `appendOcrText` and `recognizeCoffeeImageText`. Add state for selected image, OCR running state, and OCR status.

- [ ] **Step 2: Add image picker block**

Place it between URL input and product detail text. It should include:

- File input with `accept="image/*"`.
- Selected image filename.
- `识别图片文字` button.
- Small helper text saying the original image will not be saved.

- [ ] **Step 3: Add OCR handler**

The handler should:

- Require a selected image.
- Call `recognizeCoffeeImageText(selectedImage)`.
- If text is empty, show an error and preserve current text.
- If text exists, call `setPastedText((current) => appendOcrText(current, text))`.
- Clear parse errors only when OCR succeeds.

- [ ] **Step 4: Keep parse flow unchanged**

`handleParse` still sends `{ url, pastedText }` to `requestSourceImport`. It does not send images.

## Task 4: Verification

**Files:**
- All changed files.

- [ ] **Step 1: Run source import tests**

Run: `npm test --prefix app -- src/features/sourceImports`

- [ ] **Step 2: Run all tests**

Run: `npm test --prefix app`

- [ ] **Step 3: Run production build**

Run: `npm run build --prefix app`

- [ ] **Step 4: Secret scan**

Run: `rg -n "DEEPSEEK_API_KEY=|service_role|sk-[A-Za-z0-9]|VITE_SUPABASE_ANON_KEY=." -S .`

- [ ] **Step 5: Commit and push**

Run:

```bash
git add docs/superpowers/specs/2026-06-14-image-source-import-design.md docs/superpowers/plans/2026-06-14-image-source-import-plan.md app
git commit -m "Add image OCR source import"
git push origin foundation
```
