create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.app_settings enable row level security;

grant select, insert, update, delete on public.app_settings to authenticated;

drop policy if exists "Authenticated users read app settings" on public.app_settings;
create policy "Authenticated users read app settings"
  on public.app_settings for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "Admin manages app settings" on public.app_settings;
create policy "Admin manages app settings"
  on public.app_settings for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());