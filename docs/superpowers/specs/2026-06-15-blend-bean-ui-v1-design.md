# Blend Bean UI v1 Design

> Superseded for the manual add/edit form by `2026-08-23-manual-bean-form-simplification-design.md`. The structured fields remain persisted for compatibility, but the manual form no longer exposes the editor.

## Goal

Make blend bean entry easier and more accurate by replacing the single large composition text box with structured blend component cards, while still keeping a free-form blend note.

## Scope

This version changes frontend form state and UI only. It does not add Supabase columns or change Row Level Security. Existing `blend_components` and `blend_notes` remain the persisted structure.

## User Flow

When `豆子类型` is `拼配豆`, the bean form shows a `拼配组成` section.

Each component card contains:

- 产地
- 处理法
- 品种
- 占比, optional
- 作用
- 备注

The user can add or remove component cards. Percentage is optional because many retail blend beans do not publish exact ratios.

Below the cards, the form keeps a separate `拼配说明` text area for overall roaster notes, such as "坚果、奶油、柑橘调，适合冰手冲".

## Data Rules

- `blend_components` is saved from the structured cards.
- Empty component cards are removed before saving.
- Missing percentage is saved as `null`, not `0`.
- `blend_notes` is saved from the free-form blend note.
- When editing an old record that only has `blend_notes`, the form tries to parse it into component cards and keeps the original note text.

## AI Recommendation Impact

AI and rule recommendations should continue to prefer structured `blend_components`. If components are missing or incomplete, recommendation code can still read overall origin/process/variety and `blend_notes`.

## UI Direction

Use compact mobile cards:

```text
拼配组成
[组成 1]
产地 / 处理法
品种 / 占比
作用
备注

+ 添加一支组成豆

拼配说明
自由说明文本
```

The section should stay quiet and utilitarian, matching the current cream and coffee color system.
