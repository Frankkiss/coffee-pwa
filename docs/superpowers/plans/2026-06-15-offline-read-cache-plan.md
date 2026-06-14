# Offline Read Cache v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add IndexedDB read-through caching so 咖Day can show recent beans and brew logs when Supabase reads fail or the phone is offline.

**Architecture:** Create a focused `offline` feature module for cache snapshots and IndexedDB persistence. Existing services remain cloud-first; UI components catch read failures, fall back to cache for the current user, and clearly show an offline cache status.

**Tech Stack:** React, TypeScript, Vitest, browser IndexedDB API, existing Supabase service functions.

---

### Task 1: Cache Snapshot Model

**Files:**
- Create: `app/src/features/offline/offlineCache.test.ts`
- Create: `app/src/features/offline/offlineCache.ts`

- [ ] **Step 1: Write the failing test**

Create tests for `buildOfflineCacheSnapshot`, `isOfflineCacheForUser`, and `getOfflineRowsForUser`.

- [ ] **Step 2: Verify RED**

Run: `npm run test --prefix app -- src/features/offline/offlineCache.test.ts`

Expected: FAIL because `offlineCache.ts` does not exist.

- [ ] **Step 3: Implement pure cache snapshot helpers**

Implement the snapshot type and user guard before adding IndexedDB I/O.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test --prefix app -- src/features/offline/offlineCache.test.ts`

Expected: PASS.

### Task 2: IndexedDB Read And Write

**Files:**
- Modify: `app/src/features/offline/offlineCache.ts`

- [ ] **Step 1: Add IndexedDB helpers**

Add `writeOfflineCache(kind, snapshot)` and `readOfflineCache(kind, userId)` using one database named `kaday-offline-cache`.

- [ ] **Step 2: Keep browser-only failures non-fatal**

If IndexedDB is unavailable or blocked, return `null` for reads and silently skip writes.

- [ ] **Step 3: Verify TypeScript**

Run: `npm run build --prefix app`

Expected: PASS.

### Task 3: Wire Cache Into UI Reads

**Files:**
- Modify: `app/src/features/home/HomeOverview.tsx`
- Modify: `app/src/features/beans/BeanDashboard.tsx`
- Modify: `app/src/features/brews/BrewLogPanel.tsx`

- [ ] **Step 1: Cache successful cloud reads**

After successful Supabase reads, write the rows to IndexedDB using the signed-in user id.

- [ ] **Step 2: Fallback to cache on read failure**

If cloud reads fail, try reading cache for the same user. If cache exists, render it and show a status message.

- [ ] **Step 3: Keep empty-cache errors visible**

If both cloud and cache fail, show the existing error.

- [ ] **Step 4: Verify all tests and build**

Run:

```powershell
npm run test --prefix app
npm run build --prefix app
npm run lint --prefix app
```

Expected: all pass.

### Task 4: Commit And Push

**Files:**
- All changed files.

- [ ] **Step 1: Inspect changes**

Run: `git diff --stat` and `git diff --check`.

- [ ] **Step 2: Commit**

Run:

```powershell
git add docs/superpowers/plans/2026-06-15-offline-read-cache-plan.md app/src/features/offline app/src/features/home/HomeOverview.tsx app/src/features/beans/BeanDashboard.tsx app/src/features/brews/BrewLogPanel.tsx
git commit -m "Add offline read cache"
```

- [ ] **Step 3: Push**

Run:

```powershell
$env:HTTP_PROXY=''
$env:HTTPS_PROXY=''
$env:ALL_PROXY=''
git push origin foundation
```
