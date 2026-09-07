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
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

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

insert into public.model_aliases (alias, canonical_model)
select distinct trim(model), trim(model)
from public.materials m
where nullif(trim(model), '') is not null
  and not exists (
    select 1 from public.model_aliases ma
    where ma.normalized_alias = regexp_replace(lower(trim(m.model)), '[^a-z0-9]+', '', 'g')
  );
