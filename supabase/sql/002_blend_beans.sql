alter table public.beans
add column if not exists bean_type text not null default 'single_origin';

alter table public.beans
add column if not exists blend_components jsonb not null default '[]'::jsonb;

alter table public.beans
add column if not exists blend_notes text;

alter table public.beans
drop constraint if exists beans_bean_type_check;

alter table public.beans
add constraint beans_bean_type_check
check (bean_type in ('single_origin', 'blend'));
