# Data Safety Production Rollout

This runbook is an operator checklist for the data-safety release. It does not authorize a production change. Task 7 only writes the procedure; every production action below remains blocked until the user gives explicit approval in Task 9.

The public repository must contain no access token, database password, user row, private backup path, or personal approver record. Keep the filled evidence record outside Git.

## Fixed release scope

- Supabase project ref: `tmjpgcjcrcaxxxhqbyng`.
- Additive migrations, in exact order:
  1. `20260808010000_sync_foundation.sql`
  2. `20260808020000_sync_rpc.sql`
  3. `20260808030000_backup_v2_rpc.sql`
  4. `20260808040000_edge_rate_limit.sql`
- Edge Functions: `import-source` and `recommend-brew`; both have `verify_jwt = true` in `supabase/config.toml`.
- Source import accepts user-supplied text and approved image/OCR input only. It does not fetch a submitted URL; a request containing `url` must return HTTP 400 without an external page request.
- Frontend: GitHub Pages. `VITE_SYNC_ROLLOUT_MODE` accepts only `pilot`, `enabled`, or `protection` and fails closed to `protection`.

The first three older migrations are baseline-history entries, not SQL to replay:

1. `20260612000000_initial_schema.sql`
2. `20260615000000_blend_beans.sql`
3. `20260615010000_brew_templates.sql`

Only mark a baseline version applied when the linked migration list says it is absent **and** the read-only production audit proves that its tables, columns, RLS policies, and constraints already exist. A mismatch is a stop condition, not permission to repair history by guesswork.

## Private evidence record

Before starting, create a private record with these fields:

| Field | Required evidence |
| --- | --- |
| Operator start time | UTC timestamp |
| User approval | scope, approver, UTC timestamp |
| Production frontend commit | full Git SHA currently served |
| Release-candidate commit | full reviewed Git SHA |
| Supabase project ref | exact ref displayed by CLI/dashboard |
| Migration state before/after | unedited `migration list` output |
| Preflight before/after | private output location and pass/fail summary |
| Production logical backup | current-production export filename/version and SHA-256; later v2 checksum result |
| Database backup | dashboard backup identifier or private dump filenames and SHA-256 |
| Migration hashes | SHA-256 for all four additive SQL files |
| Edge Function source commit | full Git SHA |
| Edge rollback artifact | independently reviewed current-safety commit, or `none` |
| Pilot devices | one desktop and one phone; no device identifiers in Git |
| Smoke tests | timestamp and pass/fail for each item |
| Row counts | before/pilot/after by table; no row contents |
| Rollback owner | private name/contact and availability window |
| Protection build | reviewed commit and successful Pages workflow run |

## Approval gates

All boxes intentionally remain unchecked in the committed runbook. Record personal details in the private evidence record.

- [ ] User explicitly approved production database migration and constraint validation.
- [ ] User explicitly approved Supabase Cron creation.
- [ ] User explicitly approved deployment of both Edge Functions.
- [ ] User explicitly approved the `pilot` frontend deployment.
- [ ] User explicitly approved the later `enabled` frontend deployment.
- [ ] User explicitly approved a full data rollback, if one becomes necessary.

Approval for one box does not imply approval for another. Stop at the next unchecked box.

## Phase 0: local release gate

Task 8 must finish the local release gate before any project link or production command. Follow the commands in the security rollout plan and record only non-private summaries here. Do not continue when any unit, SQL, Edge, build, E2E, secret-scan, or real-browser gate fails.

Confirm these release artifacts before production approval:

1. The release-candidate Git commit is clean and immutable.
2. SHA-256 hashes for the four migration files are in the private record.
3. A reviewed Pages commit exists with `vite_sync_rollout_mode: pilot`.
4. A separate reviewed emergency commit exists with `vite_sync_rollout_mode: protection` in `.github/workflows/deploy-pages.yml`, and its quality gate has passed. The current workflow hard-codes `pilot`; changing a GitHub variable alone cannot create a protection build.
5. The later global-enable change is a reviewed one-line workflow change from `pilot` to `enabled`, not an ad-hoc production edit.
6. Any Edge rollback commit is independently reviewed in advance to retain JWT authentication, database rate limiting, bounded inputs/upstream responses, URL-field rejection with zero page fetch, and redacted logs. If none qualifies, record `none` and use protection plus a forward fix.

## Phase 1: identify production without changing it

Do not run these commands until Task 9 has explicit user approval for linking and read-only production inspection.

From the reviewed release-candidate worktree:

```powershell
npx --yes supabase login
npx --yes supabase link --project-ref tmjpgcjcrcaxxxhqbyng
npx --yes supabase projects list
npx --yes supabase migration list --linked
git rev-parse HEAD
```

Verify that the linked ref is exactly `tmjpgcjcrcaxxxhqbyng`, the Git SHA equals the approved release candidate, and the migration history matches the private expected-state record. Stop on any ambiguity.

Run `supabase/sql/004_data_safety_preflight.sql` in the Supabase SQL Editor for that exact project. The script begins a read-only transaction and ends with `rollback`; do not remove either statement. Save the complete result privately. Stop if:

- an expected table is absent or RLS is disabled;
- any orphaned or cross-user relation appears;
- any range/status anomaly appears;
- the schema or policy inventory differs from the reviewed baseline;
- the table counts cannot be explained.

## Phase 2: download and verify backups

Do not modify migration history or schema before the current-production export and both database-level backups are verified.

1. Sign in to the current production app as the owner and use whatever user-data export that deployed version already provides. It may be a legacy/v1 file because the v2 RPC does not exist until `20260808030000_backup_v2_rpc.sql` is applied. Record its format/version, filename, counts available from that version, file SHA-256, and private storage location. A legacy/v1 export is migration evidence only and is never eligible for `full_rollback`.
2. In Supabase Dashboard, open the production project's database backups and confirm a current restorable backup. Record its identifier and timestamp privately. This database-level evidence is the migration rollback anchor.
3. Create a private logical database dump as a second database-level backup. Run these only from a trusted local directory that is not inside the repository:

```powershell
npx --yes supabase db dump --linked --file production-schema.sql
npx --yes supabase db dump --linked --data-only --use-copy --file production-data.sql
Get-FileHash -Algorithm SHA256 production-schema.sql
Get-FileHash -Algorithm SHA256 production-data.sql
```

Move the dump files to approved private storage immediately. Never add them to Git. Stop if either dump exits non-zero, is unexpectedly empty, or cannot be checksummed. Do not treat the legacy/v1 user export as a substitute for the Dashboard backup and database dump.

After the four migrations and authenticated database smoke tests pass, but before deploying Edge Functions or the pilot frontend, use a controlled authenticated release-candidate client/API session to call `export_backup_v2`. Download the resulting lightweight v2 JSON, re-select it in the release-candidate restore screen, and require successful strict structure and SHA-256 validation without executing restore. Record its filename, manifest counts, application checksum, file SHA-256, and private storage location. Stop the rollout if this post-migration v2 backup cannot be generated and verified.

## Phase 3: reconcile migration history

This is a production metadata write and requires the checked database approval box.

First rerun:

```powershell
npx --yes supabase migration list --linked
```

Only if the three baseline versions are absent from history while the audited schema is already present, run in ascending order:

```powershell
npx --yes supabase migration repair 20260612000000 --status applied --linked
npx --yes supabase migration repair 20260615000000 --status applied --linked
npx --yes supabase migration repair 20260615010000 --status applied --linked
npx --yes supabase migration list --linked
```

Stop if any baseline is unexpectedly present/absent, a command fails, or the resulting list does not show exactly the three baseline versions as applied and exactly the four reviewed additive versions as pending.

## Phase 4: apply only the four additive migrations

Review the exact pending set without writing:

```powershell
npx --yes supabase db push --linked --dry-run
```

The dry run must name only the four additive migrations, in the order listed under “Fixed release scope.” If it includes any other migration, stop and review the branch/history. Then, with the database approval still current:

```powershell
npx --yes supabase db push --linked
npx --yes supabase migration list --linked
```

Do not replay an SQL file manually after a CLI error. Preserve the complete output, determine whether the migration committed, and stop. A failed migration that did not commit relies on the migration transaction rollback. A problem discovered after commit uses protection mode and a reviewed forward repair; do not mark the migration reverted or remove additive schema objects.

Rerun `004_data_safety_preflight.sql`. Only when every anomaly query returns zero rows, validate the seven `NOT VALID` constraints in the production SQL Editor under the existing database approval:

```sql
begin;
alter table public.brew_logs validate constraint brew_logs_rating_range_check;
alter table public.brew_logs validate constraint brew_logs_sensory_range_check;
alter table public.brew_logs validate constraint brew_logs_measurements_check;
alter table public.beans validate constraint beans_measurements_check;
alter table public.brew_templates validate constraint brew_templates_measurements_check;
alter table public.source_imports validate constraint source_imports_status_check;
alter table public.user_settings validate constraint user_settings_backup_reminder_days_check;
commit;
```

After validation, privately record this query result; every row must have `convalidated = true`:

```sql
select conrelid::regclass as relation_name, conname, convalidated
from pg_constraint
where conname in (
  'brew_logs_rating_range_check',
  'brew_logs_sensory_range_check',
  'brew_logs_measurements_check',
  'beans_measurements_check',
  'brew_templates_measurements_check',
  'source_imports_status_check',
  'user_settings_backup_reminder_days_check'
)
order by conname;
```

## Phase 5: schedule receipt cleanup

This is a production scheduler write and requires the checked Cron approval box. In the production SQL Editor, first verify `pg_cron` is enabled:

```sql
select extname from pg_extension where extname = 'pg_cron';
```

If no row is returned, stop and enable the Supabase Cron integration through the Dashboard under the approved change window, then rerun the check. Ensure the job name is not already present:

```sql
select jobid, jobname, schedule, command
from cron.job
where jobname = 'purge-expired-sync-mutation-receipts';
```

Only when no existing row is returned, schedule the reviewed function:

```sql
select cron.schedule(
  'purge-expired-sync-mutation-receipts',
  '17 3 * * *',
  $$select public.purge_expired_sync_mutation_receipts();$$
);
```

Rerun the `cron.job` query and record the job ID, schedule, and exact command privately. Do not grant client roles permission to execute the purge function.

## Phase 6: authenticated database smoke tests

Use only a dedicated test account owned by the operator. Do not paste its token into Git, docs, shell history, screenshots, or chat. Exercise the app/API and retain redacted results privately:

1. Unauthenticated RPC calls are denied.
2. The test account cannot read or mutate another user's rows (RLS).
3. `get_sync_snapshot()` contains only the current user.
4. Repeating the same `mutationId` returns the same outcome and does not duplicate a mutation.
5. `export_backup_v2` produces a v2 snapshot whose counts/checksum validate in the client.
6. `preview_restore_v2` is read-only and returns the expected safe preview.
7. `get_latest_backup_export()` returns only the current user's safe metadata.
8. `consume_edge_rate_limit` permits the configured initial calls and returns a bounded denial after the limit.

Compare all business-table counts with the preflight baseline. Any unexplained reduction, cross-user result, duplicate mutation, checksum failure, or unexpected epoch change is an immediate stop condition.

## Phase 7: deploy and smoke-test Edge Functions

This requires the checked Edge Function approval box. Confirm `DEEPSEEK_API_KEY` exists in Supabase Edge Function Secrets without displaying its value. From the exact approved Edge Function commit:

```powershell
npx --yes supabase functions deploy import-source --project-ref tmjpgcjcrcaxxxhqbyng
npx --yes supabase functions deploy recommend-brew --project-ref tmjpgcjcrcaxxxhqbyng
```

Because `supabase/config.toml` sets `verify_jwt = true` for both functions, do not add `--no-verify-jwt`.

With the dedicated authenticated test account, verify:

- one allowed text-only `import-source` request;
- one allowed `recommend-brew` request;
- one unauthenticated denial for each function;
- one expected authenticated rate-limit denial;
- one `import-source` request containing a `url` field returns 400 and does not fetch the URL;
- responses and Supabase Function logs contain no token, API key, complete prompt, or upstream response body.

## Phase 8: deploy the pilot frontend

This requires the checked pilot frontend approval box. The deployment workflow also requires repository variable `DATA_SAFETY_DEPLOY_APPROVED` to equal `true`; changing it is itself part of the approved frontend deployment. Public frontend variables are limited to `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Never put a service-role or DeepSeek key in GitHub Pages variables.

Deploy the reviewed commit whose `.github/workflows/deploy-pages.yml` passes `vite_sync_rollout_mode: pilot`. Verify the successful `Data Safety Checks` and `Deploy GitHub Pages` run, deployed commit, Pages URL, and service-worker refresh before touching either pilot device.

On exactly one desktop and one phone:

1. Open the deployed `pilot` build and sign in to the same test/owner account.
2. In that origin's browser storage, set `kaday:sync-pilot-enabled` to the exact string `true`, then fully reload. Do not set the flag on any other device.
3. Confirm the other devices remain in protection behavior.
4. Record pre-pilot counts for beans, brew logs, templates, recommendations, source imports, and settings.
5. On desktop, create one bean and an associated brew while offline, reconnect, and wait for both to sync.
6. On phone, verify both records and their relationship; edit one harmless field, then verify the final saved value on desktop.
7. Verify pending count returns to zero, no attention item remains, no duplicate appears, and the sync epoch is unchanged unless a reviewed restore occurred.
8. Download and validate a fresh v2 backup.
9. Compare post-pilot counts with the expected deltas and rerun the read-only preflight.

Any unexplained missing/duplicate row, association loss, corrupt local data warning, unexpected epoch, restore/checksum failure, cross-user result, or non-recovering mutation error requires immediate protection deployment and the rollback runbook.

## Phase 9: enable all devices

This is a separate frontend change and requires the checked `enabled` approval box after the pilot evidence is reviewed. Change only the reviewed workflow input in `.github/workflows/deploy-pages.yml` from:

```yaml
vite_sync_rollout_mode: pilot
```

to:

```yaml
vite_sync_rollout_mode: enabled
```

Commit and deploy through the same quality-gated Pages workflow. Do not bypass CI or deploy a locally built `dist`. Verify the deployed commit and service-worker version, then repeat the desktop/phone count, offline-create, final-value, pending-zero, backup-download, and preflight checks. An `enabled` build ignores the pilot localStorage key.

## Monitoring and stop conditions

During pilot and for at least one stable release after global enablement, privately record:

- business-table row counts and preflight anomaly counts;
- sync mutation successes, expected duplicate receipts, failures, and attention items;
- current `sync_epoch` and any intentional restore that changed it;
- backup export/checksum success and last-export metadata;
- Edge Function allowed calls, expected 400/401/429 responses, unexpected 5xx responses, and latency/timeouts;
- rate-limit denials by action without recording user content;
- client migration/protection errors on desktop and phone.

Stop expansion and deploy protection mode immediately on any data-loss signal, cross-user/RLS failure, backup checksum mismatch, unexpected restore/epoch change, repeated/duplicate write, unexplained count decrease, failed client migration, persistent Outbox corruption, or unexpected Edge 5xx affecting the pilot. An expected 400, 401, or tested 429 is not itself a stop condition.

Do not remove legacy IndexedDB stores, old queue compatibility, pilot handling, or backup fallback during this release. Cleanup is a separate Task 10 decision after one stable release and fresh verification.

## Public completion record

After an authorized Task 9 rollout, update only non-private fields in this document: release commit, migration filenames, UTC stage timestamps, pass/fail summaries, deployed mode, and whether rollback was required. Do not commit user counts when they could identify the user, row contents, tokens, private backup locations, project credentials, or approver identity.
