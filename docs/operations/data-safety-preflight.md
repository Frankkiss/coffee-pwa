# Data Safety Preflight

1. Run `004_data_safety_preflight.sql` against the linked Supabase project before any migration.
2. Save the unedited output with the execution date outside the public repository if it contains user data.
3. Record table counts, RLS state, policy count, orphan count, and invalid-range count in the rollout checklist.
4. Stop if any expected table is missing, RLS is disabled, a cross-user relation exists, or invalid values would violate the new constraints.
5. Do not edit or delete anomalous rows until a row-specific repair is reviewed.

Run the script in a SQL client using the same project connection intended for the migration. It opens a read-only transaction and ends with a rollback; do not remove those statements. Review the complete, unedited result before approving any production change.
