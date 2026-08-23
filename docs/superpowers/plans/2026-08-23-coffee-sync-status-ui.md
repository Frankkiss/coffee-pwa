# Compact Sync Status UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the full-width successful sync banner with a right-aligned expandable status pill while preserving all non-success states.

**Architecture:** Branch only when the existing view model reports the `success` tone. Render a focused `SyncedStatus` component for that branch and keep the existing banner untouched for every other tone; CSS owns the compact alignment and responsive behavior.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, React DOM server renderer

---

### Task 1: Successful sync pill

**Files:**
- Modify: `app/src/features/sync/SyncStatusBanner.tsx`
- Modify: `app/src/features/sync/syncStatus.css`
- Create: `app/src/features/sync/SyncStatusBanner.test.tsx`

- [ ] **Step 1: Write the failing test**

Render `SyncedStatus` with `renderToStaticMarkup` and assert that it contains `✓ 已同步 · 15:25`, the complete `最后同步：2026/08/23 15:25` detail, online capability text, and native `details`/`summary` markup.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/sync/SyncStatusBanner.test.tsx`
Expected: FAIL because `SyncStatusBanner.test.tsx` imports a not-yet-exported `SyncedStatus` component.

- [ ] **Step 3: Write minimal implementation**

Add an early success branch in `SyncStatusBanner`, export a focused `SyncedStatus` component, derive its short `HH:mm` label from the existing full detail string, and render an accessible native `details` control. Add `.sync-status-success` styles for right alignment, 44px summary height, subdued green styling, focus visibility, and narrow-screen safety.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/sync/SyncStatusBanner.test.tsx`
Expected: 1 test file passes with no failures.

### Task 2: Regression verification

**Files:**
- Verify: `app/src/features/sync/SyncStatusBanner.tsx`
- Verify: `app/src/features/sync/syncStatus.css`
- Verify: `app/src/features/sync/SyncStatusBanner.test.tsx`

- [ ] **Step 1: Run the full frontend suite**

Run: `npm test`
Expected: all frontend unit tests pass.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: TypeScript and Vite finish with exit code 0.

- [ ] **Step 3: Inspect the diff and commit**

Run: `git diff --check` and `git status --short`
Expected: no whitespace errors; only the plan, component, CSS, and component test are changed.

Commit: `git commit -m "feat: compact successful sync status"`
