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

### P0 — Do not treat this as a production accounting ledger yet

1. **Cloud replication is not an atomic accounting posting engine.** Browser-local voucher posting is now wrapped in one Dexie transaction covering the voucher, stock, party/ledger effects, and outbox entries. The cloud outbox still synchronizes each entity separately, so a partial network failure can temporarily leave cloud snapshots inconsistent. A trusted Postgres posting/reversal RPC with idempotency keys is the next step before cloud data is treated as authoritative.
2. **Multi-device conflict resolution is incomplete.** The sync process uses last-write snapshots and does not yet provide optimistic concurrency/version checks. Two devices editing the same voucher or stock master can overwrite each other. Add row versions and conflict review rather than silently overwriting.
3. **Legacy cloud data needs deliberate assignment.** The company migration preserves old rows with `company_id = NULL`; RLS hides them until the owner maps them to the correct company. Back up and verify the data before any assignment. The migration must be run after `supabase/schema.sql`.
4. **Existing local legacy data is not automatically migrated.** Signed-in companies use separate IndexedDB databases named by company UUID. The old unscoped `TallySaasAccounting` database is preserved, not copied into a company automatically. Provide a reviewed import/migration workflow before using any legacy local records.

### P1 — Accounting logic and correctness

- **Negative stock is still allowed.** It preserves exact reversal arithmetic, but the app needs a configurable policy and pre-posting validation.
- **Party and ledger balances are mutable totals.** They can drift after imports or conflicting edits. Add journal entries, immutable posting events, and a reconciliation report.
- **Debtor UID generation is browser-local and race-prone.** Move UID allocation to a database sequence or a unique-constraint-protected RPC before concurrent multi-device entry.
- **Date boundary tests are still required.** Add automated tests around midnight and timezone changes.
- **Profit remains partly estimated.** Cost rates missing from an item use a 20% estimate; clearly distinguish estimated and cost-backed profit in exports and summary cards.
- **Tally import needs a dry-run and duplicate protection.** Validate rows, show unmatched masters/duplicate voucher numbers, and require confirmation before committing.
- **Validation/test coverage remains limited.** Add regression tests for posting, edit reversal, delete reversal, import, tenant RLS, retry idempotency, and two-company isolation.

### P2 — UI/UX and maintainability

- Keep one clear primary action per page and contextual actions where possible.
- Increase secondary text and action hit areas on dense accounting tables; add mobile-friendly row/card layouts.
- Provide empty states, clear field-level validation, and confirmations that include voucher identifiers.
- Keep save, locally saved, syncing, synced, and sync failed as distinct states. The sync control now surfaces cloud hydration errors and allows immediate retry of queued writes.

## Suggested next sequence

1. Complete tenant/company data separation and scope every query/policy.
2. Build an authoritative posting transaction and test accounting invariants.
3. Implement a visible, retryable sync outbox and cloud-to-local hydration.
4. Add import preview/matching and accounting regression tests.
5. Apply the remaining responsive UI polish and measure the results on a phone and small laptop.

## Validation status

The repository connector allowed source inspection and branch commits. A local `npm run build` / `npm run lint` attempt could not run in this environment because outbound access to GitHub is unavailable, so compilation and lint status remain unverified. Run both commands before merging.
