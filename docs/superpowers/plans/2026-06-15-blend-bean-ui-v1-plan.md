# Blend Bean UI v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the blend bean free-text composition entry with structured component cards and a separate overall blend note.

**Architecture:** Keep persistence on existing `blend_components` and `blend_notes`. Update `BeanForm` to carry structured components, add helper functions for empty component cleanup, and render a dedicated blend component editor inside `BeanDashboard`.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Supabase.

---

### Task 1: Bean Form Data Model

**Files:**
- Modify: `app/src/features/beans/beanTypes.ts`
- Modify: `app/src/features/beans/beanForm.ts`
- Modify: `app/src/features/beans/beanForm.test.ts`
- Modify: `app/src/features/sourceImports/sourceImportMapping.ts`

- [ ] **Step 1: Write failing tests**

Update `beanForm.test.ts` so blend forms use `blendComponents` and `blendNotes` instead of only `blendComponentsText`.

- [ ] **Step 2: Run focused test**

Run: `npm run test -- --run src/features/beans/beanForm.test.ts`

Expected: FAIL until form model is updated.

- [ ] **Step 3: Implement model changes**

Add structured component helpers, save non-empty components, save optional blend notes, and preserve import mapping compatibility.

- [ ] **Step 4: Run focused test**

Run: `npm run test -- --run src/features/beans/beanForm.test.ts`

Expected: PASS.

### Task 2: Blend Component Editor UI

**Files:**
- Create: `app/src/features/beans/BlendComponentEditor.tsx`
- Modify: `app/src/features/beans/BeanDashboard.tsx`
- Modify: `app/src/features/beans/beans.css`

- [ ] **Step 1: Add editor component**

Create a focused component that renders component cards, add/remove buttons, and field updates.

- [ ] **Step 2: Wire BeanDashboard**

Render the editor only for `beanType === 'blend'`. Keep `拼配说明` as a separate text area.

- [ ] **Step 3: Style cards**

Use compact mobile cards with stable button heights and current coffee palette.

### Task 3: Verification And Commit

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run focused tests**

Run: `npm run test -- --run src/features/beans/beanForm.test.ts`

- [ ] **Step 2: Run full checks**

Run: `npm run lint`

Run: `npm run test`

Run: `npm run build`

- [ ] **Step 3: Commit**

Commit message: `Improve blend bean entry UI`
