# Brew Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add brew log list and create flow so a signed-in user can record each coffee brewing attempt against a saved bean.

**Architecture:** Keep brew form mapping, Supabase data access, and UI separate. `brewForm` converts form state into `brew_logs` insert payloads, `brewLogService` handles Supabase reads/writes, and `BrewLogPanel` renders a simple create/list workflow after beans are loaded.

**Tech Stack:** React, TypeScript, Supabase Postgres, Vitest.

---

## Scope

This plan implements:

- Brew log list query for the current user.
- Create brew log form tied to an existing bean.
- Insert into `public.brew_logs`.
- Refresh list after create.
- Basic loading, empty, and error states.

This plan does not implement:

- Editing brew logs.
- Deleting brew logs.
- Multi-step pour timer.
- Bluetooth scale integration.
- AI recommendation.
- Charts or statistics.

## Files

- Create: `app/src/features/brews/brewTypes.ts`
- Create: `app/src/features/brews/brewForm.ts`
- Create: `app/src/features/brews/brewForm.test.ts`
- Create: `app/src/features/brews/brewLogService.ts`
- Create: `app/src/features/brews/BrewLogPanel.tsx`
- Create: `app/src/features/brews/brews.css`
- Modify: `app/src/features/beans/BeanDashboard.tsx`

## Tasks

1. Add failing tests for brew log payload mapping.
2. Implement brew types and form mapping.
3. Add Supabase brew log service.
4. Add brew log create/list UI.
5. Wire brew logs into bean dashboard.
6. Run tests and build.
7. Push to `foundation`.
