-- Company isolation migration for the existing TallyFlow schema.
-- Run AFTER supabase/schema.sql. This migration deliberately does not assign
-- legacy rows to a company: the owner must map them to the correct business.
begin;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 100),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.company_memberships (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'owner', 'employee')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

alter table public.materials add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.ledgers add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.parties add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.vouchers add column if not exists company_id uuid references public.companies(id) on delete cascade;

-- Replace global uniqueness with company-scoped uniqueness. Existing null-company
-- rows remain preserved but cannot be read through RLS until explicitly assigned.
alter table public.materials drop constraint if exists materials_sku_key;
alter table public.ledgers drop constraint if exists ledgers_name_key;
alter table public.parties drop constraint if exists parties_uid_key;
alter table public.vouchers drop constraint if exists vouchers_voucher_no_key;

create unique index if not exists materials_company_sku_key
  on public.materials(company_id, sku) where company_id is not null;
create unique index if not exists ledgers_company_name_key
  on public.ledgers(company_id, name) where company_id is not null;
create unique index if not exists parties_company_name_type_key
  on public.parties(company_id, name, type) where company_id is not null;
create unique index if not exists parties_company_uid_key
  on public.parties(company_id, uid) where company_id is not null and uid is not null;
create unique index if not exists vouchers_company_number_key
  on public.vouchers(company_id, voucher_no) where company_id is not null;

create index if not exists idx_company_memberships_user on public.company_memberships(user_id);
create index if not exists idx_materials_company on public.materials(company_id);
create index if not exists idx_ledgers_company on public.ledgers(company_id);
create index if not exists idx_parties_company on public.parties(company_id);
create index if not exists idx_vouchers_company_date on public.vouchers(company_id, date desc);

alter table public.companies enable row level security;
alter table public.company_memberships enable row level security;

create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1 from public.company_memberships
    where company_id = target_company_id and user_id = auth.uid()
  );
$function$;

create or replace function public.is_company_admin(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1 from public.company_memberships
    where company_id = target_company_id
      and user_id = auth.uid()
      and role = 'admin'
  );
$function$;

revoke all on function public.is_company_member(uuid) from public;
revoke all on function public.is_company_admin(uuid) from public;
grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.is_company_admin(uuid) to authenticated;

create or replace function public.create_company_for_current_user(p_company_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  created_company_id uuid;
  cleaned_name text := trim(coalesce(p_company_name, ''));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if char_length(cleaned_name) < 2 or char_length(cleaned_name) > 100 then
    raise exception 'Company name must be between 2 and 100 characters';
  end if;

  insert into public.companies(name, created_by)
  values (cleaned_name, auth.uid())
  returning id into created_company_id;

  insert into public.company_memberships(company_id, user_id, role)
  values (created_company_id, auth.uid(), 'admin');

  return created_company_id;
end;
$function$;

revoke all on function public.create_company_for_current_user(text) from public;
grant execute on function public.create_company_for_current_user(text) to authenticated;

drop policy if exists "Profiles are readable by authenticated users" on public.profiles;
drop policy if exists "Admin manages all profiles" on public.profiles;
create policy "Users can read their own profile" on public.profiles
  for select using (id = auth.uid());

drop policy if exists "Authenticated users can read materials" on public.materials;
drop policy if exists "Authenticated users can read ledgers" on public.ledgers;
drop policy if exists "Authenticated users can read parties" on public.parties;
drop policy if exists "Authenticated users can read vouchers" on public.vouchers;
drop policy if exists "Admin can insert materials" on public.materials;
drop policy if exists "Admin can update materials" on public.materials;
drop policy if exists "Admin can delete materials" on public.materials;
drop policy if exists "Admin can insert ledgers" on public.ledgers;
drop policy if exists "Admin can update ledgers" on public.ledgers;
drop policy if exists "Admin can insert parties" on public.parties;
drop policy if exists "Admin can update parties" on public.parties;
drop policy if exists "Admin can delete parties" on public.parties;
drop policy if exists "Admin can insert vouchers" on public.vouchers;
drop policy if exists "Admin can update vouchers" on public.vouchers;
drop policy if exists "Admin can delete vouchers" on public.vouchers;

drop policy if exists "Members can read companies" on public.companies;
create policy "Members can read companies" on public.companies
  for select using (public.is_company_member(id));
drop policy if exists "Admins can update companies" on public.companies;
create policy "Admins can update companies" on public.companies
  for update using (public.is_company_admin(id))
  with check (public.is_company_admin(id));

drop policy if exists "Members can read company memberships" on public.company_memberships;
create policy "Members can read company memberships" on public.company_memberships
  for select using (user_id = auth.uid() or public.is_company_admin(company_id));
drop policy if exists "Admins can add company memberships" on public.company_memberships;
create policy "Admins can add company memberships" on public.company_memberships
  for insert with check (public.is_company_admin(company_id));
drop policy if exists "Admins can update company memberships" on public.company_memberships;
create policy "Admins can update company memberships" on public.company_memberships
  for update using (public.is_company_admin(company_id))
  with check (public.is_company_admin(company_id));
drop policy if exists "Admins can remove company memberships" on public.company_memberships;
create policy "Admins can remove company memberships" on public.company_memberships
  for delete using (public.is_company_admin(company_id));

drop policy if exists "Company members can read materials" on public.materials;
create policy "Company members can read materials" on public.materials
  for select using (company_id is not null and public.is_company_member(company_id));
drop policy if exists "Company admins can insert materials" on public.materials;
create policy "Company admins can insert materials" on public.materials
  for insert with check (company_id is not null and public.is_company_admin(company_id));
drop policy if exists "Company admins can update materials" on public.materials;
create policy "Company admins can update materials" on public.materials
  for update using (company_id is not null and public.is_company_admin(company_id))
  with check (company_id is not null and public.is_company_admin(company_id));
drop policy if exists "Company admins can delete materials" on public.materials;
create policy "Company admins can delete materials" on public.materials
  for delete using (company_id is not null and public.is_company_admin(company_id));

drop policy if exists "Company members can read ledgers" on public.ledgers;
create policy "Company members can read ledgers" on public.ledgers
  for select using (company_id is not null and public.is_company_member(company_id));
drop policy if exists "Company admins can insert ledgers" on public.ledgers;
create policy "Company admins can insert ledgers" on public.ledgers
  for insert with check (company_id is not null and public.is_company_admin(company_id));
drop policy if exists "Company admins can update ledgers" on public.ledgers;
create policy "Company admins can update ledgers" on public.ledgers
  for update using (company_id is not null and public.is_company_admin(company_id))
  with check (company_id is not null and public.is_company_admin(company_id));
drop policy if exists "Company admins can delete ledgers" on public.ledgers;
create policy "Company admins can delete ledgers" on public.ledgers
  for delete using (company_id is not null and public.is_company_admin(company_id));

drop policy if exists "Company members can read parties" on public.parties;
create policy "Company members can read parties" on public.parties
  for select using (company_id is not null and public.is_company_member(company_id));
drop policy if exists "Company admins can insert parties" on public.parties;
create policy "Company admins can insert parties" on public.parties
  for insert with check (company_id is not null and public.is_company_admin(company_id));
drop policy if exists "Company admins can update parties" on public.parties;
create policy "Company admins can update parties" on public.parties
  for update using (company_id is not null and public.is_company_admin(company_id))
  with check (company_id is not null and public.is_company_admin(company_id));
drop policy if exists "Company admins can delete parties" on public.parties;
create policy "Company admins can delete parties" on public.parties
  for delete using (company_id is not null and public.is_company_admin(company_id));

drop policy if exists "Company members can read vouchers" on public.vouchers;
create policy "Company members can read vouchers" on public.vouchers
  for select using (company_id is not null and public.is_company_member(company_id));
drop policy if exists "Company admins can insert vouchers" on public.vouchers;
create policy "Company admins can insert vouchers" on public.vouchers
  for insert with check (company_id is not null and public.is_company_admin(company_id));
drop policy if exists "Company admins can update vouchers" on public.vouchers;
create policy "Company admins can update vouchers" on public.vouchers
  for update using (company_id is not null and public.is_company_admin(company_id))
  with check (company_id is not null and public.is_company_admin(company_id));
drop policy if exists "Company admins can delete vouchers" on public.vouchers;
create policy "Company admins can delete vouchers" on public.vouchers
  for delete using (company_id is not null and public.is_company_admin(company_id));

commit;
