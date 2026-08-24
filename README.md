# Inventory Scan — QR based inward/outward tracker

A PWA where Employees scan a QR code per material, fill in a quantity, and
submit a queue of inward/outward moves. Owners get the same scanner plus a
data dashboard. Runs in any browser, installable to a home screen, and the
scan queue works even with no signal (synced to the backend afterward).

## Stack
- React + Vite, built as an installable PWA (`vite-plugin-pwa`)
- `qr-scanner` for camera-based QR scanning
- Dexie (IndexedDB) as the local, offline-first scan queue
- Supabase (Postgres + Auth + Row Level Security) as the backend
- `recharts` for the owner dashboard

## 1. Create your Supabase project
1. Go to https://supabase.com, create a new project, wait for it to provision.
2. In the SQL editor, paste and run everything in `supabase/schema.sql`.
   This creates the `profiles`, `materials`, and `transactions` tables,
   the row-level-security policies that separate Owner vs Employee access,
   and two triggers: one that auto-creates a profile on signup, one that
   keeps `materials.current_qty` updated whenever a transaction is logged.
3. In Project Settings → API, copy your Project URL and anon public key.

## 2. Configure the app
```bash
cp .env.example .env
# then fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

## 3. Install and run
```bash
npm install
npm run dev
```
Open the printed local URL. On a phone, use your machine's LAN IP so the
camera permission prompt works (camera access requires HTTPS or localhost —
for LAN testing on a phone you'll want `npm run dev -- --host` plus a tool
like `mkcert` or ngrok for HTTPS; for local desktop testing localhost works
as-is).

## 4. Create your first users
Sign-up isn't wired into the UI on purpose — accounts are created by you as
the owner (typical for an internal tool). In the Supabase dashboard, go to
Authentication → Users → Add user, and create one for yourself and one per
employee. Every new user gets an `employee` profile automatically. To make
yourself the owner, run in the SQL editor:
```sql
update public.profiles set role = 'owner' where id = '<your-user-id>';
```
(Find the user id in Authentication → Users.)

## 5. Add your materials and print QR labels
As the owner, go to **Materials** in the app to add each item (sku, name,
model, unit, reorder threshold) — `sku` is what gets encoded into that
item's QR code. Then go to **Labels** to generate and print a QR code per
material; laminate and stick on the bin/shelf.

You don't have to pre-register everything up front: if an owner scans a
QR code that isn't in the system yet, the scan screen offers an inline
"register & add to queue" form on the spot.

## Project structure
```
src/
  lib/
    supabaseClient.js   # Supabase connection
    db.js               # Dexie offline queue
    sync.js             # pushes queue -> Supabase, retry-safe
  context/
    AuthContext.jsx      # session + role
  components/
    ProtectedRoute.jsx   # role-gated routing
    Nav.jsx               # role-aware top nav
    ScannerView.jsx        # camera + QR decode
    QueueList.jsx          # editable pending-scan list
    QueueAutoSync.jsx      # retries the queue when connectivity returns
  pages/
    Login.jsx
    ScanPage.jsx          # shared by Employee and Owner
    OwnerDashboard.jsx    # stock levels, low-stock alerts, recent activity
    MaterialsPage.jsx     # owner: add/edit/delete materials
    LabelsPage.jsx        # owner: generate + print QR labels
supabase/
  schema.sql              # run once in the Supabase SQL editor
```

## How each piece works
- **Scan → queue**: scanning a QR adds it to a local IndexedDB queue
  immediately, quantity blank by default. The queue is always visible and
  editable regardless of whether it's filled in — nothing is written to
  the server until "Submit queue" runs, and only items with a quantity
  filled in are sent.
- **Offline resilience**: the app shell is precached by the service worker
  (installable, opens with no signal). The queue itself lives in
  IndexedDB, so adding/editing/removing items works fully offline. Sync
  is retried automatically whenever the browser fires an `online` event,
  and every 45s as a safety net while items are pending — see
  `QueueAutoSync.jsx`. (This is a lighter-weight stand-in for the
  Background Sync API, which needs a custom service worker and only helps
  once the tab is reopened — not worth the complexity for a single-device
  scanning tool.)
- **Roles**: enforced at the database layer via Postgres row-level
  security (`supabase/schema.sql`), not just hidden UI — an employee
  account cannot read or write owner-only tables even by calling the API
  directly.
- **Unknown QR codes**: if an owner scans a code with no matching material,
  the scan screen offers an inline quick-add form instead of failing.
  Employees scanning an unregistered code get queued with a "needs owner
  to register" note; sync will succeed automatically once it's added.

## Deploying
Push to GitHub, import into Vercel or Netlify, add the two env vars in
the project's dashboard settings, deploy. It'll be installable as a PWA
from the deployed URL immediately.

## Possible future enhancements
- True Background Sync API (survives the tab being closed, not just backgrounded)
- CSV export from the dashboard for accounting/reporting
- Multiple locations/warehouses per material
- Push notifications on low stock
