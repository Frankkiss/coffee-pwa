# Brew Log Detail v1 Design

## Goal

Add a mobile-first detail view for saved brew logs so each cup can be reviewed as a reusable recipe, not only as a short card summary.

## Scope

This version stays inside the existing `BrewLogPanel`. It does not add a route, table, or Supabase migration. The detail view uses the current `brew_logs` fields and reuses existing edit, soft delete, and update logic.

## User Flow

1. The brew log list shows a `详情` action on every record.
2. Tapping `详情` opens a detail panel above the list content.
3. The detail panel shows the bean name, brew method, key parameters, flavor tags, score, notes, and current candidate recipe status.
4. The detail panel supports `返回记录`, `编辑`, `删除`, and `设为/取消候选方案`.
5. Editing returns to the existing form with the selected brew log loaded.
6. Deleting keeps the existing soft-delete confirmation and returns to the list after success.

## Detail Content

The detail view should prioritize review and repeatability:

- Bean and method: bean name, method, dripper, filter paper.
- Recipe parameters: grinder, grind setting, coffee grams, water grams, ratio, water temperature, total time.
- Sensory result: rating and available sensory scores.
- Flavor and notes: flavor tags and notes.
- Timeline metadata: brewed date and updated date.

Pour steps are displayed only when the saved `pour_steps` field contains readable objects with values such as time, water, or note. Current manual brew form does not create detailed pour steps, so the empty state says `暂未记录分段注水`.

## Data And Safety

No data is written when opening or closing detail. Pinning uses `updateBrewLog` with the existing full update payload pattern, changing only `is_pinned_recipe` from the current log. Delete remains a soft delete through `softDeleteBrewLog`.

## Testing

Add a focused model test for a new `buildBrewLogDetailView` helper. It should verify:

- Parameters are formatted with Chinese labels and units.
- Empty optional values are omitted or shown as readable empty states.
- Pour steps are normalized when available.
- Candidate recipe action text changes based on `is_pinned_recipe`.
