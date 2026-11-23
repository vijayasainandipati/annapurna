# Annapurna — Implementation Plan & Phase Roadmaps

---

## 1. Repository Audit & Environment Status

### 1.1 Working Directory Audit
- **Path:** `C:\Users\Vijayasai\Desktop\Annapurna`
- **Initial State:** Empty workspace, uninitialized Git repository.
- **Action Taken:** `git init` executed, establishing a clean dedicated Git repository.
- **Git Branch:** `master`

### 1.2 Host Toolchain & Runtime Findings
- **Node.js:** `v26.2.0` (Active and verified)
- **NPM:** `11.13.0` (Active and verified)
- **Git:** `2.53.0.windows.2` (Active and verified)
- **UV (Python Package & Tool Manager):** Located at `C:\Users\Vijayasai\.local\bin\uv.exe` (Operational; manages isolated CPython 3.12+ runtimes)
- **PostgreSQL:** Version 16.14 installed at `C:\Program Files\PostgreSQL\16\bin\psql.exe`
- **Docker:** CLI not installed in standard user path; execution will leverage local services (managed Python venv, Node, PostgreSQL, and embedded/standalone Redis) with Docker Compose configuration provided for containerized environments.

---

## 2. Architecture Implementation Map

```text
Annapurna Root
├── docs/                      # Architectural, business rule, and data documentation
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI ASGI app + Socket.IO mount
│   │   ├── core/              # Config, DB session (SQLAlchemy 2 async), security, realtime
│   │   ├── models/            # SQLAlchemy 2.0 ORM models (UUID PKs, NUMERIC precision)
│   │   ├── schemas/           # Pydantic v2 schemas for request/response validation
│   │   ├── services/          # Pure business services (stock, production, costing, tax, events)
│   │   ├── modules/           # API routers (auth, masters, sales, inventory, production, etc.)
│   │   └── workers/           # Outbox publisher worker
│   ├── alembic/               # Schema migrations
│   ├── seed/                  # Canonical benchmark seed scripts
│   ├── tests/                 # Pytest test suite (business logic, transactions, benchmark)
│   └── pyproject.toml         # UV / pip dependency management
└── frontend/
    ├── app/                   # Next.js 15 App Router
    │   ├── (auth)/login/
    │   ├── (salesman)/        # Mobile PWA order flow
    │   ├── (admin)/           # Order inbox, dispatch, billing
    │   ├── (production)/      # Batch run, material issue, output, variance
    │   ├── (owner)/           # Executive dashboard, KPIs, cost trends
    │   └── (reports)/         # Traceable registers, GST, stock ledger
    ├── components/
    │   ├── ui/                # Accessible design system (buttons, badges, inputs, dialogs)
    │   ├── layout/            # Role-aware navigation, top bar, realtime connection pill
    │   └── illustrations/     # Nano Banana vintage kitchen artwork
    ├── hooks/                 # React hooks for TanStack Query & Socket.IO
    ├── lib/                   # API clients, offline IndexedDB sync, formatting
    └── stores/                # Zustand stores (offline queue, user session)
```

---

## 3. Database ER Design & Entity Mapping

The schema is anchored by:
1. **Master Records:** `materials`, `products`, `boms`, `bom_lines`, `customers`, `users`.
2. **Transactional Records:** `sales_orders`, `sales_order_items`, `invoices`, `dispatches`, `payments`, `production_runs`, `production_issues`.
3. **Immutable Ledgers & Events:** `stock_ledger` (all movements), `outbox_events` (real-time message queue), `audit_logs` (admin and supervisor actions).

---

## 4. API Endpoint Plan

### 4.1 Authentication & RBAC (`/api/v1/auth`)
- `POST /login`: Authenticates username/password, issues JWT bearer token with role claims.
- `GET /me`: Returns profile of the authenticated user.

### 4.2 Masters & Catalog (`/api/v1/masters`)
- `GET /products`: List active products with SKUs, pack sizes, selling prices.
- `GET /materials`: List raw and packaging materials with current valuation rates.
- `GET /customers`: List customers with state and GSTIN.
- `GET /boms/{product_id}`: Retrieve BOM version and planned recipe lines.

### 4.3 Inventory & Stock Ledger (`/api/v1/inventory`)
- `GET /stock-summary`: Grouped stock balances (Raw Materials, Packaging, Finished Goods).
- `GET /ledger`: Paginated, filterable immutable stock ledger entries.
- `POST /purchases`: Record purchase receipts and trigger weighted-average rate recalculation.
- `POST /adjustments`: Record approved inventory adjustments with audit trail.

### 4.4 Production Engine (`/api/v1/production`)
- `GET /runs`: List production runs with batch number, status, variance, and cost per packet.
- `POST /runs`: Create a new draft production batch from BOM.
- `POST /runs/{id}/issues`: Record actual material issues.
- `POST /runs/{id}/post`: **Atomic posting endpoint** (verifies yield, consumption, packaging, overheads; records stock ledger movements and outbox event in one transaction).

### 4.5 Sales & Dispatches (`/api/v1/sales`)
- `POST /orders`: Create sales order (accepts `idempotency_key` for offline queue sync).
- `GET /orders`: List orders (filterable by status: `PENDING`, `APPROVED`, `INVOICED`, etc.).
- `PATCH /orders/{id}/status`: Admin review, approval, or rejection with reason.
- `POST /orders/{id}/invoice`: Generate GST invoice (applies CGST+SGST or IGST based on customer state).
- `POST /orders/{id}/dispatch`: Record dispatch, check available finished goods under lock, and deduct inventory.

### 4.6 Payments & Receivables (`/api/v1/payments`)
- `POST /payments`: Record customer payment against an invoice.
- `GET /receivables`: Customer-wise receivables and ageing buckets (0–30, 31–60, 60+ days).

### 4.7 Reports & Exports (`/api/v1/reports`)
- `GET /sales-register`: Taxable sales and GST breakdown.
- `GET /gst-summary`: GSTR-1/GSTR-3B outward tax summary.
- `GET /stock-ledger-report`: Exportable stock balance and movement report.
- `GET /production-variance-report`: Yield and material variance breakdown.
- `GET /export/{type}`: Multi-format download (CSV, Excel `.xlsx`, PDF).

---

## 5. UI Route & Component Map

| Route | Role Access | Primary Purpose & Key Features |
|---|---|---|
| `/(auth)/login` | Public | Warm cream backdrop, branded login card, role-preset quick switcher |
| `/(owner)/dashboard` | Owner, Admin | Executive overview, 4 primary KPIs, stock alerts, variance trends |
| `/(salesman)/orders/new` | Salesman | Mobile-first 45-second order flow, customer search, stepper, total preview |
| `/(salesman)/orders` | Salesman | My Orders list, submission status (synced, pending, failed) |
| `/(admin)/inbox` | Admin, Owner | Real-time order queue, stock availability check, approve/reject/invoice |
| `/(admin)/invoices/[id]` | Admin, Accountant | Print-ready GST invoice view, ReportLab PDF download button |
| `/(production)/overview` | Production, Owner | Production run feed, expected vs actual batch output, active variance alerts |
| `/(production)/runs/new` | Production | Multi-step batch execution: Planned -> Issues -> Output -> Costing -> Post |
| `/(inventory)/stock` | All authorized | Stock balances grouped by category, low-stock chips, drilldown to ledger |
| `/(reports)/` | Accountant, Owner, Admin | Interactive tables, date filters, Excel/CSV/PDF exports |

---

## 6. Nano Banana Visual Asset Generation List

### Master Prompt Style Guidelines
- **Art Direction:** Realistic cartoon illustration + South Indian folk wall-art character + premium editorial food styling.
- **Palette Tokens:** Saffron (`#E07A3D`), Turmeric (`#C45C26`), Kitchen Cream (`#FDF6E9`), Warm White (`#FFFBF5`), Brass Gold (`#C9A227`), Charcoal (`#2C2A26`), Soft Brown (`#6B4F3A`), Leaf Green (`#4A7C59`).
- **Textures:** Hand-painted brass vessels, clay pots, woven bamboo, dried red chillies, curry leaves, golden spiral murukkus.

### 10 Dedicated Visual Assets
1. `annapurna_hero_brand.png`: Traditional South Indian kitchen mural depicting brass urlis, ladles, and grain stores.
2. `product_murukku.png`: Golden spiral deep-fried Murukku resting on a fresh banana leaf.
3. `product_mixture.png`: Spicy South Indian Madras Mixture with fried peanuts, curry leaves, and boondi.
4. `product_banana_chips.png`: Crispy yellow raw-banana chips fried in coconut oil.
5. `product_sweets.png`: Mysore Pak and traditional ghee sweets stacked in brass thali.
6. `materials_flour_oil_spices.png`: Jute sacks of rice flour, glass cruet of sesame oil, and terracotta bowls of red chilli & asafoetida.
7. `production_floor_art.png`: Traditional large-scale stainless steel and brass frying vessel with wood smoke and golden ladles.
8. `empty_state_orders.png`: Calm empty brass plate with clean linen napkins.
9. `order_success_art.png`: Auspicious brass bell and traditional floral garland.
10. `decorative_brass_pot.png`: Isolated brass filter coffee davarah & urli accent element.

---

## 7. Phase-Wise Task Breakdown & Gates

- **Phase 0:** Environment audit, specification documentation, Git repository initialization. [GATE: Specifications reviewed]
- **Phase 1:** Backend foundation: FastAPI, SQLAlchemy 2.0 async, Alembic migrations, Pydantic schemas, JWT authentication, RBAC, repeatable seed script. [GATE: Clean migration & seed test pass]
- **Phase 2:** Inventory Ledger: Purchases, weighted-average rate calculation, stock ledger movements, stock balance projections. [GATE: Ledger totals reconcile with stock balances]
- **Phase 3:** Production & Costing Engine: BOM setup, production runs, material issues, actual output, physical scrap, yield/material variances, batch costing, atomic posting. [GATE: Exact benchmark production test passes]
- **Phase 4:** Sales, GST Invoicing & Dispatch: Customer orders, admin approval, stock availability lock, GST calculation (CGST+SGST / IGST), invoice generation, dispatches. [GATE: Retailer A & Distributor B benchmark tests pass]
- **Phase 5:** Payments, Receivables & Reports: Payment recording against invoices, ageing buckets, report generators, openpyxl Excel & ReportLab PDF exports. [GATE: Retailer A outstanding ₹3,875 matches, reports reconcile]
- **Phase 6:** Realtime Infrastructure: Socket.IO ASGI integration, Transactional Outbox pattern, Redis Pub/Sub, authenticated room routing. [GATE: Realtime order and production broadcasts verified]
- **Phase 7:** Premium Vintage Kitchen UI: Tailwind CSS design system, Next.js components, role-based dashboards, Nano Banana visual assets. [GATE: Zero mock data, all buttons functional]
- **Phase 8:** Mobile PWA & Offline Sales: Service worker, IndexedDB order queue, UUID idempotency keys, reconnection sync. [GATE: Offline order created and safely synced]
- **Phase 9:** Integration & Benchmark QA: Full benchmark test executed end-to-end from a clean database, Docker Compose validation, demo documentation. [GATE: 100% benchmark figures verified]

---

## 8. Risk & Dependency Register

| ID | Risk Description | Severity | Mitigation Strategy |
|---|---|:---:|---|
| **R1** | Floating-point inaccuracies in financial/stock math | Critical | Strict enforcement of `NUMERIC(14, 4)` in DB and `decimal.Decimal` in Python. Zero `float` usage in financial paths. |
| **R2** | Race conditions during simultaneous dispatches / issues | High | Database row-level locking (`SELECT ... FOR UPDATE`) or atomic transactional ledger checks. |
| **R3** | Partial production run posting leaving inconsistent stock | Critical | Single atomic database transaction wrapping all material consumptions, output, costing, and outbox event. |
| **R4** | Offline salesman submitting duplicate orders | High | Client-generated UUID `idempotency_key` stored in DB unique constraint; backend ignores duplicate keys safely. |
| **R5** | Real-time connection drop causing out-of-sync UI | Medium | Redis Pub/Sub used solely for notifications; clients always execute TanStack Query refetches from REST API on reconnect. |
