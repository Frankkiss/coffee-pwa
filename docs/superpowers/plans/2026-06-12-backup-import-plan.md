# Backup Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add JSON backup import with duplicate skipping, preview, and explicit confirmation.

**Architecture:** Pure import helpers parse backup JSON, compute preview counts, and build safe insert payloads. The Supabase service fetches existing IDs and inserts beans before brew logs. The existing `BackupPanel` gains file selection, preview, and confirm import UI.

**Tech Stack:** React, TypeScript, Vitest, Supabase JS.

---

### Task 1: Backup Import Helpers

**Files:**
- Create: `app/src/features/backup/backupImport.ts`
- Test: `app/src/features/backup/backupImport.test.ts`
- Modify: `app/src/features/backup/backupTypes.ts`

- [ ] **Step 1: Write failing tests**

Test `parseBackupDocument`, `createBackupImportPreview`, and `buildBackupImportPayloads`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix app -- src/features/backup/backupImport.test.ts`

Expected: FAIL because `backupImport` does not exist.

- [ ] **Step 3: Implement minimal helper logic**

Implement:
- `parseBackupDocument(jsonText)`
- `createBackupImportPreview(backup, existingIds)`
- `buildBackupImportPayloads(backup, preview, userId)`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix app -- src/features/backup/backupImport.test.ts`

Expected: PASS.

---

### Task 2: Supabase Import Service

**Files:**
- Modify: `app/src/features/backup/backupService.ts`

- [ ] **Step 1: Add duplicate lookup**

Add `fetchExistingBackupIds()` to read current user's existing bean and brew log IDs.

- [ ] **Step 2: Add insert service**

Add `importBackupRows()` to insert importable beans first, then importable brew logs.

---

### Task 3: Import UI

**Files:**
- Modify: `app/src/features/backup/BackupPanel.tsx`
- Modify: `app/src/features/backup/backup.css`

- [ ] **Step 1: Add file select and preview state**

Read selected file text, parse it, fetch existing IDs, compute preview, and show counts.

- [ ] **Step 2: Add confirm import button**

Only enable the button after a valid preview exists and importable rows are present.

- [ ] **Step 3: Add import result message**

Show imported and skipped counts. Keep export behavior unchanged.

---

### Task 4: Verification and Publish

- [ ] **Step 1: Run tests**

Run: `npm test --prefix app`

- [ ] **Step 2: Run build**

Run: `npm run build --prefix app`

- [ ] **Step 3: Scan for secrets**

Run: `rg -n "service_role|sk-|deepseek|VITE_SUPABASE_ANON_KEY=." -S .`

- [ ] **Step 4: Commit and push**

Run:

```bash
git add docs/superpowers/specs/2026-06-12-backup-import-design.md docs/superpowers/plans/2026-06-12-backup-import-plan.md app/src/features/backup
git commit -m "Add JSON backup import"
git push
```

- [ ] **Step 5: Verify deployment**

Check the GitHub Pages HTML and latest JS/CSS assets return HTTP 200.
