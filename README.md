# TallyFlow SaaS — Accounting Workspace

TallyFlow is a React-based, browser accounting prototype with a local IndexedDB (Dexie) data store and Supabase integration. It includes dashboard summaries, vouchers/day book, sales invoices, material inventory, debtors and creditors, banking/cash views, and Tally XML/Excel import/export tools.

> **Production readiness:** company-scoped storage, membership-based Supabase RLS, retryable sync, and cloud hydration are implemented as a first pass. This is not yet fully production-ready: cloud replication is not an atomic accounting ledger, and multi-device conflict resolution and accounting reconciliation still require testing. Read [AUDIT_AND_UX_REVIEW.md](./AUDIT_AND_UX_REVIEW.md) before connecting real financial records.

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

1. Create a Supabase project and configure `.env` using the example above.
2. Run `supabase/schema.sql` in the SQL Editor.
3. Run `supabase/migrations/20261014_company_isolation.sql` in the SQL Editor **after** the schema. This adds companies, memberships, tenant-scoped uniqueness, and company-membership RLS. Legacy cloud rows are deliberately left unassigned and inaccessible until you explicitly map them to a company.
4. Enable Supabase Auth sign-in and create your user.
5. Sign in to the app and create the company from the company setup screen. The setup RPC creates the initial administrator membership; do not manually grant roles in the old `profiles` table for company access.

### Existing Supabase projects

Back up the project before running migrations. The migration preserves legacy accounting rows with `company_id = NULL`; it does not guess which business owns them. Assign existing rows to a verified company only after reviewing them. Do not delete legacy rows blindly. Global unique constraints are replaced with company-scoped indexes so different companies can use the same SKU, ledger name, party name, and voucher number.
 
## Important architecture notes

- Most page reads and accounting calculations currently use the browser-local Dexie database.
- Voucher cloud upserts/deletes are best-effort and do not yet provide a durable retry queue or reliable visible sync status.
- Supabase write policies now require an `admin` profile, but the current schema does not have a company/tenant ownership model. Authenticated users can still read all rows under the current read policies.
- The local Dexie database name is shared by accounts in one browser profile. Do not treat this as secure account separation.
- Stock movements allow negative balances so that voucher reversals remain arithmetically reversible; negative-stock prevention is still a required accounting-policy feature.
- The old Inventory Scan/QR PWA configuration was removed because the current implementation is an accounting workspace and the plugin was not a declared dependency.

See [AUDIT_AND_UX_REVIEW.md](./AUDIT_AND_UX_REVIEW.md) for the prioritized findings and recommended implementation order.
