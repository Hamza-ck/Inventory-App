# MEEMX ERP — Complete Accounting & Tally Solutions

Modern accounting and business management PWA designed with an executive dashboard, 4-digit PIN authentication, material-wise inventory, debtors & creditors ledger tracking with WhatsApp reminders, loans & advances, and seamless Tally file import.

## ✨ Features

- **Executive & Admin Dashboards**:
  - Daily & monthly sales, gross & net profit, operating expenses, and live KPIs.
  - Interactive 7-day revenue trend bar chart.
  - Custom drag-and-drop layout ordering & card visibility control for the Owner.
- **4-Digit PIN Security**:
  - Fast, secure keypad access without passwords.
  - **Owner PIN**: `1234` (read-only executive view)
  - **Admin PIN**: `8888` (full control & console)
  - Custom 4-digit PIN assignment for all team members.
- **Debtors & Creditors**:
  - 3-segment aging breakdown (`0–30d`, `31–60d`, `60d+`).
  - One-click **Call** & **WhatsApp payment reminder** with pre-filled message templates.
  - Permanent UID circulation for debtors with outstanding closing dues.
- **Inventory Management**:
  - Material-wise stock tracking with health indicators (`Low`, `Healthy`, `Out of stock`).
  - Filtering by `All`, `Low stock`, and `Slow moving`.
- **Tally Data Import**:
  - Full support for Tally Prime and Tally ERP 9 XML & Excel Day Book, ledgers, and masters.
  - Pre-import validation engine with automated discrepancy resolution.
- **Offline-First Resilience**:
  - Fully functional client-side persistence powered by Dexie IndexedDB.
  - PWA support with service worker precaching.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ or 20+ or 22+
- npm or bun

### Installation

```bash
# Clone the repository
git clone https://github.com/Hamza-ck/Inventory-App.git
cd Inventory-App

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:3000`.

### Building for Production

```bash
npm run build
```

Production assets are emitted to `dist/` ready to be served by any static host (Vercel, Netlify, Cloudflare Pages, Firebase Hosting, Nginx).
