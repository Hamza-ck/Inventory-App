-- Run this once in the Supabase SQL editor for your project.

-- 1. Profiles: extends auth.users with a role
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  role text not null default 'employee' check (role in ('owner', 'employee')),
  full_name text,
  created_at timestamptz default now()
);

-- 2. Materials: one row per QR code / SKU
create table public.materials (
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
create table public.transactions (
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

create trigger trg_apply_transaction
after insert on public.transactions
for each row execute function public.apply_transaction();

-- auto-create a profile (default role: employee) whenever a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role) values (new.id, 'employee');
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_handle_new_user
after insert on auth.users
for each row execute function public.handle_new_user();

-- To make yourself the owner after signing up once through the app:
-- update public.profiles set role = 'owner' where id = '<your-user-id-from-auth.users>';
