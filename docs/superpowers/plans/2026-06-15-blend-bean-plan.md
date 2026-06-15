# Blend Bean Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class blend coffee bean support so bean records, source import, CSV export, and brew recommendations handle non-SOE beans.

**Architecture:** Add blend fields to the bean domain model and database schema while preserving old single-origin records as the default. Use a small shared helper for parsing and formatting blend composition text, then wire it into form payloads, source import mapping, CSV export, and recommendation scoring.

**Tech Stack:** React, TypeScript, Vitest, Supabase Postgres, Supabase Edge Functions, DeepSeek API.

---

### Task 1: Bean Model And Blend Helper

**Files:**
- Create: `app/src/features/beans/blendComponents.ts`
- Test: `app/src/features/beans/blendComponents.test.ts`
- Modify: `app/src/features/beans/beanTypes.ts`
- Modify: `app/src/features/beans/beanForm.ts`
- Test: `app/src/features/beans/beanForm.test.ts`

- [ ] Write failing tests for parsing text lines such as `60% 巴西 日晒 黄波旁` into `BeanBlendComponent[]`.
- [ ] Add bean type and blend fields to `Bean`, `BeanForm`, insert payload, and update payload.
- [ ] Map form text to `blend_components` and `blend_notes`.
- [ ] Map existing bean rows back to editable form text.

### Task 2: UI, Source Import, Export

**Files:**
- Modify: `app/src/features/beans/BeanDashboard.tsx`
- Modify: `app/src/features/backup/csvExport.ts`
- Test: `app/src/features/backup/csvExport.test.ts`
- Modify: `app/src/features/sourceImports/sourceImportTypes.ts`
- Modify: `app/src/features/sourceImports/sourceImportMapping.ts`
- Test: `app/src/features/sourceImports/sourceImportMapping.test.ts`
- Modify: `supabase/functions/import-source/index.ts`

- [ ] Show bean type selector and blend text area in the bean form.
- [ ] Add bean type and blend composition columns to beans CSV export.
- [ ] Normalize AI source import fields `beanType`, `blendComponents`, and `blendNotes`.
- [ ] Update DeepSeek import prompt to request blend fields.

### Task 3: Recommendation And Database Schema

**Files:**
- Modify: `app/src/features/recommendations/ruleRecommendation.ts`
- Test: `app/src/features/recommendations/ruleRecommendation.test.ts`
- Modify: `app/src/features/recommendations/templateRecommendation.ts`
- Test: `app/src/features/recommendations/templateRecommendation.test.ts`
- Modify: `supabase/functions/recommend-brew/index.ts`
- Modify: `supabase/sql/001_initial_schema.sql`
- Create: `supabase/sql/002_blend_beans.sql`

- [ ] Score blend beans by shared component origin/process plus shared flavor tags.
- [ ] Let template selection consider blend component process values.
- [ ] Update AI recommendation prompt to explain blend handling.
- [ ] Add SQL migration for live Supabase projects.

### Task 4: Verification

**Files:**
- All modified files above.

- [ ] Run focused tests for beans, source imports, CSV, and recommendations.
- [ ] Run `npm run test`, `npm run lint`, and `npm run build` from `app`.
- [ ] Commit and push the finished change.
