# Save AI Recommendation v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to save a generated brew recommendation as a distinct AI recommendation record without mixing it into real brew logs.

**Architecture:** Keep recommendation saving inside `app/src/features/recommendations/`. A pure payload builder converts rule and AI output into `ai_recommendations` rows; a service writes that row to Supabase; the panel exposes one save button after recommendation generation.

**Tech Stack:** React, TypeScript, Vitest, Supabase Postgres table `ai_recommendations`.

---

### Task 1: Payload Builder

**Files:**
- Create: `app/src/features/recommendations/savedRecommendation.test.ts`
- Create: `app/src/features/recommendations/savedRecommendation.ts`

- [ ] **Step 1: Write failing test**

Test that a generated recommendation becomes a row payload with `user_id`, `bean_id`, structured `input_context`, structured `recommendation`, and `model_name`.

- [ ] **Step 2: Verify RED**

Run: `npm run test --prefix app -- src/features/recommendations/savedRecommendation.test.ts`

Expected: FAIL because `savedRecommendation.ts` does not exist.

- [ ] **Step 3: Implement builder**

Implement `buildSavedRecommendationPayload({ userId, ruleRecommendation, aiRecommendation })`.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test --prefix app -- src/features/recommendations/savedRecommendation.test.ts`

Expected: PASS.

### Task 2: Supabase Save Service

**Files:**
- Modify: `app/src/features/recommendations/recommendationService.ts`

- [ ] **Step 1: Add save function**

Add `saveRecommendation(supabase, payload)` that inserts into `ai_recommendations`, selects the created row, and throws a normal Error on Supabase errors.

- [ ] **Step 2: Verify TypeScript**

Run: `npm run build --prefix app`

Expected: PASS.

### Task 3: Recommendation Panel UI

**Files:**
- Modify: `app/src/features/recommendations/RecommendationPanel.tsx`
- Modify: `app/src/features/recommendations/recommendations.css`

- [ ] **Step 1: Use session prop**

Pass `session.user.id` into the save payload builder.

- [ ] **Step 2: Add save button**

Show “保存本次推荐” after a rule recommendation exists. Disable it while saving. Save rule-only results too, but show AI status clearly.

- [ ] **Step 3: Show status**

Display saved/failed status without clearing the generated recommendation.

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
git add docs/superpowers/plans/2026-06-15-save-ai-recommendation-plan.md app/src/features/recommendations
git commit -m "Save generated recommendations"
$env:HTTP_PROXY=''
$env:HTTPS_PROXY=''
$env:ALL_PROXY=''
git push origin foundation
```
