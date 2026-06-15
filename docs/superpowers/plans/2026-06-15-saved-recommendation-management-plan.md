# Saved Recommendation Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add detail viewing, accepted-state editing, and soft delete for saved brew recommendations.

**Architecture:** Keep Supabase mutations in `recommendationService.ts`, saved-row view-model parsing in `savedRecommendationList.ts`, and interaction state in `RecommendationPanel.tsx`. Use existing `accepted` and `deleted_at` columns; no schema change is required.

**Tech Stack:** React, TypeScript, Supabase, Vitest, CSS.

---

### Task 1: Saved Recommendation Detail Model

**Files:**
- Modify: `app/src/features/recommendations/savedRecommendationList.ts`
- Modify: `app/src/features/recommendations/savedRecommendationList.test.ts`

- [ ] Write failing tests for full AI text, template names, rule reasons, and accepted label.
- [ ] Run focused test and confirm it fails.
- [ ] Extend `SavedRecommendationCard` with detail fields.
- [ ] Run focused test and confirm it passes.

### Task 2: Saved Recommendation Mutations

**Files:**
- Modify: `app/src/features/recommendations/recommendationService.ts`

- [ ] Add `updateSavedRecommendationAccepted(supabase, id, accepted)`.
- [ ] Add `softDeleteSavedRecommendation(supabase, id)`.
- [ ] Keep existing `listSavedRecommendations` filtering `deleted_at is null`.

### Task 3: Saved Recommendation UI

**Files:**
- Modify: `app/src/features/recommendations/RecommendationPanel.tsx`
- Modify: `app/src/features/recommendations/recommendations.css`

- [ ] Add expanded detail state for saved recommendation cards.
- [ ] Add detail button, accepted toggle button, and delete button.
- [ ] Delete uses `window.confirm` before soft delete.
- [ ] After accepted toggle or delete, refresh saved recommendations.

### Task 4: Verification And Publish

**Files:**
- All changed files.

- [ ] Run `npm run test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Commit with `Manage saved recommendations`.
- [ ] Push `foundation`.
