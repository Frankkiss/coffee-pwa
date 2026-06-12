# Backup Import Design

## Scope

Add JSON backup import to the existing backup panel. The feature restores the user's own exported coffee data from a `coffee-backup-YYYY-MM-DD.json` file.

## Import Mode

The first import mode is **skip duplicates**. A row is considered duplicate when its backup `id` already exists in the current user's Supabase table. Duplicate beans are skipped, duplicate brew logs are skipped, and no existing cloud data is deleted or overwritten.

## Flow

1. User chooses a JSON backup file.
2. The app parses the file and validates `schemaVersion: 1`, `data.beans`, and `data.brewLogs`.
3. The app checks existing cloud bean and brew log IDs for the current user.
4. The app shows a preview with total, duplicate, and importable counts.
5. The user clicks a separate confirm button.
6. The app imports only non-duplicate rows, rewriting `user_id` to the current logged-in user.

## Safety

Import never deletes or updates existing data. It inserts beans before brew logs so brew log references can resolve. If a brew log points to a missing bean, the app imports that brew log with `bean_id: null` rather than failing the whole import.

## UI

The existing backup panel keeps the export button. Below it, add a file input, preview text, and a disabled-by-default confirm button that is enabled only after a valid preview exists and at least one row is importable.

## Tests

Add tests for backup parsing, duplicate preview counts, user ID rewriting, and missing-bean brew log handling.
