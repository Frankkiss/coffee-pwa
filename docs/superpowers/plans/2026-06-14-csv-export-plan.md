# CSV Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CSV export buttons for coffee beans and brew logs so user data can be inspected in spreadsheet tools.

**Architecture:** Keep JSON backup/restore unchanged. Add pure CSV serialization helpers under the backup feature, then wire those helpers into `BackupPanel` using the existing `fetchBackupRows` data path.

**Tech Stack:** React, TypeScript, Supabase JS, Vitest, Vite.

---

## File Structure

- Create `app/src/features/backup/csvExport.ts` for CSV serialization and file naming.
- Create `app/src/features/backup/csvExport.test.ts` for escaping, headers, arrays, and filenames.
- Modify `app/src/features/backup/BackupPanel.tsx` to add two CSV export buttons.
- Modify `app/src/features/backup/backup.css` to keep the CSV controls tidy on mobile.
- Add this plan in `docs/superpowers/plans/2026-06-14-csv-export-plan.md`.

## Task 1: CSV Serialization Helpers

**Files:**
- Create: `app/src/features/backup/csvExport.ts`
- Create: `app/src/features/backup/csvExport.test.ts`

- [ ] **Step 1: Write failing tests**

Tests must prove:

```ts
expect(buildBeansCsv([bean])).toContain('名称,烘焙商,产地')
expect(buildBeansCsv([bean])).toContain('"蜜处理,特殊"')
expect(buildBrewLogsCsv([log])).toContain('咖啡豆ID,冲煮时间,方式')
expect(buildBrewLogsCsv([log])).toContain('citrus、honey')
expect(createCsvFileName('beans', new Date('2026-06-14T01:00:00.000Z'))).toBe('coffee-beans-2026-06-14.csv')
```

- [ ] **Step 2: Run focused test**

Run: `npm test --prefix app -- src/features/backup/csvExport.test.ts`

Expected before implementation: fail because `csvExport.ts` does not exist.

- [ ] **Step 3: Implement helpers**

Implement:

```ts
export function buildBeansCsv(beans: Bean[]): string
export function buildBrewLogsCsv(brewLogs: BrewLog[]): string
export function createCsvFileName(kind: 'beans' | 'brew-logs', date: Date): string
```

Use UTF-8 text, comma separators, Chinese headers, `、` for array fields, and quote CSV cells that contain comma, quote, newline, or carriage return.

- [ ] **Step 4: Re-run focused test**

Run: `npm test --prefix app -- src/features/backup/csvExport.test.ts`

Expected after implementation: pass.

## Task 2: Backup Panel UI Wiring

**Files:**
- Modify: `app/src/features/backup/BackupPanel.tsx`
- Modify: `app/src/features/backup/backup.css`

- [ ] **Step 1: Add CSV export state**

Add `isExportingBeansCsv` and `isExportingBrewLogsCsv` to keep buttons disabled while files are being generated.

- [ ] **Step 2: Add a shared download helper**

Inside `BackupPanel`, add a small helper that receives text, filename, and MIME type, then creates a Blob and triggers a browser download.

- [ ] **Step 3: Wire buttons**

Add two buttons:

```tsx
导出咖啡豆 CSV
导出冲煮记录 CSV
```

Both use `fetchBackupRows(supabase)` and export only the relevant list.

- [ ] **Step 4: Keep JSON behavior unchanged**

Confirm the existing JSON export/import buttons and preview flow still use the same functions as before.

## Task 3: Verification And Delivery

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
git add docs/superpowers/plans/2026-06-14-csv-export-plan.md app/src/features/backup
git commit -m "Add CSV export for backup data"
git push origin foundation
```

## Out Of Scope

Source import remains required for the product roadmap, but it is not part of this CSV export change. It should be implemented as a separate plan because it needs source fetching, AI parsing, preview, duplicate handling, and explicit confirmation before writing data.
