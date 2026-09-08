-- Supplier/model label intelligence layer
-- Run after the existing supabase/schema.sql.

create table if not exists public.model_aliases (
  id uuid primary key default gen_random_uuid(),
  alias text not null,
  normalized_alias text generated always as (
    regexp_replace(lower(trim(alias)), '[^a-z0-9]+', '', 'g')
  ) stored,
  canonical_model text not null,
  created_at timestamptz default now()
);

create table if not exists public.supplier_model_labels (
  id uuid primary key default gen_random_uuid(),
  label_code text not null,
  normalized_label text generated always as (
    regexp_replace(lower(trim(label_code)), '[^a-z0-9]+', '', 'g')
  ) stored,
  canonical_model text not null,
  -- When set, scans resolve directly to this material (no picker needed).
  -- When NULL, falls back to model-based material picker.
  material_id uuid references public.materials(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- A label code is unique per model. The same label (e.g. "V22") can map to
-- different materials under the same model via material_id, but there is only
-- one row per normalized_label.
create unique index if not exists supplier_model_labels_normalized_label_uidx
  on public.supplier_model_labels(normalized_label);

create index if not exists model_aliases_normalized_alias_idx
  on public.model_aliases(normalized_alias);

create index if not exists model_aliases_canonical_model_idx
  on public.model_aliases(canonical_model);

create index if not exists supplier_model_labels_canonical_model_idx
  on public.supplier_model_labels(canonical_model);

alter table public.model_aliases enable row level security;
alter table public.supplier_model_labels enable row level security;

drop policy if exists "authenticated users can read model aliases" on public.model_aliases;
create policy "authenticated users can read model aliases"
  on public.model_aliases for select
  using (auth.role() = 'authenticated');

drop policy if exists "owner manages model aliases" on public.model_aliases;
create policy "owner manages model aliases"
  on public.model_aliases for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'owner'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'owner'));

drop policy if exists "authenticated users can read supplier model labels" on public.supplier_model_labels;
create policy "authenticated users can read supplier model labels"
  on public.supplier_model_labels for select
  using (auth.role() = 'authenticated');

drop policy if exists "owner manages supplier model labels" on public.supplier_model_labels;
create policy "owner manages supplier model labels"
  on public.supplier_model_labels for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'owner'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'owner'));

-- Allow any signed-in user (employee or owner) to insert/update supplier label
-- mappings during inward scans. This lets employees teach label→material links.
drop policy if exists "any user can upsert supplier model labels" on public.supplier_model_labels;
create policy "any user can upsert supplier model labels"
  on public.supplier_model_labels for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "any user can update supplier model labels" on public.supplier_model_labels;
create policy "any user can update supplier model labels"
  on public.supplier_model_labels for update
  using (auth.role() = 'authenticated');

insert into public.model_aliases (alias, canonical_model)
select distinct trim(model), trim(model)
from public.materials m
where nullif(trim(model), '') is not null
  and not exists (
    select 1 from public.model_aliases ma
    where ma.normalized_alias = regexp_replace(lower(trim(m.model)), '[^a-z0-9]+', '', 'g')
  );

-- Migration: add material_id column if the table already exists without it
-- (safe to run multiple times)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'supplier_model_labels'
      and column_name = 'material_id'
  ) then
    alter table public.supplier_model_labels
      add column material_id uuid references public.materials(id) on delete set null;
  end if;
end $$;
