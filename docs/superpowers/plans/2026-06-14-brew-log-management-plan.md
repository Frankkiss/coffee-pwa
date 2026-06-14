# Brew Log Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add edit, soft delete, and filter/search management for brew logs.

**Architecture:** Reuse the current brew log form and service boundaries. Add pure helper functions for update payload mapping and list filtering, then wire those helpers into `BrewLogPanel` so the UI can create or update records with the same form.

**Tech Stack:** React, TypeScript, Supabase JS, Vitest, Vite.

---

## File Structure

- Modify `app/src/features/brews/brewTypes.ts` to add `BrewLogUpdatePayload` and `BrewLogFilters`.
- Modify `app/src/features/brews/brewForm.ts` to add edit-mode helpers.
- Modify `app/src/features/brews/brewForm.test.ts` to cover edit payload behavior.
- Create `app/src/features/brews/brewFilters.ts` for pure search/filter logic.
- Create `app/src/features/brews/brewFilters.test.ts` for filter behavior.
- Modify `app/src/features/brews/brewLogService.ts` to add update and soft delete calls.
- Modify `app/src/features/brews/BrewLogPanel.tsx` to wire editing, deleting, and filters.
- Modify `app/src/features/brews/brews.css` for filter controls, edit state, and card action buttons.

## Task 1: Brew Form Edit Helpers

**Files:**
- Modify: `app/src/features/brews/brewTypes.ts`
- Modify: `app/src/features/brews/brewForm.ts`
- Test: `app/src/features/brews/brewForm.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests proving `createBrewFormFromLog` maps an existing log back to form strings and `toBrewLogUpdatePayload` does not include `user_id`.

- [ ] **Step 2: Run the focused test**

Run: `npm test --prefix app -- app/src/features/brews/brewForm.test.ts`

Expected before implementation: fail because `createBrewFormFromLog` and `toBrewLogUpdatePayload` are missing.

- [ ] **Step 3: Implement helpers**

Add `BrewLogUpdatePayload`, `createBrewFormFromLog`, `toBrewLogUpdatePayload`, and number/string conversion helpers.

- [ ] **Step 4: Re-run focused test**

Run: `npm test --prefix app -- app/src/features/brews/brewForm.test.ts`

Expected after implementation: pass.

## Task 2: Brew Log Filtering

**Files:**
- Create: `app/src/features/brews/brewFilters.ts`
- Create: `app/src/features/brews/brewFilters.test.ts`
- Modify: `app/src/features/brews/brewTypes.ts`

- [ ] **Step 1: Write failing tests**

Cover keyword search across method, dripper, grinder, grind setting, notes, and flavor tags; cover bean filter, method filter, and pinned-recipe filter.

- [ ] **Step 2: Run the focused test**

Run: `npm test --prefix app -- app/src/features/brews/brewFilters.test.ts`

Expected before implementation: fail because the file/function is missing.

- [ ] **Step 3: Implement filtering**

Add `filterBrewLogs(logs, filters)` as a pure function.

- [ ] **Step 4: Re-run focused test**

Run: `npm test --prefix app -- app/src/features/brews/brewFilters.test.ts`

Expected after implementation: pass.

## Task 3: Service And UI Wiring

**Files:**
- Modify: `app/src/features/brews/brewLogService.ts`
- Modify: `app/src/features/brews/BrewLogPanel.tsx`
- Modify: `app/src/features/brews/brews.css`

- [ ] **Step 1: Add service methods**

Add `updateBrewLog(supabase, logId, payload)` and `softDeleteBrewLog(supabase, logId)`.

- [ ] **Step 2: Wire panel state**

Add `filters`, `editingLogId`, `handleEdit`, `handleCancelEdit`, `handleDelete`, and update-aware submit logic.

- [ ] **Step 3: Add controls**

Add search, bean selector, method selector, and pinned selector above the list.

- [ ] **Step 4: Improve cards**

Show bean name, method, ratio, water temperature, total time, rating, flavor tags, notes, and edit/delete actions in each card.

## Task 4: Verification And Delivery

**Files:**
- All changed files.

- [ ] **Step 1: Run all tests**

Run: `npm test --prefix app`

- [ ] **Step 2: Run production build**

Run: `npm run build --prefix app`

- [ ] **Step 3: Run secret scan**

Run: `rg -n "DEEPSEEK_API_KEY=|service_role|sk-[A-Za-z0-9]|VITE_SUPABASE_ANON_KEY=." -S .`

Expected: no real secret values in committed source.

- [ ] **Step 4: Commit and push**

Run:

```bash
git add docs/superpowers/plans/2026-06-14-brew-log-management-plan.md app/src/features/brews
git commit -m "Add brew log edit delete and filters"
git push origin foundation
```
