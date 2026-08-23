# Manual Bean Form Simplification Design

## Goal

Reduce the effort of manually adding a retail blend bean. A blend is entered as one purchased bag, without asking the user to reconstruct its internal recipe.

## Scope

This change affects only the manual add/edit form in `BeanDashboard`.

- When bean type is `blend`, do not render `拼配组成` or `拼配说明`.
- Keep the normal bag-level fields: name, roaster, origin, farm or station, process, variety, altitude, remaining weight, roast date, roast level, flavor tags, and notes.
- Keep blend-aware labels such as `产地（可多个）`, `处理法（可多个）`, and `品种（可多个）`.
- Do not change source-import confirmation in this iteration.

## Compatibility

`blend_components` and `blend_notes` remain in the form type, local repository payload, sync protocol, database, backup/restore formats, and recommendation context.

Editing an existing blend must load these values into form state even though the manual form does not display them. Saving unrelated edits must preserve the loaded values. No migration, column removal, bulk rewrite, or clearing of historical values is allowed in this iteration.

Removing the persisted fields is a separate future change. It may begin only after recommendation rules, AI prompts, source import, detail views, exports, backup/restore, legacy migration, and sync no longer require them. That removal requires a reviewed migration and explicit user confirmation.

## UI Direction

Keep the current cream-and-coffee visual system. The improvement is subtraction: selecting `拼配豆` must not expand the form with a second nested editor. The form should retain one continuous two-column desktop grid and collapse to the existing single-column mobile layout.

No new decorative cards, steps, animation, or advanced section are introduced. `备注` remains the single free-form place for bag descriptions and personal impressions.

## Behavior And Tests

- The manual form does not contain the text `拼配组成` or `拼配说明` after selecting `拼配豆`.
- Existing blend values survive an edit-and-save round trip.
- SOE form behavior is unchanged.
- Source import, sync, backup, restore, migration, and recommendation tests remain green.
- Verify the manual add form at a phone-sized viewport before release.
