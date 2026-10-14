# Inventory-App Code Audit & UX Review

## Scope

Reviewed the current React/Vite accounting app, role context, route guard, navigation, local Dexie accounting engine, Supabase schema, login screen, and build configuration. The changes on this branch are a focused first pass—not a declaration that the app is production-ready.

## Changes made on this branch

- **Least-privilege role handling:** real sessions now become `admin` only when Supabase returns an `admin` profile. Missing/error profile lookups fall back to read-only instead of silently elevating.
- **Demo boundary:** demo login is development-only; sample records are initialized only after explicitly entering local demo mode. The login screen warns that demo records are local and not tenant-isolated.
- **RLS writes:** the schema removes the permissive `OR auth.role() = 'authenticated'` write clauses and requires `public.is_admin()` for mutations. The profile default is read-only (`owner`). Reapplying the relevant role/write policy definitions is supported through `drop policy if exists`.
- **Cloud seed safety:** removed fictitious ledgers, parties, and materials from the shared Supabase schema. Existing records are not automatically deleted.
- **Inventory movement correctness:** stock matching now tries material ID, then SKU, then name. This avoids a display-name mismatch blocking a valid SKU lookup. Stock effects are no longer silently clamped at zero, because that made voucher reversal/edit operations restore incorrect quantities after an oversell.
- **Navigation and mobile accessibility:** removed role switching from persistent navigation, clarified read-only/demo status, added accessible mobile-menu state and sign-out labeling, hid the desktop quick-voucher control on narrow screens (the mobile quick action remains), and removed the duplicate dashboard voucher CTA.
- **Login and shell:** caught network failures during login, aligned browser metadata with TallyFlow SaaS, removed stale undeclared PWA configuration and its incorrect Inventory Scan manifest, restored browser zoom on mobile, and added visible keyboard focus/reduced-motion support.
- **Efficiency:** trend chart now aggregates vouchers in one pass instead of filtering the full list 14 times, and the dashboard/summary share one gross-profit rule and local-date helper. Missing cost rates are estimated at 20% rather than being treated as zero cost.
- **Date consistency:** business-date filters and voucher defaults now use the browser's local date instead of UTC date slicing.
- **Documentation:** replaced the unrelated QR-scanner README with documentation for the actual accounting application and documented the remaining blockers below.

## Remaining high-priority findings

### P0 — Do not use as a multi-tenant production accounting service yet

1. **No tenant/company ownership boundary in Supabase.** `materials`, `ledgers`, `parties`, and `vouchers` have no `tenant_id`/company key. Read policies currently let all authenticated users read every row. The new write policy narrows who can mutate records, but it does not isolate one business from another. Add a tenant/company model, membership table, tenant-scoped RLS, and tenant-scoped uniqueness constraints before hosting multiple businesses.
2. **The browser database is global to the browser profile.** Dexie uses the fixed database name `TallySaasAccounting`, not an authenticated user or business scope. Local records can therefore appear across account changes on the same browser. Partition local data by tenant/user and design an explicit migration for existing local records; do not silently guess which account owns old records.
3. **Cloud synchronization is incomplete.** Voucher upserts/deletes are best-effort and catch errors without surfacing sync status or queuing retry work. Masters and all balance mutations are not consistently synchronized or hydrated from Supabase. A green/successful local save can therefore diverge from cloud data. Add an explicit outbox/sync state, retry with idempotency, conflict handling, and a visible last-sync/error indicator.
4. **Financial writes are not atomic.** Voucher creation/edit/delete modifies the voucher plus inventory, party, and ledger balances as separate writes. A failure mid-operation can leave balances inconsistent. Wrap local mutations in Dexie transactions and move authoritative posting/reversal into a trusted database transaction/RPC with reconciliation tests.
5. **Existing fake data may remain.** The revised schema no longer inserts sample rows on a fresh setup, but it intentionally does not delete records from an already-used database. Review any existing rows with demo names before real use; do not run a blind deletion against a database that might contain real records.

### P1 — Accounting logic and correctness

- **Negative stock is now visible in the arithmetic, not prevented.** This preserves reversal correctness but means sales can make stock negative. Add an explicit configurable negative-stock policy and pre-posting validation, including the edit case where the old voucher is reversed before the new one is applied.
- **Party and ledger balances are maintained as mutable totals.** They can drift from voucher history, especially after imports, partial failures, or edits. Prefer deriving/reconciling balances from journal entries and keep immutable audit events for posted/cancelled vouchers.
- **UID generation scans all parties and is race-prone.** Concurrent sales can generate the same UID because the max+1 scan is not atomic across browser tabs/devices. Move UID allocation to a database sequence or a unique-constraint-protected server function.
- **Date boundary testing is still required.** The main voucher defaults, dashboard, sales filter, day-book filter, banking settlements, and party settlements now use local business-date helpers, but add automated tests around midnight and timezone changes before relying on them for accounting periods.
- **Profit remains partly estimated.** The dashboard now states that 20% is estimated when cost rates are missing; make this estimate even more explicit in exports and metric cards, and consider showing estimated and cost-backed portions separately.
- **Tally import needs a dry-run and duplicate protection.** Validate rows, match items by stable code/SKU, show unmatched masters and duplicate voucher numbers, then require confirmation before committing. Never silently apply guessed costs or quantities.
- **Cloud RLS is not the same as local authorization.** UI role checks are a usability layer; every cloud mutation needs RLS/server enforcement, and local write controls must be scoped to the active local mode.

### P2 — UI/UX and maintainability

- Keep one clear primary action per page and reduce duplicate “New Voucher” entry points where a contextual page action already exists.
- Increase small secondary text and action hit areas on dense accounting tables; provide mobile card/row details instead of forcing wide horizontal tables.
- Add empty states that tell the user what to do next, destructive-action confirmation with voucher identifiers, and clear validation close to the relevant field.
- Give save, import, and sync distinct states: saving, saved locally, synced, and sync failed. Do not use success alerts for incomplete cloud synchronization.
- Add automated tests for posting, edit-reversal, delete-reversal, UID assignment, CSV/XLS import, and RLS role behavior before expanding features.

## Suggested next sequence

1. Complete tenant/company data separation and scope every query/policy.
2. Build an authoritative posting transaction and test accounting invariants.
3. Implement a visible, retryable sync outbox and cloud-to-local hydration.
4. Add import preview/matching and accounting regression tests.
5. Apply the remaining responsive UI polish and measure the results on a phone and small laptop.

## Validation status

The repository connector allowed source inspection and branch commits. A local `npm run build` / `npm run lint` attempt could not run in this environment because outbound access to GitHub is unavailable, so compilation and lint status remain unverified. Run both commands before merging.
