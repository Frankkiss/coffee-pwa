# Backup Reminder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record the most recent JSON backup export locally and show a lightweight reminder when the user has never exported or has not exported for more than 7 days.

**Architecture:** Keep cloud data and JSON backup generation unchanged. Add a small localStorage-backed metadata helper inside the backup feature, use pure functions for reminder state, and render the reminder in `BackupPanel`. Only JSON backup export updates the reminder metadata; CSV export does not.

**Tech Stack:** React, TypeScript, browser localStorage, Vitest, Vite.

---

## File Structure

- Create `app/src/features/backup/backupReminder.ts` for local metadata parsing, persistence, and reminder view model.
- Create `app/src/features/backup/backupReminder.test.ts` for pure reminder behavior and storage round-trip.
- Modify `app/src/features/backup/BackupPanel.tsx` to read the reminder on mount, update it after successful JSON export, and display the reminder.
- Modify `app/src/features/backup/backup.css` for compact reminder styling.
- No Supabase schema change is required.
- No Edge Function change is required.

## Task 1: Reminder Model And Storage

**Files:**
- Create: `app/src/features/backup/backupReminder.ts`
- Create: `app/src/features/backup/backupReminder.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  buildBackupReminder,
  readBackupReminderMeta,
  writeBackupReminderMeta,
} from './backupReminder'

describe('backup reminder', () => {
  it('asks for a backup when no previous export is recorded', () => {
    expect(buildBackupReminder(null, new Date('2026-06-15T00:00:00Z'))).toMatchObject({
      tone: 'warning',
      title: '尚未创建本地备份',
    })
  })

  it('shows a normal state when the last export is within seven days', () => {
    expect(
      buildBackupReminder(
        { exportedAt: '2026-06-12T00:00:00.000Z', fileName: 'coffee-backup-2026-06-12.json' },
        new Date('2026-06-15T00:00:00Z'),
      ),
    ).toMatchObject({
      tone: 'ok',
      title: '最近已备份',
      fileName: 'coffee-backup-2026-06-12.json',
      daysSinceExport: 3,
    })
  })

  it('warns when the last export is older than seven days', () => {
    expect(
      buildBackupReminder(
        { exportedAt: '2026-06-01T00:00:00.000Z', fileName: 'coffee-backup-2026-06-01.json' },
        new Date('2026-06-15T00:00:00Z'),
      ),
    ).toMatchObject({
      tone: 'warning',
      title: '建议导出一次备份',
      daysSinceExport: 14,
    })
  })

  it('round-trips valid metadata through localStorage', () => {
    const storage = window.localStorage
    storage.clear()

    writeBackupReminderMeta(storage, {
      exportedAt: '2026-06-15T00:00:00.000Z',
      fileName: 'coffee-backup-2026-06-15.json',
    })

    expect(readBackupReminderMeta(storage)).toEqual({
      exportedAt: '2026-06-15T00:00:00.000Z',
      fileName: 'coffee-backup-2026-06-15.json',
    })
  })
})
```

- [ ] **Step 2: Run focused test to verify RED**

Run: `npm test --prefix app -- src/features/backup/backupReminder.test.ts`

Expected: fail because `backupReminder.ts` does not exist.

- [ ] **Step 3: Implement helper**

Create a helper that exports:

```ts
export type BackupReminderMeta = {
  exportedAt: string
  fileName: string
}

export type BackupReminderView = {
  tone: 'ok' | 'warning'
  title: string
  message: string
  fileName: string | null
  daysSinceExport: number | null
}

export const backupReminderStorageKey = 'kaday:last-json-backup'
```

Implement `readBackupReminderMeta`, `writeBackupReminderMeta`, and `buildBackupReminder`.

- [ ] **Step 4: Re-run focused test**

Run: `npm test --prefix app -- src/features/backup/backupReminder.test.ts`

Expected: pass.

## Task 2: BackupPanel UI

**Files:**
- Modify: `app/src/features/backup/BackupPanel.tsx`
- Modify: `app/src/features/backup/backup.css`

- [ ] **Step 1: Add reminder state**

Import `useEffect`, `BackupReminderMeta`, `buildBackupReminder`, `readBackupReminderMeta`, and `writeBackupReminderMeta`.

- [ ] **Step 2: Read local metadata on mount**

Use `useEffect` to read `window.localStorage` once and set reminder state. If storage is unavailable, keep state as `null` and show the never-backed-up warning.

- [ ] **Step 3: Update metadata after successful JSON export**

After `recordBackupExport` succeeds, write `{ exportedAt, fileName }` to localStorage and update component state.

- [ ] **Step 4: Render reminder**

Display the reminder under the backup panel description with:

- Title.
- Message.
- Optional file name.

## Task 3: Verification

**Files:**
- All changed files.

- [ ] **Step 1: Run backup tests**

Run: `npm test --prefix app -- src/features/backup`

- [ ] **Step 2: Run all tests**

Run: `npm test --prefix app`

- [ ] **Step 3: Run production build**

Run: `npm run build --prefix app`

- [ ] **Step 4: Secret scan**

Run: `rg -n "DEEPSEEK_API_KEY=|service_role|sk-[A-Za-z0-9]|VITE_SUPABASE_ANON_KEY=." -S .`

- [ ] **Step 5: Commit**

Run:

```bash
git add docs/superpowers/plans/2026-06-15-backup-reminder-plan.md app/src/features/backup
git commit -m "Add backup export reminder"
```
