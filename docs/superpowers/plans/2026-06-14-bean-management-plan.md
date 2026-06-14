# Bean Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add coffee bean edit, soft delete, search, and filter support without changing database schema.

**Architecture:** Keep conversion logic in `beanForm.ts`, filtering in a new pure `beanFilters.ts`, Supabase writes in `beanService.ts`, and UI state in `BeanDashboard.tsx`. Deletes are soft deletes by setting `deleted_at`, matching existing list queries.

**Tech Stack:** React, TypeScript, Vitest, Supabase JS.

---

### Task 1: Form and Filter Helpers

**Files:**
- Modify: `app/src/features/beans/beanTypes.ts`
- Modify: `app/src/features/beans/beanForm.ts`
- Modify: `app/src/features/beans/beanForm.test.ts`
- Create: `app/src/features/beans/beanFilters.ts`
- Create: `app/src/features/beans/beanFilters.test.ts`

- [ ] Add `BeanUpdatePayload` type.
- [ ] Add `createBeanFormFromBean(bean)`.
- [ ] Add `toBeanUpdatePayload(form)`.
- [ ] Add `filterBeans(beans, filters)` with search, process, and roast level filters.
- [ ] Run helper tests and verify they fail before implementation, then pass after implementation.

### Task 2: Supabase Service

**Files:**
- Modify: `app/src/features/beans/beanService.ts`

- [ ] Add `updateBean(supabase, beanId, payload)`.
- [ ] Add `softDeleteBean(supabase, beanId)`.
- [ ] Return updated rows from both operations so UI can update local state.

### Task 3: Bean Dashboard UI

**Files:**
- Modify: `app/src/features/beans/BeanDashboard.tsx`
- Modify: `app/src/features/beans/beans.css`

- [ ] Add search and filter controls above the bean list.
- [ ] Track `editingBeanId`.
- [ ] When editing, populate the form from the selected bean.
- [ ] Submit creates when no bean is being edited and updates when editing.
- [ ] Add cancel edit button.
- [ ] Add soft delete button with browser confirmation.
- [ ] Render filtered beans rather than all beans.

### Task 4: Verification and Publish

- [ ] Run `npm test --prefix app`.
- [ ] Run `npm run build --prefix app`.
- [ ] Scan for secrets.
- [ ] Commit and push.
- [ ] Verify GitHub Pages latest HTML and assets return HTTP 200.
