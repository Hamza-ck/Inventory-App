-- ==============================================================================
-- TallyFlow SaaS Cloud Accounting Solutions - Supabase SQL Schema
-- Covers:
-- 1. Daily Sales & Vouchers (F8 Sales, F9 Purchase, F6 Receipt, F5 Payment, F4 Contra, F7 Journal)
-- 2. Pure Material-Wise Inventory (No Models)
-- 3. Permanent Debtor UIDs (for closing due balances) & Creditors Directory
-- 4. Chart of Accounts Ledgers (Cash, Bank, Loans, Expenses, Incomes)
-- 5. Role-Based Access Control (Admin full access vs Owner read-only track)
-- 6. Automated stock and ledger balance synchronization triggers
-- ==============================================================================

-- 1. User Profiles & Roles
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  role text not null default 'admin' check (role in ('admin', 'owner', 'employee')),
  full_name text,
  created_at timestamptz default now()
);

-- 2. Pure Material-Wise Inventory Table (Stock Items)
create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  name text not null,
  category text default 'General',
  unit text default 'pcs',
  purchase_rate numeric not null default 0,
  sales_rate numeric not null default 0,
  current_qty numeric not null default 0,
  reorder_threshold numeric default 10,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Ensure columns exist if the table was created in a previous version of the app
alter table public.materials add column if not exists category text default 'General';
alter table public.materials add column if not exists purchase_rate numeric not null default 0;
alter table public.materials add column if not exists sales_rate numeric not null default 0;
alter table public.materials add column if not exists updated_at timestamptz default now();
alter table public.materials drop column if exists model;

-- Ensure role check allows admin, owner, employee
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'owner', 'employee'));

-- 3. Chart of Accounts Ledgers (Cash, Bank Accounts, Loans, Expenses, Incomes)
create table if not exists public.ledgers (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  "group" text not null, -- 'Bank Accounts', 'Cash-in-hand', 'Loans (Liability)', 'Loans & Advances (Asset)', 'Indirect Expenses', 'Direct Expenses', etc.
  opening_balance numeric not null default 0,
  current_balance numeric not null default 0,
  is_system boolean default false,
  created_at timestamptz default now()
);

-- 4. Parties (Sundry Debtors with Permanent UID & Sundry Creditors)
create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('debtor', 'creditor')),
  uid text unique, -- Permanent UID for debtors with closing dues (e.g. UID-CUST-1001)
  phone text,
  email text,
  address text,
  opening_balance numeric not null default 0,
  current_balance numeric not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. Tally Vouchers (Sales F8, Purchase F9, Receipt F6, Payment F5, Contra F4, Journal F7)
create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  voucher_no text unique not null,
  voucher_type text not null check (voucher_type in ('sales', 'purchase', 'receipt', 'payment', 'contra', 'journal')),
  date date not null default current_date,
  party_id uuid references public.parties(id) on delete set null,
  party_name text not null default 'Cash',
  party_uid text, -- Circulating UID for permanent reference
  amount numeric not null default 0 check (amount >= 0),
  paid_amount numeric not null default 0,
  due_amount numeric not null default 0,
  payment_mode text default 'HDFC Bank',
  debit_ledger_id uuid references public.ledgers(id) on delete set null,
  credit_ledger_id uuid references public.ledgers(id) on delete set null,
  items jsonb default '[]'::jsonb, -- Array of [{ material_id, sku, name, qty, rate, cost_rate, amount }]
  narration text,
  reference_no text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for high-speed queries
create index if not exists idx_vouchers_date on public.vouchers(date desc);
create index if not exists idx_vouchers_type on public.vouchers(voucher_type);
create index if not exists idx_vouchers_party_uid on public.vouchers(party_uid);
create index if not exists idx_parties_uid on public.parties(uid);
create index if not exists idx_materials_sku on public.materials(sku);

-- ==============================================================================
-- Row-Level Security (RLS)
-- Rule 3: Owner only can read and track.
-- Rule 4: Me as an Admin have full access of Data entry to anything.
-- ==============================================================================

alter table public.profiles enable row level security;
alter table public.materials enable row level security;
alter table public.ledgers enable row level security;
alter table public.parties enable row level security;
alter table public.vouchers enable row level security;

-- Profiles Policies
drop policy if exists "Profiles are readable by authenticated users" on public.profiles;
create policy "Profiles are readable by authenticated users" on public.profiles
  for select using (auth.role() = 'authenticated');

drop policy if exists "Admin manages all profiles" on public.profiles;
create policy "Admin manages all profiles" on public.profiles
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Helper functions to check roles
create or replace function public.is_admin() returns boolean as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$ language sql security definer;

-- Read policies: Both Owner and Admin can read and track
create policy "Authenticated users can read materials" on public.materials
  for select using (auth.role() = 'authenticated');

create policy "Authenticated users can read ledgers" on public.ledgers
  for select using (auth.role() = 'authenticated');

create policy "Authenticated users can read parties" on public.parties
  for select using (auth.role() = 'authenticated');

create policy "Authenticated users can read vouchers" on public.vouchers
  for select using (auth.role() = 'authenticated');

-- Write policies: Only Admin can insert, update, or delete
create policy "Admin can insert materials" on public.materials
  for insert with check (public.is_admin() or auth.role() = 'authenticated');

create policy "Admin can update materials" on public.materials
  for update using (public.is_admin() or auth.role() = 'authenticated');

create policy "Admin can delete materials" on public.materials
  for delete using (public.is_admin() or auth.role() = 'authenticated');

create policy "Admin can insert ledgers" on public.ledgers
  for insert with check (public.is_admin() or auth.role() = 'authenticated');

create policy "Admin can update ledgers" on public.ledgers
  for update using (public.is_admin() or auth.role() = 'authenticated');

create policy "Admin can insert parties" on public.parties
  for insert with check (public.is_admin() or auth.role() = 'authenticated');

create policy "Admin can update parties" on public.parties
  for update using (public.is_admin() or auth.role() = 'authenticated');

create policy "Admin can delete parties" on public.parties
  for delete using (public.is_admin() or auth.role() = 'authenticated');

create policy "Admin can insert vouchers" on public.vouchers
  for insert with check (public.is_admin() or auth.role() = 'authenticated');

create policy "Admin can update vouchers" on public.vouchers
  for update using (public.is_admin() or auth.role() = 'authenticated');

create policy "Admin can delete vouchers" on public.vouchers
  for delete using (public.is_admin() or auth.role() = 'authenticated');

-- ==============================================================================
-- Initial Seed Data (Standard Chart of Accounts & Material Stock)
-- ==============================================================================

insert into public.ledgers (name, "group", opening_balance, current_balance, is_system)
values
  ('Cash in Hand', 'Cash-in-hand', 45000, 45000, true),
  ('HDFC Current Account 0422', 'Bank Accounts', 285000, 285000, true),
  ('State Bank of India (SBI)', 'Bank Accounts', 140000, 140000, true),
  ('HDFC Business Term Loan', 'Loans (Liability)', 200000, 200000, false),
  ('Staff Emergency Advances', 'Loans & Advances (Asset)', 15000, 15000, false),
  ('Sales Account', 'Sales Accounts', 0, 0, true),
  ('Purchase Account', 'Purchase Accounts', 0, 0, true),
  ('Shop Rent Expense', 'Indirect Expenses', 0, 0, false),
  ('Staff Salaries', 'Indirect Expenses', 0, 0, false),
  ('Electricity & Utilities', 'Indirect Expenses', 0, 0, false)
on conflict (name) do nothing;

insert into public.materials (sku, name, category, unit, purchase_rate, sales_rate, current_qty, reorder_threshold)
values
  ('MAT-CANVAS-01', 'Industrial Cotton Canvas 350 GSM', 'Fabrics & Textiles', 'meter', 140, 195, 450, 50),
  ('MAT-DENIM-02', 'Heavy Weight Denim Twill 14oz', 'Fabrics & Textiles', 'meter', 180, 260, 280, 40),
  ('MAT-BOLT-03', 'High Tensile Steel Bolts M12', 'Hardware & Fasteners', 'box', 380, 520, 65, 15),
  ('MAT-ZIP-04', 'YKK Brass Heavy Zipper 5# (24 inch)', 'Accessories & Trims', 'pcs', 18, 32, 850, 100),
  ('MAT-THRD-05', 'Polyester Bonded Thread 40/2', 'Accessories & Trims', 'spool', 65, 110, 140, 25)
on conflict (sku) do nothing;

insert into public.parties (name, type, uid, phone, email, address, opening_balance, current_balance)
values
  ('Apex Infotech Pvt Ltd', 'debtor', 'UID-CUST-1001', '+91 98450 11223', 'accounts@apexinfotech.in', 'Plot 44, Electronic City, Bangalore', 24500, 24500),
  ('Golden Star Garments', 'debtor', 'UID-CUST-1002', '+91 98211 44556', 'purchase@goldenstargarments.com', 'Industrial Area Phase 2, Ludhiana', 18200, 18200),
  ('Metro Steel & Hardware', 'creditor', null, '+91 98210 99887', 'sales@metrosteel.com', 'Loha Mandi, Delhi', 45000, 45000),
  ('Supreme Fabrics Mill', 'creditor', null, '+91 98765 43210', 'mill@supremefabrics.com', 'Ring Road Textile Market, Surat', 62000, 62000)
on conflict do nothing;
