# Editable Brew Template Library Plan

Date: 2026-06-15

## Checklist

1. Add failing tests for template row mapping, recommendation candidate input, and backup coverage.
2. Add Supabase SQL migration for `brew_templates` with RLS.
3. Add frontend template form/model/service helpers.
4. Update brew template panel with add/edit/delete/copy actions.
5. Update recommendation service to load personal templates.
6. Update JSON backup/export/import to include personal templates.
7. Run focused tests, then build/lint as far as current repo allows.

## Manual Step After Merge

Run `supabase/sql/003_brew_templates.sql` in Supabase SQL Editor before using personal template sync in the deployed app.
