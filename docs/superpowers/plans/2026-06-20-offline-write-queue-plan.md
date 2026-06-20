# Offline Write Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first weak-network write flow so bean and brew-log mutations are queued locally when cloud writes fail, then retried when the app returns online.

**Architecture:** Keep Supabase as the source of truth for signed-in users. Add an IndexedDB-backed pending mutation queue beside the existing snapshot cache; feature panels optimistically update local state, enqueue failed writes, and retry queued mutations on load and `online` events. Avoid complex conflict merge in this version.

**Tech Stack:** React, TypeScript, Supabase JS, IndexedDB, Vitest, Vite.

---

### Task 1: Offline Queue Core

**Files:**
- Modify: `app/src/features/offline/offlineCache.ts`
- Test: `app/src/features/offline/offlineCache.test.ts`

- [ ] **Step 1: Write failing queue tests**

Add tests for creating a user-scoped pending mutation, filtering queued mutations by user, and detecting retryable write failures.

- [ ] **Step 2: Run focused tests**

Run: `npm test -- offlineCache.test.ts`

Expected: fail because queue helpers do not exist.

- [ ] **Step 3: Implement minimal queue helpers**

Add `OfflinePendingMutation`, `createOfflinePendingMutation`, `isOfflineWriteFailure`, and `getPendingMutationsForUser`. Extend the IndexedDB schema with a `pendingMutations` store and add queue read/write/remove helpers.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- offlineCache.test.ts`

Expected: pass.

### Task 2: Bean Panel Queue Integration

**Files:**
- Modify: `app/src/features/beans/BeanDashboard.tsx`

- [ ] **Step 1: Use queue helpers in bean writes**

For create/update/delete failures that are retryable, enqueue the mutation, update local state optimistically, write the snapshot cache, and show a clear pending-sync status.

- [ ] **Step 2: Retry pending bean mutations**

On initial load and browser `online`, process queued bean mutations in created order. Remove successful mutations, mark failed attempts, refresh beans from Supabase, and update the snapshot cache.

### Task 3: Brew Log Panel Queue Integration

**Files:**
- Modify: `app/src/features/brews/BrewLogPanel.tsx`

- [ ] **Step 1: Use queue helpers in brew-log writes**

For create/update/delete/pin failures that are retryable, enqueue the mutation, update local state optimistically, write the snapshot cache, and show a clear pending-sync status.

- [ ] **Step 2: Retry pending brew-log mutations**

On initial load and browser `online`, process queued brew-log mutations in created order. Remove successful mutations, mark failed attempts, refresh brew logs from Supabase, and update the snapshot cache.

### Task 4: Verification

**Files:**
- No source changes unless verification exposes bugs.

- [ ] **Step 1: Run automated checks**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all pass.

- [ ] **Step 2: Review repository state**

Run: `git status --short`

Expected: only the implementation plan and intended source/test files are changed.
