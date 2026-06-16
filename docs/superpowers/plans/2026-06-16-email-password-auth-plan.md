# Email Password Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email/password registration and login while keeping Magic Link as a fallback.

**Architecture:** Keep Supabase Auth as the only identity provider. Add small auth form validation helpers for testable behavior, then update `AuthPanel` to call `signInWithPassword`, `signUp`, `resetPasswordForEmail`, and `updateUser` for password recovery.

**Tech Stack:** React, TypeScript, Supabase Auth, Vitest.

---

### Task 1: Auth Form Validation Helpers

**Files:**
- Create: `app/src/features/auth/authForm.ts`
- Test: `app/src/features/auth/authForm.test.ts`

- [ ] Write tests for login, signup, reset request, and password update validation.
- [ ] Implement validation helpers with concrete Chinese error messages.
- [ ] Run `npm run test --prefix app -- authForm`.

### Task 2: AuthPanel Password Modes

**Files:**
- Modify: `app/src/features/auth/AuthPanel.tsx`
- Modify: `app/src/features/auth/auth.css`

- [ ] Add auth mode state: login, signup, magic-link, reset-request, password-recovery.
- [ ] Wire login to `supabase.auth.signInWithPassword`.
- [ ] Wire signup to `supabase.auth.signUp`.
- [ ] Keep Magic Link with `supabase.auth.signInWithOtp`.
- [ ] Wire reset request to `supabase.auth.resetPasswordForEmail`.
- [ ] Detect `PASSWORD_RECOVERY` event and show new password form.
- [ ] Wire new password submit to `supabase.auth.updateUser`.

### Task 3: Verification

**Commands:**
- `npm run test --prefix app`
- `npm run build --prefix app`
- `npm run lint --prefix app`

Expected: all pass.
