# Source Import v1A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user paste one public coffee page URL, use a Supabase Edge Function plus DeepSeek to extract a coffee bean draft, preview it, edit it, and explicitly save it to the bean vault.

**Architecture:** Add a new `import-source` Supabase Edge Function for URL fetching, text extraction, and DeepSeek JSON extraction. Add a frontend source-import feature that invokes the function, normalizes the draft into the existing bean form model, records `source_imports`, and only creates a `beans` row after the user confirms.

**Tech Stack:** React, TypeScript, Supabase JS, Supabase Edge Functions, DeepSeek, Vitest, Vite.

---

## File Structure

- Add `supabase/functions/import-source/index.ts` for server-side URL fetch and DeepSeek extraction.
- Modify `supabase/config.toml` to enable JWT verification for `import-source`.
- Create `app/src/features/sourceImports/sourceImportTypes.ts` for request/response/draft types.
- Create `app/src/features/sourceImports/sourceImportMapping.ts` for draft normalization and bean-form conversion.
- Create `app/src/features/sourceImports/sourceImportMapping.test.ts` for TDD coverage.
- Create `app/src/features/sourceImports/sourceImportService.ts` for Supabase function invocation and `source_imports` recording.
- Create `app/src/features/sourceImports/SourceImportPanel.tsx` for paste URL, parse, preview, edit, and confirm UI.
- Create `app/src/features/sourceImports/sourceImports.css` for mobile-first layout.
- Modify `app/src/features/beans/BeanDashboard.tsx` to render `SourceImportPanel` and insert confirmed beans into current bean state.

## Task 1: Frontend Draft Mapping

**Files:**
- Create: `app/src/features/sourceImports/sourceImportTypes.ts`
- Create: `app/src/features/sourceImports/sourceImportMapping.ts`
- Create: `app/src/features/sourceImports/sourceImportMapping.test.ts`

- [ ] **Step 1: Write failing tests**

Tests must prove:

```ts
const draft = normalizeSourceImportDraft({
  name: 'Ethiopia Guji',
  roaster: 'Test Roaster',
  origin: 'Ethiopia',
  process: 'Washed',
  altitudeMeters: '1900',
  flavorTags: ['citrus', 'honey', 'citrus'],
  sourceUrl: 'https://example.com/bean',
})

expect(draft.altitudeMeters).toBe(1900)
expect(draft.flavorTags).toEqual(['citrus', 'honey'])
expect(createBeanFormFromSourceDraft(draft).sourceUrl).toBe('https://example.com/bean')
```

- [ ] **Step 2: Run focused test**

Run: `npm test --prefix app -- src/features/sourceImports/sourceImportMapping.test.ts`

Expected before implementation: fail because files/functions do not exist.

- [ ] **Step 3: Implement mapping**

Implement:

```ts
export function normalizeSourceImportDraft(input: unknown): SourceImportDraft
export function createBeanFormFromSourceDraft(draft: SourceImportDraft): BeanForm
```

Rules:
- Strings are trimmed.
- Empty fields become empty strings in form data.
- Numeric fields accept numbers or numeric strings.
- Flavor tags dedupe and trim.
- Missing `name` stays empty so the UI can require user correction before save.

- [ ] **Step 4: Re-run focused test**

Run: `npm test --prefix app -- src/features/sourceImports/sourceImportMapping.test.ts`

Expected after implementation: pass.

## Task 2: Edge Function

**Files:**
- Create: `supabase/functions/import-source/index.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Implement function**

The function accepts:

```json
{ "url": "https://example.com/coffee-page" }
```

Behavior:
- Allow `POST` and `OPTIONS`.
- Validate URL is `http` or `https`.
- Fetch the page with a normal browser-like user agent.
- Reject pages over a limited text budget.
- Strip script/style/html tags into readable text.
- Call DeepSeek using server-side `DEEPSEEK_API_KEY`.
- Ask DeepSeek to return strict JSON with bean fields only.
- Return `{ configured, sourceUrl, draft, rawTextLength, error? }`.

- [ ] **Step 2: Configure Supabase function**

Add:

```toml
[functions.import-source]
verify_jwt = true
```

## Task 3: Frontend Service And UI

**Files:**
- Create: `app/src/features/sourceImports/sourceImportService.ts`
- Create: `app/src/features/sourceImports/SourceImportPanel.tsx`
- Create: `app/src/features/sourceImports/sourceImports.css`
- Modify: `app/src/features/beans/BeanDashboard.tsx`

- [ ] **Step 1: Add service**

Implement:
- `requestSourceImport(supabase, url)`
- `recordSourceImportDraft(supabase, input)`
- Return useful errors when the Edge Function is not configured or fails.

- [ ] **Step 2: Add panel**

Panel flow:
- URL input.
- `解析链接` button.
- Draft preview form.
- User can edit fields.
- `确认保存到豆仓` button.
- Uses existing `toBeanInsertPayload` and `createBean`.

- [ ] **Step 3: Wire BeanDashboard**

Render `SourceImportPanel` above the manual bean form. When a bean is confirmed, prepend it into `beans`.

## Task 4: Verification And Deployment

**Files:**
- All changed files.

- [ ] **Step 1: Run all tests**

Run: `npm test --prefix app`

- [ ] **Step 2: Run production build**

Run: `npm run build --prefix app`

- [ ] **Step 3: Run secret scan**

Run: `rg -n "DEEPSEEK_API_KEY=|service_role|sk-[A-Za-z0-9]|VITE_SUPABASE_ANON_KEY=." -S .`

Expected: no real secret values in committed source.

- [ ] **Step 4: Deploy function**

Run if Supabase CLI is available:

```powershell
.\supabase\supabase.exe functions deploy import-source --project-ref tmjpgcjcrcaxxxhqbyng
```

- [ ] **Step 5: Commit and push**

Run:

```bash
git add docs/superpowers/plans/2026-06-14-source-import-v1a-plan.md app/src/features/sourceImports app/src/features/beans/BeanDashboard.tsx supabase/config.toml supabase/functions/import-source
git commit -m "Add AI-assisted source import"
git push origin foundation
```

## Out Of Scope

- `coffeer.net/beans` candidate list import.
- Bulk import.
- Automatic whole-web search.
- Bypassing login walls, paywalls, CAPTCHA, or anti-bot systems.
- Saving AI output without user confirmation.
