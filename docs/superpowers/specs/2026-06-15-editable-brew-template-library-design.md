# Editable Brew Template Library Design

Date: 2026-06-15

## Goal

Make the brew template library useful as a long-term personal tool:

- Built-in templates remain available as stable references.
- The user can add, edit, and delete personal templates.
- Built-in templates can be copied into a personal editable version.
- AI recommendations use both built-in templates and personal templates as candidate recipes.
- Personal templates are included in JSON backup and restore.

## Data Model

New Supabase table: `public.brew_templates`.

Personal templates are stored per user. Built-in templates remain in frontend code, because they are product defaults and should not create per-user rows unless copied.

Important fields:

- `user_id`: owner, protected by RLS.
- Core recipe fields: name, category, difficulty, brewer, filter, dose, water, ratio, temperature range, grind, target time.
- `pour_steps`: JSON array of structured pouring steps.
- `suitable_for`, `avoid_for`, `adjustment_rules`, `source_urls`: text arrays.
- `copied_from_template_id`: original built-in template ID when copied.
- `deleted_at`: soft delete marker.

## UX

In the brew template panel:

- Header has an `新增模板` button.
- Built-in templates show `系统模板`; personal templates show `我的模板`.
- Built-in templates can be `复制为我的模板`.
- Personal templates can be edited or deleted.
- Delete uses explicit confirmation and performs soft delete.
- The edit form is compact and mobile-first.
- Pouring steps use repeatable step rows instead of a raw JSON textarea.

## AI Recommendation Behavior

Rule recommendation loads:

1. Beans.
2. Brew logs.
3. Personal brew templates.

Candidate template selection receives `built-in templates + personal templates`. DeepSeek still receives selected template candidates only; it should adjust from templates instead of inventing from nothing.

## Backup Safety

JSON backup must include personal templates:

- Export includes active personal templates.
- Import previews duplicates by template ID.
- Import rewrites `user_id` to the current user.
- Import does not overwrite existing templates.

CSV export remains focused on beans and brew logs in this version.
