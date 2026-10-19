# TallyFlow: inventory + accounting PWA

Offline-first accounting and stock app for a small trading business. Everything is stored in the browser (IndexedDB via Dexie); Supabase is used for sign-in only.

## What it does
- **Vouchers**: sales, purchase, receipt, payment, contra. Every voucher updates stock, party balances and cash/bank ledgers in one atomic transaction; edit or delete reverses and re-applies exactly.
- **Debtor UIDs**: a sale that leaves a balance due gives the customer a permanent `UID-CUST-xxxx`.
- **Payments against expense / loan ledgers** feed Net Profit and the Cash & Loans page.
- **Dashboard**: sales, profit, cash & bank, money to collect, low stock.
- **Tally**: import XML / Excel day-books (atomic, de-duplicated) and export XML.

## Run
```bash
cp .env.example .env   # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```
First launch creates an empty book (Cash in Hand + a few expense ledgers). Use **Load sample data** on the dashboard to explore.

## Layout
```
src/lib/accountingDb.js   data layer + all voucher/stock/balance rules (transactional)
src/lib/jsQuery.js        dashboard metrics
src/lib/tallyParser.js    Tally XML/Excel parse + XML export
src/lib/useTable.js       live (auto-refreshing) table hooks
src/context/              auth, toasts/confirm, shared voucher editor
src/components/Layout.jsx nav + shared modals, mounted once
```
