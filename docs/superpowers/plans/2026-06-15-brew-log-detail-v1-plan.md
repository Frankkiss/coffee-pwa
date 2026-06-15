# Brew Log Detail v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile-first detail view for saved brew logs with view, edit, soft delete, and candidate recipe toggle.

**Architecture:** Keep the feature inside `BrewLogPanel` to avoid routing changes. Add a small pure model helper for display formatting and a focused React component for the detail panel. Reuse existing service calls and form conversion logic.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Supabase client.

---

### Task 1: Detail View Model

**Files:**
- Create: `app/src/features/brews/brewLogDetailModel.ts`
- Test: `app/src/features/brews/brewLogDetailModel.test.ts`

- [ ] **Step 1: Write the failing test**

Create tests for formatting summary fields, empty states, pour step normalization, and pin action text.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run src/features/brews/brewLogDetailModel.test.ts`

Expected: FAIL because `brewLogDetailModel.ts` does not exist yet.

- [ ] **Step 3: Implement the model**

Implement `buildBrewLogDetailView(log, beanName)` to return section fields, sensory fields, pour steps, and action labels.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --run src/features/brews/brewLogDetailModel.test.ts`

Expected: PASS.

### Task 2: Detail Panel Component

**Files:**
- Create: `app/src/features/brews/BrewLogDetailPanel.tsx`
- Modify: `app/src/features/brews/BrewLogPanel.tsx`
- Modify: `app/src/features/brews/brews.css`

- [ ] **Step 1: Add component**

Render a detail panel from the model with buttons for back, edit, delete, and pin toggle.

- [ ] **Step 2: Connect state**

Add `selectedLogId` to `BrewLogPanel`, open it from a `详情` action, clear it after delete, and keep it stable after pin toggle.

- [ ] **Step 3: Reuse existing handlers**

Reuse `handleEdit` and `handleDelete`. Add `handleTogglePinned` using `createBrewFormFromLog`, `toBrewLogUpdatePayload`, and `updateBrewLog`.

- [ ] **Step 4: Style mobile-first**

Use the existing cream and coffee palette, 8px radius cards, stable button heights, and stacked mobile layout.

### Task 3: Verification And Commit

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run focused test**

Run: `npm run test -- --run src/features/brews/brewLogDetailModel.test.ts`

- [ ] **Step 2: Run full checks**

Run: `npm run lint`

Run: `npm run test`

Run: `npm run build`

- [ ] **Step 3: Commit**

Commit message: `Add brew log detail view`
