# Home Overview v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a simple mobile-first home overview for 咖Day with quick actions, bean/brew summaries, and backup awareness.

**Architecture:** Add a focused `home` feature folder. Pure model helpers summarize beans, brew logs, backup state, and session state; the React component renders those summaries and links to existing sections.

**Tech Stack:** React, TypeScript, Vitest, Supabase client, existing backup reminder helpers.

---

### Task 1: Home Summary Model

**Files:**
- Create: `app/src/features/home/homeOverviewModel.test.ts`
- Create: `app/src/features/home/homeOverviewModel.ts`

- [ ] **Step 1: Write the failing test**

Test `buildHomeOverview` with sample beans, brew logs, and backup reminder data. Assert counts, current beans, latest brews, and the backup card.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --prefix app -- app/src/features/home/homeOverviewModel.test.ts`

Expected: FAIL because `homeOverviewModel.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement `buildHomeOverview`, `formatShortDate`, and `formatBrewSummary` without network calls.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --prefix app -- app/src/features/home/homeOverviewModel.test.ts`

Expected: PASS.

### Task 2: Home Overview Component

**Files:**
- Create: `app/src/features/home/HomeOverview.tsx`
- Create: `app/src/features/home/home.css`
- Modify: `app/src/features/auth/AuthPanel.tsx`

- [ ] **Step 1: Implement component**

Fetch beans and brew logs using existing services, read backup reminder metadata from local storage, and render the overview with loading, error, empty, and normal states.

- [ ] **Step 2: Insert into authenticated layout**

Render `HomeOverview` immediately after the account bar.

- [ ] **Step 3: Apply concise coffee-themed UI**

Use the existing cream/coffee/caramel CSS variables, add a softer rounded Chinese font stack, and keep the layout compact on mobile.

### Task 3: Section Anchors And Verification

**Files:**
- Modify: `app/src/features/beans/BeanDashboard.tsx`
- Modify: `app/src/features/sourceImports/SourceImportPanel.tsx`
- Modify: `app/src/features/brews/BrewLogPanel.tsx`
- Modify: `app/src/features/recommendations/RecommendationPanel.tsx`
- Modify: `app/src/features/backup/BackupPanel.tsx`

- [ ] **Step 1: Add stable ids**

Add ids used by home quick actions: `bean-dashboard`, `source-import`, `brew-log`, `recommendation`, and `backup`.

- [ ] **Step 2: Run focused tests**

Run: `npm run test --prefix app -- app/src/features/home/homeOverviewModel.test.ts`

- [ ] **Step 3: Run build and lint**

Run: `npm run build --prefix app` and `npm run lint --prefix app`.

- [ ] **Step 4: Review git diff**

Run: `git diff --stat` and inspect changed files before final response.
