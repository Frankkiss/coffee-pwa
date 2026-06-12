# Magic Link Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase email Magic Link login to the PWA without exposing private keys.

**Architecture:** The frontend uses `@supabase/supabase-js` and the public anon key to send a Magic Link with `signInWithOtp`. A small redirect utility calculates the correct return URL for GitHub Pages and local development. The UI handles missing environment variables gracefully so deployments do not crash before the user configures GitHub repository variables.

**Tech Stack:** React, TypeScript, Supabase Auth, Vitest, GitHub Actions.

---

## Scope

This plan implements:

- Magic Link email form.
- Session detection and sign out.
- Redirect URL helper and unit tests.
- GitHub Actions build-time environment variable wiring.
- User-facing setup instructions for Supabase Auth redirect URLs and GitHub variables.

This plan does not implement:

- Bean CRUD.
- Brew logs.
- AI recommendations.
- Source import.
- Offline queue.

## Required Supabase Dashboard Settings

Set these later in Supabase:

- Site URL: `https://frankkiss.github.io/coffee-pwa/`
- Redirect URLs:
  - `https://frankkiss.github.io/coffee-pwa/`
  - `http://localhost:5173/coffee-pwa/`

## Required GitHub Repository Variables

Set these later in GitHub:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The anon key is public by design, but it should still be managed as a deployment variable instead of being hard-coded.

## Tasks

1. Add Vitest and test scripts.
2. Write failing redirect utility tests.
3. Implement redirect utility.
4. Replace auth placeholder with Magic Link form and session display.
5. Add GitHub Actions environment wiring.
6. Run tests and build.
7. Push to `foundation`.
