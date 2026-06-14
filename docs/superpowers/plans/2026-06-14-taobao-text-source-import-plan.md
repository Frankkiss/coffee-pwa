# Taobao Text Source Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change source import so Taobao-style product links can be paired with manually pasted product detail text and parsed by DeepSeek.

**Architecture:** Keep the existing `import-source` Edge Function and source import UI. Extend the request contract from `{ url }` to `{ url, pastedText }`, prioritize pasted text over server-side page fetching, and only use URL fetching when no pasted text is provided.

**Tech Stack:** React, TypeScript, Supabase JS, Supabase Edge Functions, DeepSeek, Vitest, Vite.

---

## File Structure

- Modify `app/src/features/sourceImports/sourceImportTypes.ts` to add `SourceImportRequest`.
- Modify `app/src/features/sourceImports/sourceImportService.ts` to send `{ url, pastedText }`.
- Add/update `app/src/features/sourceImports/sourceImportService.test.ts` for request payload behavior.
- Modify `app/src/features/sourceImports/SourceImportPanel.tsx` to add the detail text textarea and validation.
- Modify `app/src/features/sourceImports/sourceImports.css` only if spacing needs adjustment.
- Modify `supabase/functions/import-source/index.ts` to prioritize pasted text and avoid forced fetch for Taobao links.

## Task 1: Frontend Request Contract

**Files:**
- Modify: `app/src/features/sourceImports/sourceImportTypes.ts`
- Modify: `app/src/features/sourceImports/sourceImportService.ts`
- Create: `app/src/features/sourceImports/sourceImportService.test.ts`

- [ ] **Step 1: Write failing test**

Test that `requestSourceImport(supabase, { url, pastedText })` calls:

```ts
supabase.functions.invoke('import-source', {
  body: { url, pastedText }
})
```

- [ ] **Step 2: Run focused test**

Run: `npm test --prefix app -- src/features/sourceImports/sourceImportService.test.ts`

Expected before implementation: fail because the function still accepts only a URL string.

- [ ] **Step 3: Implement request type**

Add:

```ts
export type SourceImportRequest = {
  url: string
  pastedText: string
}
```

Update `requestSourceImport` to accept this object and keep the same response normalization.

- [ ] **Step 4: Re-run focused test**

Run: `npm test --prefix app -- src/features/sourceImports/sourceImportService.test.ts`

Expected after implementation: pass.

## Task 2: UI Text Input

**Files:**
- Modify: `app/src/features/sourceImports/SourceImportPanel.tsx`
- Modify: `app/src/features/sourceImports/sourceImports.css`

- [ ] **Step 1: Add state**

Add `pastedText` state.

- [ ] **Step 2: Add textarea**

Add a textarea labeled `商品详情文本` with helper copy explaining it is recommended for Taobao/Tmall pages.

- [ ] **Step 3: Update validation**

Allow:
- URL only for normal public pages.
- Text only for Taobao/manual import.
- URL + text for best source tracking.

Reject only when both are empty.

- [ ] **Step 4: Update button text**

Change primary action from `解析链接` to `AI 解析`.

## Task 3: Edge Function Text Priority

**Files:**
- Modify: `supabase/functions/import-source/index.ts`

- [ ] **Step 1: Update request type**

Accept:

```ts
type ImportRequest = {
  url?: string
  pastedText?: string
}
```

- [ ] **Step 2: Normalize source URL**

If URL is absent, use `manual://pasted-text` as a non-browser source marker for response and `source_imports`.

- [ ] **Step 3: Prioritize pasted text**

If `pastedText.trim()` has enough content, use it directly as prompt text and skip fetch.

- [ ] **Step 4: Taobao behavior**

If no pasted text and the URL host looks like Taobao/Tmall, return a clear error asking the user to paste product detail text.

- [ ] **Step 5: Keep public URL fallback**

If no pasted text and the URL is ordinary public `http/https`, keep current fetch behavior.

## Task 4: Verification And Deployment

**Files:**
- All changed files.

- [ ] **Step 1: Run all tests**

Run: `npm test --prefix app`

- [ ] **Step 2: Run production build**

Run: `npm run build --prefix app`

- [ ] **Step 3: Secret scan**

Run: `rg -n "DEEPSEEK_API_KEY=|service_role|sk-[A-Za-z0-9]|VITE_SUPABASE_ANON_KEY=." -S .`

- [ ] **Step 4: Deploy function**

Run:

```powershell
.\supabase\supabase.exe functions deploy import-source --project-ref tmjpgcjcrcaxxxhqbyng
```

- [ ] **Step 5: Commit and push**

Run:

```bash
git add docs/superpowers/plans/2026-06-14-taobao-text-source-import-plan.md app/src/features/sourceImports supabase/functions/import-source
git commit -m "Support pasted text source import"
git push origin foundation
```
