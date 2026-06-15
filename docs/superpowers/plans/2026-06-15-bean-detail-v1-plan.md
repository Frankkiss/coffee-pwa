# Bean Detail V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-dashboard bean detail view that shows full bean information and brew history summaries without introducing app routing.

**Architecture:** Keep navigation local to `BeanDashboard` through `selectedBeanId`. Add a focused `beanDetailModel` for derived summaries and a `BeanDetailPanel` for rendering. Reuse existing `listBrewLogs` as read-only detail data.

**Tech Stack:** React, TypeScript, Vitest, Supabase client, existing CSS modules.

---

### Task 1: Bean Detail View Model

**Files:**
- Create: `app/src/features/beans/beanDetailModel.ts`
- Create: `app/src/features/beans/beanDetailModel.test.ts`

- [ ] Add tests for building bean detail fields, blend labels, recent brew logs, best rated brew log, and pinned recipe count.
- [ ] Implement pure model helpers with no Supabase dependency.

### Task 2: Bean Detail Panel UI

**Files:**
- Create: `app/src/features/beans/BeanDetailPanel.tsx`
- Modify: `app/src/features/beans/beans.css`

- [ ] Render title, meta fields, blend section, flavor section, stock section, brew summary cards, and action buttons.
- [ ] Keep layout mobile-first and compatible with existing coffee theme.

### Task 3: Wire Into BeanDashboard

**Files:**
- Modify: `app/src/features/beans/BeanDashboard.tsx`

- [ ] Load brew logs for detail summaries.
- [ ] Add `selectedBeanId` state.
- [ ] Add detail buttons on bean cards.
- [ ] Switch between list/form view and detail view.
- [ ] Let “编辑豆子” return to the existing edit form.

### Task 4: Verify

**Files:**
- All modified files above.

- [ ] Run focused tests for bean detail.
- [ ] Run `npm run test`, `npm run lint`, and `npm run build`.
- [ ] Commit and push if credentials allow.
