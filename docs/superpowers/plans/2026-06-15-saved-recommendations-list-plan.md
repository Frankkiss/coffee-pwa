# Saved Recommendations List v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the user's latest saved brew recommendations in the recommendation panel.

**Architecture:** Keep the feature inside `app/src/features/recommendations/`. Add a pure view-model mapper for saved recommendation rows, a Supabase list service, and a compact list UI that refreshes after saving.

**Tech Stack:** React, TypeScript, Vitest, Supabase Postgres table `ai_recommendations`.

---

### Task 1: Saved Recommendation View Model

**Files:**
- Create: `app/src/features/recommendations/savedRecommendationList.test.ts`
- Create: `app/src/features/recommendations/savedRecommendationList.ts`

- [ ] **Step 1: Write failing test**

Test that a saved row maps to target name, formatted date, recommended parameters, and AI summary text.

- [ ] **Step 2: Verify RED**

Run: `npm run test --prefix app -- src/features/recommendations/savedRecommendationList.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement mapper**

Implement `toSavedRecommendationCard(row)` and `toSavedRecommendationCards(rows)`.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test --prefix app -- src/features/recommendations/savedRecommendationList.test.ts`

Expected: PASS.

### Task 2: Supabase Listing Service

**Files:**
- Modify: `app/src/features/recommendations/recommendationService.ts`

- [ ] **Step 1: Add `listSavedRecommendations`**

Read `ai_recommendations`, filter `deleted_at` null, order by `created_at` descending, limit 5.

- [ ] **Step 2: Verify build**

Run: `npm run build --prefix app`

Expected: PASS.

### Task 3: Recommendation Panel UI

**Files:**
- Modify: `app/src/features/recommendations/RecommendationPanel.tsx`
- Modify: `app/src/features/recommendations/recommendations.css`

- [ ] **Step 1: Load saved recommendations on mount**

Read saved records without blocking recommendation generation.

- [ ] **Step 2: Render compact list**

Show loading, empty, error, and card states.

- [ ] **Step 3: Refresh after save**

After `saveRecommendation` succeeds, reload the saved list.

### Task 4: Verification And Publish

**Files:**
- All changed files.

- [ ] **Step 1: Run checks**

Run:

```powershell
npm run test --prefix app
npm run build --prefix app
npm run lint --prefix app
```

- [ ] **Step 2: Commit and push**

Run:

```powershell
git add docs/superpowers/plans/2026-06-15-saved-recommendations-list-plan.md app/src/features/recommendations
git commit -m "Show saved recommendations"
$env:HTTP_PROXY=''
$env:HTTPS_PROXY=''
$env:ALL_PROXY=''
git push origin foundation
```
