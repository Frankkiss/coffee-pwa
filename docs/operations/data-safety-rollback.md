# Data Safety Production Rollback

This runbook favors containment and data preservation. It does not authorize production access or changes. Except for observing public status, each production action requires the matching explicit approval recorded in `data-safety-rollout.md`; a full data rollback always requires its own new confirmation.

## First response for every incident

1. Stop the rollout. Do not enable additional devices or retry an unknown migration/function command.
2. Record the UTC time, deployed frontend commit/mode, Edge Function commit, last successful stage, observed error code, affected entity types, pending-count summary, and current sync epoch in the private incident record.
3. Do not record tokens, API keys, complete prompts, user row contents, or private backup paths in Git, chat, screenshots, or public logs.
4. Preserve every device's IndexedDB and Outbox. Do not clear site data, uninstall the PWA, sign out a device with pending changes, or ask users to recreate records.
5. Before any destructive data recovery, download and verify a fresh incident snapshot and a fresh pre-restore v2 backup.

Never use `git reset --hard`, truncate a user table, physically delete business rows, delete IndexedDB, replay an old schema, or mark a committed migration reverted as an incident shortcut.

## Trigger matrix

| Trigger | Immediate action | Database action |
| --- | --- | --- |
| Migration command fails and did not commit | Stop and retain complete CLI output | Rely on transaction rollback; inspect before any retry |
| Migration committed but validation/preflight fails | Deploy protection mode | Preserve additive schema; prepare a reviewed forward repair |
| Client/legacy migration fails | Deploy protection mode | None; preserve old IndexedDB and Outbox |
| Count loss, cross-user result, duplicate write, checksum mismatch, corrupt mutation, or unexpected epoch | Deploy protection mode and capture incident backup | No schema rollback; evaluate reviewed backup restore only after preview |
| Edge Function regression | Redeploy only the pre-reviewed current-safety rollback artifact; otherwise use protection plus a forward fix | Do not change database data |
| Rate limit too strict but data is intact | Roll back only the affected Edge Function or prepare reviewed rate-policy fix | Do not delete rate-limit history as a first response |
| Frontend-only regression | Deploy the reviewed protection build | No database or Edge rollback unless independently indicated |

## Protection deployment

Protection mode permits cached/cloud reads and exports but blocks migration, SyncManager, Outbox upload, repository writes, attention-item mutation, safe merge, and full rollback. It is containment, not a claim that data is synchronized.

The current Pages workflow hard-codes `pilot`; a GitHub variable cannot override it. Before the production rollout, prepare and quality-gate a reviewed emergency commit whose `.github/workflows/deploy-pages.yml` contains:

```yaml
vite_sync_rollout_mode: protection
```

When containment is approved:

1. Deploy that exact reviewed protection commit through `Deploy GitHub Pages`.
2. Require the reusable `Data Safety Checks` workflow to pass; do not upload a local `dist`.
3. Verify the Pages deployment commit and service-worker refresh on desktop and phone.
4. Confirm existing data and JSON/ZIP/CSV export remain available.
5. Confirm a write attempt returns the stable protection behavior and does not change IndexedDB, Outbox, or cloud data.
6. Leave `kaday:sync-pilot-enabled` untouched for evidence. Protection builds ignore it.

If Pages cannot deploy, stop device use rather than directing users to clear caches. Keep the application closed/offline until the reviewed protection build is available.

## Database migration failure

### Failure before commit

Do not rerun automatically. Capture the complete `db push` output, then run only read-only checks after identifying whether the migration version appears:

```powershell
npx --yes supabase migration list --linked
```

Run `supabase/sql/004_data_safety_preflight.sql` in the production SQL Editor unchanged. If the migration is absent and the schema is unchanged, the migration transaction rolled back. Diagnose and rehearse a fix locally before requesting new production approval.

### Failure discovered after commit

1. Deploy protection mode.
2. Download and verify the incident v2 backup and retain current database backup evidence privately.
3. Rerun migration inventory, preflight, constraint state, table counts, and RLS checks read-only.
4. Keep additive tables, columns, indexes, RPCs, receipts, and constraints in place.
5. Implement a new additive forward-repair migration, run the complete local release gate, obtain independent review, and request new production approval.

Do not drop additive objects merely to reproduce the old schema. Old clients remain temporarily compatible by design; containment happens at the frontend feature flag.

## Edge Function rollback

Before production rollout, designate a rollback Edge artifact only after independent review proves it still enforces all current safety requirements: JWT verification, `requireUser` authentication, database-backed per-user rate limiting, bounded request/prompt/upstream bodies, stable URL-field HTTP 400 with zero page fetch, and redacted logs. Record that exact commit in the private release evidence. A function version that predates any of these controls is not a rollback candidate.

If that pre-reviewed rollback artifact exists, create an isolated worktree; do not switch or reset the active release worktree:

```powershell
git worktree add D:\coffee\.worktrees\edge-rollback <pre-reviewed-safe-edge-commit>
Set-Location D:\coffee\.worktrees\edge-rollback
npx --yes supabase functions deploy import-source --project-ref tmjpgcjcrcaxxxhqbyng
npx --yes supabase functions deploy recommend-brew --project-ref tmjpgcjcrcaxxxhqbyng
```

Deploy only the affected function when the other function/shared guard is known unaffected. Do not use `--no-verify-jwt`; both functions require JWT verification. After deployment, verify authenticated success, unauthenticated denial, expected rate limiting, bounded payload behavior, and redacted logs. For `import-source`, also verify a request containing `url` returns 400 without page fetch.

If no independently reviewed prior artifact meets every current safety requirement, do not redeploy an older function. Keep the frontend in protection mode and ship a reviewed forward fix instead.

Do not change database data during an Edge-only rollback. Retain the rollback worktree until incident review finishes.

## Corrupt or unexpected server mutation

1. Deploy protection mode and keep all device Outboxes intact.
2. Run the read-only preflight and compare private before/after counts.
3. Download a current incident v2 snapshot even if it contains the bad state; it is evidence.
4. Locate the last verified v2 backup. Protection mode intentionally blocks preview and restore writes, so do not claim it can perform the remaining steps.
5. If a full rollback might be required, prepare one exact reviewed recovery build from the release candidate with write-capable `pilot` behavior. Do not enable it yet. Record its commit and successful quality-gate run privately.
6. Review whether a narrow forward repair is safer. Prefer it when the affected rows can be identified without ambiguity.
7. Do not enable the controlled recovery session or execute restore until the user explicitly approves full rollback for the selected backup checksum and the controlled preview procedure.

## Approved full data rollback

Full rollback restores user-visible logical data; it is not a schema rollback. It uses soft deletion, runs in one server transaction, increments `sync_epoch`, and invalidates older-device Outbox generations so they cannot silently overwrite the restored state.

Because protection mode blocks restore preview and execution, keep every normal desktop and phone in protection mode or closed. After the user gives separate approval to open a recovery session, use exactly one controlled recovery desktop with the pre-reviewed `pilot` release-candidate build; set `kaday:sync-pilot-enabled` to the exact string `true` only on that device and origin. Do not use a general `enabled` build for recovery.

Initial approval may identify the selected verified v2 checksum and authorize the single controlled session to obtain a current impact preview. The final full-rollback approval must be specific to that checksum and the latest preview. Then, only in that controlled session:

1. Re-select and revalidate the complete v2 JSON backup. A v1 backup is never eligible.
2. Refresh the server `full_rollback` preview; stop on any invalid relation, warning that blocks eligibility, or unexpected count.
3. Generate and successfully download the mandatory pre-restore lightweight backup from current production state.
4. Validate that pre-restore file and record both application checksum and file SHA-256 privately.
5. Show the latest add/update/revive/soft-delete impact, obtain the final checksum-and-preview-specific approval, and enter the literal confirmation `FULL RESTORE` in the application.
6. Let the client generate one stable `restoreRequestId`; do not invent or change it during retries.
7. Submit `restore_backup_v2` once. If the response is lost, retry only with the same request ID, mode, and backup checksum.
8. Require the client to pull a fresh authoritative snapshot and adopt the returned new `sync_epoch` before reporting completion.
9. Download and validate a new post-restore v2 backup, compare post-restore counts and relations, and rerun preflight while the controlled session is still available.
10. Immediately close the controlled recovery session and return that device to the reviewed protection build. Remove its pilot key only after retaining any needed incident evidence.
11. Keep every other device in protection mode. Their older-epoch Outboxes must remain isolated; never automatically replay them.

Any error in the restore transaction must roll back the whole restore. Do not attempt per-table completion. If a response is uncertain, inspect the stable restore receipt/result before issuing another request; never silently generate a new request ID.

## Device recovery after containment

For each desktop and phone separately:

1. Record its pending/attention counts and protection status without exposing payloads.
2. Keep pre-incident Outbox entries isolated after any epoch-changing restore.
3. Pull the authoritative cloud snapshot only through the reviewed sync flow.
4. Present old local intentions for explicit discard or deliberate reapplication as a new-epoch edit; never auto-upload them.
5. Verify zero unexplained count differences and a fresh backup before re-enabling writes.

Re-enablement is a new rollout decision. It requires the same local gates, review, pilot on one desktop/phone pair, explicit approval, and monitoring as `data-safety-rollout.md`.

## Rollback approval gates

All boxes intentionally remain unchecked in Git.

- [ ] User approved emergency protection frontend deployment.
- [ ] User approved deployment of the pre-reviewed current-safety Edge rollback artifact, if required.
- [ ] User approved a reviewed forward-repair migration, if required.
- [ ] User approved one controlled `pilot` recovery session for the selected v2 checksum and current preview.
- [ ] User approved full data rollback for the recorded checksum and impact preview, if required.
- [ ] User approved a new pilot re-enable after incident verification.

Record approver and timestamp privately when they contain personal information.
