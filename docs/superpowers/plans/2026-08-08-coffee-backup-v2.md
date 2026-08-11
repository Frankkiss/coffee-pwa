# Coffee Backup and Restore v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace additive v1-only imports with a complete, checksummed logical backup that supports safe merge by default and explicit transaction-wide rollback without allowing stale devices to replay pre-restore changes.

**Architecture:** Supabase RPCs create a consistent user-scoped JSON snapshot, preview restore effects, serialize restore and normal sync with the same advisory lock, and increment `sync_epoch` only for full rollback. The browser validates version and checksum, downloads a pre-restore backup before destructive confirmation, and retains v1 parsing only for safe merge. Optional image archives extend the logical JSON but are not required for rollback.

**Tech Stack:** React 19, TypeScript 6, Vitest 4, Supabase Postgres/RPC/RLS, Web Crypto SHA-256, fflate ZIP, existing JSON/CSV download utilities.

---

## File map

**Supabase**

- Create `supabase/migrations/20260808030000_backup_v2_rpc.sql`: consistent export, preview, safe merge, full rollback, and server export metadata.
- Create `supabase/tests/007_backup_v2.test.sql`: backup scope, ownership rewrite, merge, rollback, epoch, and transaction tests.

**Client**

- Replace `backupTypes.ts` with discriminated v1/v2 contracts.
- Create `backupChecksum.ts` and test.
- Create `backupV1Migration.ts` and test.
- Create `backupPreviewModel.ts` and test.
- Create `backupRestoreApi.ts` and test.
- Create `imageBackup.ts` and test.
- Refactor `backupService.ts`, `backupExport.ts`, `backupImport.ts`, `BackupPanel.tsx`, `backupReminder.ts`, and tests.
- Modify `HomeOverview.tsx` to read server export metadata.

### Task 1: Define v2 contracts and deterministic checksum verification

**Files:**
- Modify: `app/src/features/backup/backupTypes.ts`
- Create: `app/src/features/backup/backupChecksum.ts`
- Create: `app/src/features/backup/backupChecksum.test.ts`
- Modify: `app/src/features/recommendations/savedRecommendationList.ts`
- Modify: `app/src/features/sourceImports/sourceImportTypes.ts`

- [ ] **Step 1: Write a failing deterministic checksum test**

```ts
import { describe, expect, it } from 'vitest'
import { canonicalJson, sha256Hex } from './backupChecksum'

describe('backup checksum', () => {
  it('sorts object keys without changing array order', async () => {
    const left = { beans: [{ id: 'b', tags: ['x', 'y'] }], settings: { z: 1, a: 2 } }
    const right = { settings: { a: 2, z: 1 }, beans: [{ tags: ['x', 'y'], id: 'b' }] }
    expect(canonicalJson(left)).toBe(canonicalJson(right))
    expect(await sha256Hex(left)).toBe(await sha256Hex(right))
  })
})
```

- [ ] **Step 2: Verify failure**

```powershell
npm test -- backupChecksum.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Define complete v2 types**

`backupTypes.ts` must retain `BackupV1Document` and add:

```ts
export type BackupV2Data = {
  profile: BackupProfile | null
  userSettings: UserSettingsRow | null
  beans: Bean[]
  brewLogs: BrewLog[]
  brewTemplates: UserBrewTemplateRow[]
  aiRecommendations: SavedRecommendationRow[]
  sourceImports: SourceImportRow[]
}

export type BackupProfile = {
  id: string
  display_name: string | null
  created_at: string
  updated_at: string
  schema_version: number
}

export type BackupImageManifestEntry = {
  entityType: 'bean'
  entityId: string
  originalUrl: string
  archivePath: string | null
  mediaType: string | null
  byteLength: number
  checksum: string | null
  status: 'included' | 'missing'
  errorCode: string | null
}

export type BackupV2Manifest = {
  exportedAt: string
  appVersion: string
  backupMode: 'lightweight' | 'complete'
  recordCounts: Record<keyof BackupV2Data, number>
  checksumAlgorithm: 'SHA-256'
  checksum: string
  images: BackupImageManifestEntry[]
  warnings: string[]
}

export type BackupV2Document = {
  schemaVersion: 2
  manifest: BackupV2Manifest
  data: BackupV2Data
}

export type MigratedV1SafeMergeDocument = BackupV2Document & {
  manifest: BackupV2Manifest & {
    sourceSchemaVersion: 1
    fullRollbackEligible: false
    authoritativeSections: ['beans', 'brewLogs', 'brewTemplates']
  }
}

export type ParsedBackupDocument =
  | { sourceVersion: 1; document: MigratedV1SafeMergeDocument; fullRollbackEligible: false }
  | { sourceVersion: 2; document: BackupV2Document; fullRollbackEligible: true }
```

Define full row types for saved recommendations and source imports, including `user_id`, timestamps, `deleted_at`, and `schema_version`.

- [ ] **Step 4: Implement canonical JSON and SHA-256**

`backupChecksum.ts` must recursively sort object keys using JavaScript UTF-16 order, preserve array order, and hash UTF-8 bytes through `crypto.subtle.digest('SHA-256', bytes)`. Its number branch must enforce the same cross-runtime subset as `canonical_jsonb_text`: reject non-finite values, unsafe integers, nonzero magnitudes below `1e-6`, magnitudes at or above `1e21`, and decimals with more than 15 significant digits. Shared browser/SQL fixtures must cover accepted boundaries and every rejected class.

```ts
export async function verifyBackupChecksum(document: BackupV2Document) {
  const actual = await sha256Hex(document.data)
  return actual === document.manifest.checksum
}
```

- [ ] **Step 5: Run focused tests and commit**

```powershell
npm test -- backupChecksum.test.ts
git add app/src/features/backup app/src/features/recommendations/savedRecommendationList.ts app/src/features/sourceImports/sourceImportTypes.ts
git commit -m "feat: define checksummed backup v2 format"
```

### Task 2: Add consistent export and cloud reminder metadata

**Files:**
- Create: `supabase/migrations/20260808030000_backup_v2_rpc.sql`
- Create: `supabase/tests/007_backup_v2.test.sql`

- [ ] **Step 1: Write failing export tests**

Create SQL tests that authenticate as one user, insert one row in every included table plus another user's rows, and assert `export_backup_v2()`:

```sql
select has_function('public', 'export_backup_v2', array['text', 'text']);
select is((public.export_backup_v2('0.0.0-test', 'lightweight')->>'schemaVersion')::integer, 2, 'exports v2');
select is(jsonb_array_length(public.export_backup_v2('0.0.0-test', 'lightweight')#>'{data,beans}'), 1, 'exports only current user beans');
select ok(length(public.export_backup_v2('0.0.0-test', 'lightweight')#>>'{manifest,checksum}') = 64, 'contains SHA-256');
```

- [ ] **Step 2: Verify the export test fails**

```powershell
supabase test db supabase/tests/007_backup_v2.test.sql
```

Expected: FAIL because the RPC is absent.

- [ ] **Step 3: Implement the shared canonical JSON SQL function**

Add an immutable `public.canonical_jsonb_text(jsonb)` helper that recursively sorts object keys, preserves array order, emits JSON string and
scalar representations, and inserts no insignificant whitespace. Add shared fixtures containing Chinese text, escaped characters, decimals,
nulls, arrays, and reordered object keys. Assert PostgreSQL output exactly equals the browser `canonicalJson` output for every fixture.

PostgreSQL `jsonb` preserves decimal spellings that JavaScript may normalize or emit in exponent form. The shared protocol therefore accepts
only finite JSON numbers whose canonical decimal text is stable in both runtimes (no exponent-form boundary, unsafe integer, trailing fractional
zero, or precision-collapsing decimal). `canonical_jsonb_text` must reject an incompatible numeric value instead of emitting a checksum the
browser cannot verify. Cover accepted decimals and rejected numeric edge cases explicitly.

Revoke function execution from `anon`; it contains no user data access but remains an internal backup helper.

- [ ] **Step 4: Implement `export_backup_v2`**

The function must use `auth.uid()`, acquire the same per-user advisory transaction lock as synchronization, aggregate every array with deterministic ordering, and exclude deleted rows. Build `v_data`, compute the digest from `canonical_jsonb_text(v_data)`, and return:

```sql
jsonb_build_object(
  'schemaVersion', 2,
  'manifest', jsonb_build_object(
    'exportedAt', clock_timestamp(),
    'appVersion', p_app_version,
    'backupMode', p_backup_mode,
    'recordCounts', jsonb_build_object(
      'profile', case when v_data->'profile' = 'null'::jsonb then 0 else 1 end,
      'userSettings', case when v_data->'userSettings' = 'null'::jsonb then 0 else 1 end,
      'beans', jsonb_array_length(v_data->'beans'),
      'brewLogs', jsonb_array_length(v_data->'brewLogs'),
      'brewTemplates', jsonb_array_length(v_data->'brewTemplates'),
      'aiRecommendations', jsonb_array_length(v_data->'aiRecommendations'),
      'sourceImports', jsonb_array_length(v_data->'sourceImports')
    ),
    'checksumAlgorithm', 'SHA-256',
    'checksum', encode(digest(convert_to(public.canonical_jsonb_text(v_data), 'UTF8'), 'sha256'), 'hex'),
    'images', '[]'::jsonb,
    'warnings', '[]'::jsonb
  ),
  'data', v_data
)
```

Enable `pgcrypto` if needed. Grant execute only to authenticated users.

- [ ] **Step 5: Add a separate success-recording RPC**

Add `record_backup_download(p_file_name text, p_backup_mode text, p_record_counts jsonb)`. It inserts `backup_exports` only after the browser confirms the download was initiated, ignores client `user_id`, and returns the server timestamp. Require the exact filename pattern for the selected mode, accept only `lightweight` or `complete`, and require exactly the seven non-negative integer v2 record-count keys with `profile` and `userSettings` limited to zero or one. Reject unknown or missing count keys.

- [ ] **Step 6: Run SQL tests and commit**

```powershell
supabase db reset
supabase test db supabase/tests/007_backup_v2.test.sql
git add supabase/migrations/20260808030000_backup_v2_rpc.sql supabase/tests/007_backup_v2.test.sql
git commit -m "feat: add complete backup export RPC"
```

### Task 3: Parse v1 and v2 without granting v1 rollback eligibility

**Files:**
- Create: `app/src/features/backup/backupV1Migration.ts`
- Create: `app/src/features/backup/backupV1Migration.test.ts`
- Modify: `app/src/features/backup/backupImport.ts`
- Modify: `app/src/features/backup/backupImport.test.ts`

- [ ] **Step 1: Replace the obsolete missing-bean expectation**

The current v1 test expects an orphaned brew link to become `null`. Replace it with an assertion that the row is reported invalid and excluded from import:

```ts
expect(result.invalidRelations).toEqual([{ entityType: 'brewLog', entityId: 'brew-1', field: 'bean_id', value: 'missing-bean' }])
expect(result.importable.brewLogs).toBe(0)
```

- [ ] **Step 2: Add failing version-discrimination tests**

Assert a valid v1 file returns `sourceVersion: 1` and `fullRollbackEligible: false`; a valid v2 file with matching checksum returns version 2 and eligibility true; a checksum mismatch throws `备份校验失败，文件可能已损坏或被修改`.

- [ ] **Step 3: Implement v1 normalization**

`normalizeV1ForSafeMerge` converts the three v1 arrays into `MigratedV1SafeMergeDocument`: a schema-2 transport envelope whose manifest
contains `sourceSchemaVersion: 1` and `fullRollbackEligible: false`. Missing logical sections use empty transport values but are excluded from
`authoritativeSections`, which is exactly `['beans', 'brewLogs', 'brewTemplates']`. The server must reject this envelope for full rollback
regardless of any client-supplied confirmation.

- [ ] **Step 4: Implement async parsing**

Change `parseBackupDocument` to async so it can verify SHA-256. Reject unknown root keys that conflict with the selected schema version, invalid counts, invalid UUID relations, and duplicate IDs inside the file.

- [ ] **Step 5: Run tests and commit**

```powershell
npm test -- backupV1Migration.test.ts backupImport.test.ts backupChecksum.test.ts
git add app/src/features/backup
git commit -m "feat: validate v1 and v2 backup imports"
```

### Task 4: Add server-side restore preview

**Files:**
- Modify: `supabase/migrations/20260808030000_backup_v2_rpc.sql`
- Modify: `supabase/tests/007_backup_v2.test.sql`
- Create: `app/src/features/backup/backupPreviewModel.ts`
- Create: `app/src/features/backup/backupPreviewModel.test.ts`
- Create: `app/src/features/backup/backupRestoreApi.ts`
- Create: `app/src/features/backup/backupRestoreApi.test.ts`

- [ ] **Step 1: Write failing preview SQL tests**

For a fixture containing one new bean, one existing active bean, one existing deleted bean, and one orphan brew, assert preview counts distinguish `new`, `existing`, `softDeleted`, and `invalidRelations`. Assert no table count changes after preview.

- [ ] **Step 2: Implement `preview_restore_v2`**

The RPC must accept `p_backup jsonb` and `p_mode text`, validate schema version and checksum using the same server canonical form, rewrite ownership conceptually to `auth.uid()`, and return:

```json
{
  "mode": "safe_merge",
  "fullRollbackEligible": true,
  "counts": {
    "beans": { "total": 1, "new": 1, "existing": 0, "softDeleted": 0, "willUpdate": 0, "willDelete": 0 },
    "brewLogs": { "total": 0, "new": 0, "existing": 0, "softDeleted": 0, "willUpdate": 0, "willDelete": 0 }
  },
  "invalidRelations": [],
  "warnings": []
}
```

For full rollback, compute updates and active current rows absent from backup that will be soft-deleted. The function must not modify rows.
If the manifest has `sourceSchemaVersion: 1`, accept only `safe_merge`, inspect only the three listed `authoritativeSections`, and return
`fullRollbackEligible: false`. Reject any v1-derived envelope that declares other authoritative sections.

- [ ] **Step 3: Implement client API and view model**

`backupRestoreApi.ts` wraps `preview_restore_v2`, `restore_backup_v2`, `export_backup_v2`, and `record_backup_download`. `backupPreviewModel.ts` converts server counts to Chinese display rows without changing semantics.

- [ ] **Step 4: Run SQL and client tests**

```powershell
supabase test db supabase/tests/007_backup_v2.test.sql
Set-Location app
npm test -- backupPreviewModel.test.ts backupRestoreApi.test.ts
```

Expected: preview is read-only and client tests pass.

- [ ] **Step 5: Commit preview support**

```powershell
git add supabase/migrations/20260808030000_backup_v2_rpc.sql supabase/tests/007_backup_v2.test.sql app/src/features/backup
git commit -m "feat: preview backup restore impact"
```

### Task 5: Implement transaction-wide safe merge

**Files:**
- Modify: `supabase/migrations/20260808030000_backup_v2_rpc.sql`
- Modify: `supabase/tests/007_backup_v2.test.sql`
- Modify: `app/src/features/backup/backupRestoreApi.ts`

- [ ] **Step 1: Write failing safe-merge tests**

Assert safe merge:

- inserts missing IDs in dependency order;
- rewrites every `user_id` to the caller;
- does not update an active duplicate;
- does not revive a soft-deleted duplicate;
- does not delete current rows;
- rejects an orphan relation;
- rolls back all inserts if any selected row fails.

- [ ] **Step 2: Implement safe merge inside `restore_backup_v2`**

The public signature is:

```sql
public.restore_backup_v2(p_backup jsonb, p_mode text, p_confirmation text default null)
returns jsonb
```

For `safe_merge`, acquire the per-user advisory lock, revalidate checksum and relations, insert only IDs that do not exist including soft-deleted IDs, and return inserted/skipped counts. Do not change `sync_epoch`.

- [ ] **Step 3: Run SQL tests**

```powershell
supabase test db supabase/tests/007_backup_v2.test.sql
```

Expected: all safe-merge and rollback assertions pass.

- [ ] **Step 4: Commit safe merge**

```powershell
git add supabase/migrations/20260808030000_backup_v2_rpc.sql supabase/tests/007_backup_v2.test.sql app/src/features/backup/backupRestoreApi.ts
git commit -m "feat: add transactional safe backup merge"
```

### Task 6: Implement explicit full rollback and stale-device invalidation

**Files:**
- Modify: `supabase/migrations/20260808030000_backup_v2_rpc.sql`
- Modify: `supabase/tests/007_backup_v2.test.sql`
- Modify: `app/src/features/sync/syncManager.ts`
- Modify: `app/src/features/sync/syncManager.test.ts`

- [ ] **Step 1: Write failing full-rollback tests**

Assert `full_rollback` rejects v1, missing confirmation, checksum mismatch, and incomplete logical sections. For a valid v2 fixture assert it updates backup IDs, revives backup rows currently soft-deleted, soft-deletes active current rows absent from backup, restores settings, increments epoch exactly once, and rolls back all effects on an injected constraint failure.

- [ ] **Step 2: Implement confirmation and restore transaction**

Require exact confirmation text `FULL RESTORE`. Under the shared advisory lock:

1. re-read and lock `user_sync_state`;
2. validate every section and relation;
3. upsert profile-visible fields, settings, beans, templates, brews, recommendations, and imports;
4. set `deleted_at = clock_timestamp()` for current deletable rows absent from backup;
5. set `deleted_at = null` for active rows present in backup;
6. increment `sync_epoch` once;
7. return the new epoch and effect counts.

- [ ] **Step 3: Verify manager quarantine behavior**

Extend `syncManager.test.ts`: when `apply_sync_batch` returns `STALE_SYNC_EPOCH`, every old-epoch Outbox row becomes `needs_attention`, the manager pulls the new snapshot, and none of those rows is automatically resubmitted.

- [ ] **Step 4: Run database and manager tests**

```powershell
supabase test db supabase/tests/007_backup_v2.test.sql
Set-Location app
npm test -- syncManager.test.ts
```

Expected: full rollback and stale-device quarantine tests pass.

- [ ] **Step 5: Commit full rollback**

```powershell
git add supabase/migrations/20260808030000_backup_v2_rpc.sql supabase/tests/007_backup_v2.test.sql app/src/features/sync/syncManager.ts app/src/features/sync/syncManager.test.ts
git commit -m "feat: add guarded full backup rollback"
```

### Task 7: Refactor the backup UI around preview and confirmation

**Files:**
- Modify: `app/src/features/backup/BackupPanel.tsx`
- Modify: `app/src/features/backup/backup.css`
- Modify: `app/src/features/backup/backupExport.ts`
- Modify: `app/src/features/backup/backupService.ts`
- Modify: `app/src/features/backup/backupImport.ts`
- Modify: `app/src/features/home/HomeOverview.tsx`
- Create: `app/src/features/backup/backupFlowModel.ts`
- Create: `app/src/features/backup/backupFlowModel.test.ts`

- [ ] **Step 1: Extract a pure UI state machine and test it**

Add `backupFlowModel.ts` and test transitions `idle -> parsing -> preview -> restoring -> success`, plus error reset. Full rollback confirm remains disabled until the typed value equals `FULL RESTORE` and the pre-restore download flag is true.

- [ ] **Step 2: Replace client multi-table export reads**

`handleExport` calls `export_backup_v2`, verifies checksum in the browser, downloads JSON, then calls `record_backup_download`. Do not record export metadata if checksum validation or download initiation fails.

- [ ] **Step 3: Implement safe-merge UI as the default**

After file selection show version, checksum state, every entity count, duplicate/deleted/invalid relation counts, and the primary button `安全合并缺失数据`. Do not preselect full rollback.

- [ ] **Step 4: Implement the guarded full-rollback flow**

When the user opens `全量回滚`:

1. request a fresh full-rollback preview;
2. export and download a file named `coffee-pre-restore-YYYY-MM-DD.json`;
3. enable confirmation input only after download initiation succeeds;
4. require `FULL RESTORE`;
5. call restore;
6. force `SyncManager` to pull a new snapshot;
7. show the new epoch and effect counts.

- [ ] **Step 5: Remove the old additive import service**

Delete `fetchExistingBackupIds`, `buildBackupImportPayloads`, and `importBackupRows`. Keep v1 parsing and CSV exports.

- [ ] **Step 6: Run tests and build**

```powershell
npm test -- backupFlowModel.test.ts backupImport.test.ts backupExport.test.ts backupReminder.test.ts
npm test
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit UI migration**

```powershell
git add app/src/features/backup app/src/features/home/HomeOverview.tsx
git commit -m "feat: add backup v2 restore workflow"
```

### Task 8: Add optional image ZIP without weakening logical backup

**Files:**
- Modify: `app/package.json`
- Modify: `app/package-lock.json`
- Create: `app/src/features/backup/imageBackup.ts`
- Create: `app/src/features/backup/imageBackup.test.ts`
- Modify: `app/src/features/backup/BackupPanel.tsx`
- Modify: `app/src/features/backup/backupTypes.ts`

- [ ] **Step 1: Install a small ZIP library**

Run from `app`:

```powershell
npm install fflate
```

Expected: dependency and lockfile update; npm exits 0.

- [ ] **Step 2: Write failing image manifest tests**

Test one successful image, one CORS/network failure, one file over the byte limit, deterministic file names, per-image SHA-256, and ZIP containing `backup.json` even when every image fails.

- [ ] **Step 3: Implement bounded image collection**

`createCompleteBackup(document, fetchImpl)` must:

- fetch only `https:` and same-origin `http:` URLs;
- allow at most 100 images and 5 MB per response;
- accept `image/jpeg`, `image/png`, and `image/webp`;
- decode successful images, resize the longest edge to at most 1600 pixels, and encode WebP at quality 0.82 when canvas encoding is available;
- retain the validated original compressed bytes only when WebP encoding is unavailable or would increase byte size;
- use an AbortController with a 10-second timeout per image;
- record missing or rejected images in manifest warnings;
- produce a ZIP containing `backup.json` and successful files under `images/`;
- set `backupMode: 'complete'` and recompute the logical manifest without changing `data`.

- [ ] **Step 4: Add explicit complete-backup control**

Keep lightweight JSON as the primary export. Add a separate `包含可访问图片的完整 ZIP` action with an explanation that inaccessible remote images will be reported rather than silently included.

- [ ] **Step 5: Run tests and commit**

```powershell
npm test -- imageBackup.test.ts backupChecksum.test.ts
npm run lint
npm run build
git add app/package.json app/package-lock.json app/src/features/backup
git commit -m "feat: add optional complete image backup"
```

### Task 9: Finish cloud-backed reminders and verify Plan 2

**Files:**
- Modify: `app/src/features/backup/backupReminder.ts`
- Modify: `app/src/features/backup/backupReminder.test.ts`
- Modify: `app/src/features/home/HomeOverview.tsx`
- Modify: `docs/operations/data-safety-preflight.md`

- [ ] **Step 1: Test server metadata precedence**

Assert the latest `backup_exports.created_at` wins across devices and old `localStorage` metadata is used only when no cloud row exists during the one-release compatibility window.

- [ ] **Step 2: Load reminder metadata from Supabase**

Add `get_latest_backup_export()` or a restricted select through existing RLS. Use `userSettings.backup_reminder_days`, defaulting to 7. Stop writing `kaday:last-json-backup`; retain one read-only fallback and mark it for removal after a stable release.

- [ ] **Step 3: Run all local quality gates**

```powershell
supabase db reset
supabase test db supabase/tests/005_sync_foundation.test.sql
supabase test db supabase/tests/007_backup_v2.test.sql
Set-Location app
npm test
npm run lint
npm run build
```

Expected: every command exits 0.

- [ ] **Step 4: Record evidence and stop before production**

Append Plan 2 verification results to `docs/operations/data-safety-preflight.md`. Do not apply
`20260808030000_backup_v2_rpc.sql` to production in this task; include it in the later production approval package.

- [ ] **Step 5: Commit verification evidence**

```powershell
git add app/src/features/backup app/src/features/home/HomeOverview.tsx docs/operations/data-safety-preflight.md
git commit -m "docs: verify backup v2 locally"
```
