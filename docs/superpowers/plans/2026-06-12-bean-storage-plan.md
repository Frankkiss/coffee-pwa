# Bean Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first real business feature: a signed-in user can view their coffee bean list and create a new bean record in Supabase.

**Architecture:** Keep bean form mapping, Supabase data access, and React UI separate. `beanForm` converts form state into insert payloads, `beanService` handles database calls, and `BeanDashboard` renders the mobile-first list/create workflow after authentication.

**Tech Stack:** React, TypeScript, Supabase Postgres, Vitest.

---

## Scope

This plan implements:

- Bean list query for the current user through RLS.
- Create bean form with core first-version fields.
- Insert into `public.beans`.
- Refresh list after create.
- Basic loading, empty, and error states.

This plan does not implement:

- Editing beans.
- Deleting beans.
- Bean photos.
- Source import.
- Brew logs.
- Backup/export.
- AI recommendations.

## Files

- Create: `app/src/features/beans/beanTypes.ts`
- Create: `app/src/features/beans/beanForm.ts`
- Create: `app/src/features/beans/beanForm.test.ts`
- Create: `app/src/features/beans/beanService.ts`
- Create: `app/src/features/beans/BeanDashboard.tsx`
- Create: `app/src/features/beans/beans.css`
- Modify: `app/src/features/auth/AuthPanel.tsx`
- Modify: `app/src/features/auth/auth.css`

## Tasks

1. Add failing tests for bean form payload mapping.
2. Implement bean types and form mapping.
3. Add Supabase bean service.
4. Add authenticated bean dashboard UI.
5. Wire dashboard into auth session view.
6. Run tests and build.
7. Push to `foundation`.
