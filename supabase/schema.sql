-- Run this once in the Supabase SQL editor for your project.

-- 1. Profiles: extends auth.users with a role
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  role text not null default 'employee' check (role in ('owner', 'employee')),
  full_name text,
  created_at timestamptz default now()
);

-- 2. Materials: one row per QR code / SKU
create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  name text not null,
  model text,
  unit text default 'pcs',
  current_qty numeric not null default 0,
  reorder_threshold numeric default 0,
  created_at timestamptz default now()
);

-- 3. Transactions: the inward/outward ledger
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  material_id uuid references public.materials(id) not null,
  qty numeric not null check (qty > 0),
  direction text not null check (direction in ('in', 'out')),
  user_id uuid references auth.users(id) not null,
  created_at timestamptz default now()
);

-- Row level security -------------------------------------------------

alter table public.profiles enable row level security;
alter table public.materials enable row level security;
alter table public.transactions enable row level security;

create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "owner reads and manages all profiles" on public.profiles
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'owner')
  );

create policy "materials readable by any signed in user" on public.materials
  for select using (auth.role() = 'authenticated');

create policy "only owner can add or edit materials" on public.materials
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'owner')
  );

create policy "any signed in user can log their own transaction" on public.transactions
  for insert with check (auth.uid() = user_id);

create policy "owner reads all transactions" on public.transactions
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'owner')
  );

create policy "employee reads their own transactions" on public.transactions
  for select using (auth.uid() = user_id);

-- Automation -----------------------------------------------------------

-- keep materials.current_qty in sync whenever a transaction is logged
create or replace function public.apply_transaction()
returns trigger as $$
begin
  if new.direction = 'in' then
    update public.materials set current_qty = current_qty + new.qty where id = new.material_id;
  else
    update public.materials set current_qty = current_qty - new.qty where id = new.material_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_apply_transaction on public.transactions;
create trigger trg_apply_transaction
after insert on public.transactions
for each row execute function public.apply_transaction();

-- Reverse the qty change when a transaction is deleted (undo)
create or replace function public.reverse_transaction()
returns trigger as $$
begin
  if old.direction = 'in' then
    update public.materials set current_qty = current_qty - old.qty where id = old.material_id;
  else
    update public.materials set current_qty = current_qty + old.qty where id = old.material_id;
  end if;
  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_reverse_transaction on public.transactions;
create trigger trg_reverse_transaction
before delete on public.transactions
for each row execute function public.reverse_transaction();

-- Allow owner to delete any transaction (undo any movement)
create policy "owner can delete any transaction" on public.transactions
  for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'owner')
  );

-- Allow employee to delete only their own transactions (undo own movement)
create policy "employee can delete own transaction" on public.transactions
  for delete using (auth.uid() = user_id);

-- auto-create or update profile with chosen role whenever a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, full_name) values (
    new.id, 
    coalesce(new.raw_user_meta_data->>'role', 'employee'),
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do update set
    role = coalesce(excluded.role, public.profiles.role),
    full_name = coalesce(excluded.full_name, public.profiles.full_name);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user
after insert on auth.users
for each row execute function public.handle_new_user();
