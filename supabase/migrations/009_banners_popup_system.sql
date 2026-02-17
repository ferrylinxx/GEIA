-- Banner + popup system enhancements (safe for existing deployments)

alter table if exists public.banners
  add column if not exists display_mode text,
  add column if not exists priority integer,
  add column if not exists dismissible boolean,
  add column if not exists show_once boolean,
  add column if not exists cta_label text,
  add column if not exists cta_url text,
  add column if not exists image_url text,
  add column if not exists accent_color text;

update public.banners
set
  display_mode = coalesce(display_mode, 'banner'),
  priority = coalesce(priority, 0),
  dismissible = coalesce(dismissible, true),
  show_once = coalesce(show_once, true)
where true;

alter table if exists public.banners
  alter column display_mode set default 'banner',
  alter column priority set default 0,
  alter column dismissible set default true,
  alter column show_once set default true;

create index if not exists idx_banners_active_priority
  on public.banners (is_active, priority desc, created_at desc);

create index if not exists idx_banners_date_window
  on public.banners (start_date, end_date);

