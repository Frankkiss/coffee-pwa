# Backup Restore Point v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically download a current-data restore point before importing a JSON backup.

**Architecture:** Reuse the existing backup document builder for restore points, add a restore-point filename helper, and update the import confirmation flow to export current cloud rows before inserting imported rows.

**Tech Stack:** React, TypeScript, Vitest, Supabase.

---

### Task 1: Restore Point Filename

**Files:**
- Modify: `app/src/features/backup/backupExport.ts`
- Modify: `app/src/features/backup/backupExport.test.ts`

- [ ] **Step 1: Write failing test**

Add a test for `createRestorePointFileName(new Date('2026-06-15T03:00:00.000Z'))`.

- [ ] **Step 2: Verify RED**

Run: `npm run test --prefix app -- src/features/backup/backupExport.test.ts`

Expected: FAIL because `createRestorePointFileName` is not exported yet.

- [ ] **Step 3: Implement helper**

Return `coffee-restore-point-YYYY-MM-DD.json`.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test --prefix app -- src/features/backup/backupExport.test.ts`

Expected: PASS.

### Task 2: Import Flow Restore Point

**Files:**
- Modify: `app/src/features/backup/BackupPanel.tsx`

- [ ] **Step 1: Read current cloud rows before import**

Inside `handleConfirmImport`, call `fetchBackupRows(supabase)` before building import payloads.

- [ ] **Step 2: Download restore point**

Build a backup document from current rows and download it with `createRestorePointFileName`.

- [ ] **Step 3: Import only after restore point is created**

Keep the existing duplicate-skipping import behavior unchanged.

- [ ] **Step 4: Update status copy**

Mention the restore point filename in the success message.

### Task 3: Verification And Publish

**Files:**
- All changed files.

- [ ] **Step 1: Run checks**

Run:

```powershell
npm run test --prefix app
npm run build --prefix app
npm run lint --prefix app
```

- [ ] **Step 2: Commit and push**

Run:

```powershell
git add docs/superpowers/specs/2026-06-15-backup-restore-point-design.md docs/superpowers/plans/2026-06-15-backup-restore-point-plan.md app/src/features/backup
git commit -m "Add import restore point"
git push origin foundation
```
