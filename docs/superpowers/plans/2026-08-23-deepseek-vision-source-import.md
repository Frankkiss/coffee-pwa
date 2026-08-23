# DeepSeek Vision Source Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace browser Tesseract OCR with a direct, server-side DeepSeek vision source-import flow while preserving text import, draft confirmation, authentication, rate limits, and data-safety boundaries.

**Architecture:** The React client validates one image and encodes it as a data URL only when the user starts parsing. The authenticated `import-source` Edge Function validates the bounded request again and sends text plus an optional image content block to `deepseek-v4-flash-vision-exp` using the isolated `DEEPSEEK_VISION_API_KEY`; only normalized structured output returns to the client.

**Tech Stack:** React, TypeScript, Vitest, Supabase Edge Functions, Deno tests, DeepSeek OpenAI-compatible Chat Completions API.

---

### Task 1: Lock the client request and image-validation contract

**Files:**
- Create: `app/src/features/sourceImports/sourceImportImage.ts`
- Create: `app/src/features/sourceImports/sourceImportImage.test.ts`
- Modify: `app/src/features/sourceImports/sourceImportTypes.ts`
- Modify: `app/src/features/sourceImports/sourceImportService.test.ts`

- [ ] **Step 1: Write failing tests** for JPEG/PNG/WebP acceptance, unsupported type rejection, the 8 MiB limit, File-to-data-URL conversion, and forwarding `{ pastedText, image }` unchanged to `import-source`.
- [ ] **Step 2: Run** `npm test -- --run src/features/sourceImports/sourceImportImage.test.ts src/features/sourceImports/sourceImportService.test.ts` from `app`; expect failures because the helper and image request field do not exist.
- [ ] **Step 3: Implement** `validateSourceImportImage(file)` and `readSourceImportImage(file)` with stable Chinese errors and extend `SourceImportRequest` with the optional image object from the design.
- [ ] **Step 4: Re-run the focused tests** and expect all cases to pass.

### Task 2: Add bounded vision input to the Edge Function

**Files:**
- Modify: `supabase/functions/import-source/index.test.ts`
- Modify: `supabase/functions/import-source/index.ts`

- [ ] **Step 1: Write failing Deno tests** proving image-only requests work, text-only requests remain compatible, malformed/unsupported/oversized images fail before model invocation, URL fields remain rejected, and the request dependency receives a normalized optional image.
- [ ] **Step 2: Run** `deno test supabase/functions/import-source/index.test.ts --allow-env`; expect the new vision cases to fail.
- [ ] **Step 3: Implement** the 12 MiB bounded JSON body, strict image data-URL validation, 8 MiB decoded-image limit, `DEEPSEEK_VISION_API_KEY`, and the `deepseek-v4-flash-vision-exp` request with text and optional `image_url` blocks. Keep `response_format: { type: "json_object" }`, URL rejection, authentication, and rate limiting.
- [ ] **Step 4: Re-run the Edge Function tests** and expect all cases to pass.
- [ ] **Step 5: Commit** the source-import contract and Edge Function as `feat: add DeepSeek vision source import`.

### Task 3: Replace the OCR interaction

**Files:**
- Modify: `app/src/features/sourceImports/SourceImportPanel.tsx`
- Modify: `app/src/features/sourceImports/sourceImportAvailability.ts`
- Modify: `app/src/features/sourceImports/sourceImportAvailability.test.ts`
- Modify: `app/src/features/sourceImports/sourceImports.css`
- Delete: `app/src/features/sourceImports/imageOcr.ts`
- Delete: `app/src/features/sourceImports/imageOcr.test.ts`
- Modify: `app/package.json`
- Modify: `app/package-lock.json`

- [ ] **Step 1: Update tests** so offline copy says image/AI parsing requires a connection and the request service accepts the validated image payload.
- [ ] **Step 2: Run focused Vitest tests** and expect the offline-copy assertion to fail.
- [ ] **Step 3: Change the panel** to select one image, validate it immediately, and submit it together with optional text from the existing AI button. Replace OCR status/copy with “图片仅用于本次 AI 解析，不保存原图”; allow image-only parsing and preserve inputs on error.
- [ ] **Step 4: Remove Tesseract** with `npm uninstall tesseract.js`, delete the OCR module/tests, and remove obsolete CSS selectors.
- [ ] **Step 5: Run** `npm test -- --run src/features/sourceImports` and expect all source-import tests to pass.
- [ ] **Step 6: Commit** as `feat: replace browser OCR with vision import`.

### Task 4: Documentation, full verification, and production handoff

**Files:**
- Modify: `docs/operations/deepseek-edge-function-setup.md`

- [ ] **Step 1: Document** `DEEPSEEK_VISION_API_KEY`, the separate purpose of the existing `DEEPSEEK_API_KEY`, safe Dashboard secret setup, and `import-source` deployment/verification steps without including a key value.
- [ ] **Step 2: Run frontend verification** from `app`: `npm test`, `npm run lint`, and `npm run build`; all must exit 0.
- [ ] **Step 3: Run Edge verification**: `deno test supabase/functions/import-source/index.test.ts supabase/functions/recommend-brew/index.test.ts supabase/functions/_shared/auth.test.ts supabase/functions/_shared/rateLimit.test.ts --allow-env`; all must pass.
- [ ] **Step 4: Run a mobile viewport check** at approximately 390×844 covering image selection, parse state, draft review, and confirmation controls; capture evidence without sending production data.
- [ ] **Step 5: Confirm Git scope** with `git status --short` and `git diff --check`; the two legacy patch files must remain untracked and untouched.
- [ ] **Step 6: Commit** operations documentation and verification adjustments as `docs: document DeepSeek vision import setup`.
- [ ] **Step 7: Production gate:** do not deploy `import-source` until the user has created `DEEPSEEK_VISION_API_KEY` in Supabase Secrets. After confirmation, deploy only `import-source`, smoke-test image and text drafts, then push the reviewed commits.

## Self-review result

- Spec coverage: request contract, vision model, isolated secret, input limits, no URL fetching, no image persistence, text compatibility, draft confirmation, tests, mobile verification, and deployment gate are covered.
- Placeholder scan: no TBD/TODO or unspecified implementation step remains.
- Type consistency: both client and Edge Function use one optional `{ dataUrl, mediaType }` image object and the same MIME allowlist.

