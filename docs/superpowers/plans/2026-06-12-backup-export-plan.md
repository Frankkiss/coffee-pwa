# JSON Backup Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a logged-in JSON backup export so the user can download all active coffee beans and brew logs as a small local file.

**Architecture:** The backup feature lives in `app/src/features/backup/`, matching the existing `beans` and `brews` feature folders. A pure builder creates a versioned JSON document, a Supabase service reads active rows and records export metadata, and a React panel downloads the generated file.

**Tech Stack:** React, TypeScript, Vitest, Supabase JS, browser Blob download.

---

### Task 1: Backup JSON Builder

**Files:**
- Create: `app/src/features/backup/backupTypes.ts`
- Create: `app/src/features/backup/backupExport.ts`
- Test: `app/src/features/backup/backupExport.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import { buildBackupDocument, createBackupFileName } from './backupExport'

describe('backup export', () => {
  it('builds a versioned JSON backup document with record counts', () => {
    const beans = [
      {
        id: 'bean-1',
        user_id: 'user-1',
        name: 'Ethiopia Test',
        roaster: 'Test Roaster',
        origin: 'Ethiopia',
        farm_or_station: null,
        process: '水洗',
        variety: null,
        altitude_meters: null,
        roast_date: null,
        roast_level: '浅烘',
        flavor_tags: ['柑橘'],
        flavor_notes: null,
        net_weight_grams: 100,
        remaining_grams: 88,
        price: null,
        purchase_date: null,
        source_url: null,
        image_url: null,
        notes: null,
        created_at: '2026-06-12T01:00:00.000Z',
        updated_at: '2026-06-12T01:00:00.000Z',
        deleted_at: null,
        schema_version: 1,
      },
    ] satisfies Bean[]
    const brewLogs = [
      {
        id: 'brew-1',
        user_id: 'user-1',
        bean_id: 'bean-1',
        brewed_at: '2026-06-12T02:00:00.000Z',
        method: 'V60',
        dripper: null,
        filter_paper: null,
        grinder: null,
        grind_setting: '20',
        coffee_grams: 15,
        water_grams: 240,
        ratio: '1:16',
        water_temperature_c: 92,
        total_time_seconds: 150,
        pour_steps: [],
        rating: 4,
        acidity: null,
        sweetness: null,
        bitterness: null,
        astringency: null,
        body: null,
        aftertaste: null,
        flavor_tags: ['干净'],
        is_pinned_recipe: false,
        notes: null,
        created_at: '2026-06-12T02:00:00.000Z',
        updated_at: '2026-06-12T02:00:00.000Z',
        deleted_at: null,
        schema_version: 1,
      },
    ] satisfies BrewLog[]

    const backup = buildBackupDocument({
      userId: 'user-1',
      exportedAt: '2026-06-12T03:00:00.000Z',
      beans,
      brewLogs,
    })

    expect(backup.schemaVersion).toBe(1)
    expect(backup.userId).toBe('user-1')
    expect(backup.exportedAt).toBe('2026-06-12T03:00:00.000Z')
    expect(backup.includesImages).toBe(false)
    expect(backup.recordCounts).toEqual({ beans: 1, brewLogs: 1 })
    expect(backup.data.beans[0].name).toBe('Ethiopia Test')
    expect(backup.data.brewLogs[0].ratio).toBe('1:16')
  })

  it('creates a date-based JSON backup filename', () => {
    expect(createBackupFileName(new Date('2026-06-12T03:00:00.000Z'))).toBe(
      'coffee-backup-2026-06-12.json',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix app -- app/src/features/backup/backupExport.test.ts`

Expected: FAIL because `backupExport` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `backupTypes.ts` with `BackupDocument`, `BackupRecordCounts`, and `BackupData` types.

Create `backupExport.ts` with:

```ts
export function buildBackupDocument(input: BuildBackupDocumentInput): BackupDocument {
  return {
    schemaVersion: 1,
    exportedAt: input.exportedAt,
    userId: input.userId,
    includesImages: false,
    recordCounts: {
      beans: input.beans.length,
      brewLogs: input.brewLogs.length,
    },
    data: {
      beans: input.beans,
      brewLogs: input.brewLogs,
    },
  }
}

export function createBackupFileName(date: Date) {
  return `coffee-backup-${date.toISOString().slice(0, 10)}.json`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix app -- app/src/features/backup/backupExport.test.ts`

Expected: PASS.

---

### Task 2: Backup Service and UI

**Files:**
- Create: `app/src/features/backup/backupService.ts`
- Create: `app/src/features/backup/BackupPanel.tsx`
- Create: `app/src/features/backup/backup.css`
- Modify: `app/src/features/auth/AuthPanel.tsx`

- [ ] **Step 1: Implement Supabase read service**

Create `backupService.ts` with `fetchBackupRows()` that reads active `beans` and active `brew_logs`, ordered newest first, and `recordBackupExport()` that inserts into `backup_exports` with `export_type: 'json'`, `includes_images: false`, `file_name`, and record counts.

- [ ] **Step 2: Implement browser download panel**

Create `BackupPanel.tsx` with one primary button. On click, fetch rows, build the backup document, create a JSON Blob, download it as `coffee-backup-YYYY-MM-DD.json`, then record metadata in Supabase.

- [ ] **Step 3: Add scoped backup styles**

Create `backup.css` with compact card, status, error, and button states using the existing dark UI and green action color.

- [ ] **Step 4: Wire into authenticated view**

Modify `AuthPanel.tsx` to render `<BackupPanel session={session} supabase={supabase} />` below `<BeanDashboard />`.

---

### Task 3: Verification and Publish

**Files:**
- Verify: `app/src/features/backup/*`
- Verify: `app/src/features/auth/AuthPanel.tsx`

- [ ] **Step 1: Run all tests**

Run: `npm test --prefix app`

Expected: all test files pass.

- [ ] **Step 2: Run production build**

Run: `npm run build --prefix app`

Expected: TypeScript and Vite build pass.

- [ ] **Step 3: Check no secrets were committed**

Run: `rg -n "service_role|sk-|deepseek|VITE_SUPABASE_ANON_KEY=." -S .`

Expected: no real secret values in source files.

- [ ] **Step 4: Commit and push**

Run:

```bash
git add docs/superpowers/plans/2026-06-12-backup-export-plan.md app/src/features/backup app/src/features/auth/AuthPanel.tsx
git commit -m "Add JSON backup export"
git push
```

- [ ] **Step 5: Verify GitHub Pages deployment**

Open `https://frankkiss.github.io/coffee-pwa/`, confirm the latest asset URLs return HTTP 200, and tell the user how to test backup export after login.
