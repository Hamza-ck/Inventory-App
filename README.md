# TallyFlow SaaS — Accounting Workspace

TallyFlow is a React-based, browser accounting prototype with a local IndexedDB (Dexie) data store and Supabase integration. It includes dashboard summaries, vouchers/day book, sales invoices, material inventory, debtors and creditors, banking/cash views, and Tally XML/Excel import/export tools.

> **Production readiness:** this repository is not yet safe for multi-business production use. The local database is not scoped by user/company, Supabase rows are not tenant-isolated, and the cloud sync implementation is best-effort. Read [AUDIT_AND_UX_REVIEW.md](./AUDIT_AND_UX_REVIEW.md) before connecting real financial records.

## Main modules

- **Dashboard:** summary metrics, sales/profit trends, recent vouchers.
- **Day Book:** search, voucher/date filters, edit/delete controls, Excel export.
- **Sales & Invoices:** sales vouchers, customer due balances, invoice preview/print.
- **Inventory:** material SKUs, stock valuation, reorder thresholds, movement history, Excel import/export.
- **Parties:** debtor/creditor master data, statements, receipts and payments.
- **Cash & Loans:** cash/bank/loan ledger views and contra transfers.
- **Tally Import/Export:** parse supported Tally XML/Excel files and export XML.

## Technology

- React 19 and React Router
- Vite 8 and Tailwind CSS 4
- Dexie / IndexedDB for browser-local records
- Supabase Auth, Postgres and Row-Level Security
- Recharts, Framer Motion, Lucide, and SheetJS (`xlsx`)

## Run locally

1. Install Node.js (use a current LTS release).
2. Create a local environment file:

   ```bash
   cp .env.example .env
   ```

3. Add your Supabase project's URL and anon/public key to `.env`:

   ```dotenv
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```

4. Install dependencies and start Vite:

   ```bash
   npm install
   npm run dev
   ```

5. Verify locally:

   ```bash
   npm run build
   npm run lint
   ```

The **Demo Admin** and **Demo Owner** buttons are only shown in development builds. They use browser-local sample data to preview the interface and must not be used for real business/customer records.

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Create users through Supabase Auth.
4. Add a profile row for each user using that user's Auth UUID. Assign `admin` only to the account that genuinely needs write access; use `owner` for read-only accounts.

   Example for an administrator:

   ```sql
   insert into public.profiles (id, role, full_name)
   values ('<auth-user-uuid>', 'admin', 'Administrator')
   on conflict (id) do update
     set role = excluded.role,
         full_name = excluded.full_name;
   ```

   Example for a read-only profile:

   ```sql
   insert into public.profiles (id, role, full_name)
   values ('<auth-user-uuid>', 'owner', 'Owner')
   on conflict (id) do update
     set role = excluded.role,
         full_name = excluded.full_name;
   ```

The schema defaults new profile roles to read-only. A missing profile is also treated as read-only by the frontend.

### Existing Supabase projects

The schema no longer inserts demo ledgers, parties, or materials into a shared cloud database. Running the updated schema does **not** delete any sample rows that may already exist in a previously configured project. Review existing records manually before live use; do not blindly delete records if any real data may be present.

## Important architecture notes

- Most page reads and accounting calculations currently use the browser-local Dexie database.
- Voucher cloud upserts/deletes are best-effort and do not yet provide a durable retry queue or reliable visible sync status.
- Supabase write policies now require an `admin` profile, but the current schema does not have a company/tenant ownership model. Authenticated users can still read all rows under the current read policies.
- The local Dexie database name is shared by accounts in one browser profile. Do not treat this as secure account separation.
- Stock movements allow negative balances so that voucher reversals remain arithmetically reversible; negative-stock prevention is still a required accounting-policy feature.
- The old Inventory Scan/QR PWA configuration was removed because the current implementation is an accounting workspace and the plugin was not a declared dependency.

See [AUDIT_AND_UX_REVIEW.md](./AUDIT_AND_UX_REVIEW.md) for the prioritized findings and recommended implementation order.
