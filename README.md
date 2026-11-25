# Annapurna — Order-to-Audit Manufacturing ERP

> **Internal Manufacturing Operations Platform for South Indian Packaged-Snack Factories**  
> One unified, real-time system connecting field sales, order approvals, GST invoicing, dispatch, FIFO receivables, BOM production runs, immutable inventory ledgers, and compliance reporting.

---

## Table of Contents
1. [Product Overview & Problem Solved](#1-product-overview--problem-solved)
2. [End-to-End Business Flow](#2-end-to-end-business-flow)
3. [Role-Based Workspaces](#3-role-based-workspaces)
4. [System Architecture](#4-system-architecture)
5. [Core Engineering & Accounting Guarantees](#5-core-engineering--accounting-guarantees)
6. [Backend API Surface](#6-backend-api-surface)
7. [Repository Structure](#7-repository-structure)
8. [Documentation Index](#8-documentation-index)
9. [Running Locally & With Docker](#9-running-locally--with-docker)
10. [Seeded Local Accounts & Benchmark Verification](#10-seeded-local-accounts--benchmark-verification)

---

## 1. Product Overview & Problem Solved

Small and mid-sized South Indian packaged-snack manufacturers (Murukku, Mixture, Ribbon Pakoda, Karasev, Thattai) typically coordinate factory operations across disconnected WhatsApp order chats, paper registers, and manual spreadsheets. That fragmentation creates silent operational leakage:

- **Sales vs. Factory Desync:** Lost field orders, duplicate entries, and unverified stock commitments.
- **Phantom Inventory & Cost Blindness:** In-place stock edits overwrite history, making raw-material shrinkage, frying-oil excess consumption, and packaging scrap invisible.
- **Over-Dispatching:** Shipping orders without locked finished-goods checks creates fulfillment shortfalls.
- **Tax & Audit Gaps:** Manual intra-state (`CGST + SGST`) vs. inter-state (`IGST`) calculations, unlinked partial payments, and slow GSTR-1 reconciliation.

**Annapurna** replaces those disconnected tools with a single **role-based manufacturing ERP** built around an **immutable ledger** and **PostgreSQL as the single source of truth**. Every transaction — from a salesman booking a packet order offline on a mobile browser to an accountant exporting GSTR-1 summaries — is validated, persisted with exact decimal arithmetic, and broadcast in real time to authorized plant staff.

---

## 2. End-to-End Business Flow

```text
  Field Salesman                 Factory Admin                  Production Supervisor            Accountant / Owner
  ──────────────                 ─────────────                  ─────────────────────            ──────────────────
  Book Sales Order ──► Order Approval ──► Stock Pre-Check ──► Shortage? ──► Plan & Post Batch ──► Issue Materials (BOM)
  (Online / Offline)   (Order Inbox)       (Live FG Stock)                   (Atomic DB Post)      + Track Oil/Yield Variance
                                                  │                                                        │
                                                  ▼ Sufficient FG                                          ▼
                                          Generate GST Invoice ──► Dispatch Goods ──► Record Payments ──► Audit & GSTR-1 Reports
                                          (HSN 190590 / PDF)       (Stock Lock)       (FIFO Allocation)   (Excel / CSV / Ledger)
```

Every transition posts immutable records and transactional outbox events in PostgreSQL so dashboards, order inboxes, inventory tables, and notification feeds reflect committed state immediately.

---

## 3. Role-Based Workspaces

Annapurna enforces strict RBAC in both FastAPI (`require_roles`) and the unified Next.js application shell ([`AppShell.tsx`](frontend/components/layout/AppShell.tsx)), which adapts sidebar navigation, `Ctrl+K` quick navigation, and live notifications to the signed-in employee:

| Role | Default Route | Primary Responsibilities & Screens |
|---|---|---|
| **Owner** | `/owner` | Executive overview, revenue & receivables KPIs, inventory valuation, critical variance/stock alerts, full cross-plant drilldowns |
| **Factory Admin** | `/admin` | Live order inbox, approve/reject orders, finished-goods stock pre-checks, GST invoice generation & PDF download, stock-locked dispatch, customer/supplier oversight |
| **Salesman** | `/salesman` | Mobile-first order booking, customer directory & state visibility, SKU price preview, order history, offline IndexedDB queue (`idb-keyval`) with automatic UUID idempotency sync |
| **Production Supervisor** | `/production` | Active production runs, BOM recipe scaling (`?tab=bom`), draft-to-posted batch execution, actual raw/packaging consumption, physical scrap & yield variance reporting |
| **Accountant / Auditor** | `/reports` | Sales & purchase registers, GSTR-1 outward summary (`?tab=gst`), payment collection & aged receivables (`?tab=receivables`), immutable stock-ledger reconciliation, `.xlsx` / `.csv` exports |

Warehouse & inward purchase workflows live at `/inventory` (`?tab=purchases`), accessible across `ADMIN`, `OWNER`, `PRODUCTION_SUPERVISOR`, and `ACCOUNTANT` permissions per role rules.

---

## 4. System Architecture

Annapurna is implemented as a **modular monolith** paired with a **Next.js 15 App Router frontend**, connected via REST APIs and an authenticated Socket.IO outbox pipeline.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    NEXT.JS 15 APP ROUTER FRONTEND (PWA)                 │
│  AppShell (Sidebar, Ctrl+K Search, Live Outbox Feed, Socket Status)     │
│  TanStack Query v5  •  Zustand Auth Store  •  IndexedDB Offline Queue   │
└───────────────────────────────┬───────────────────────┬─────────────────┘
                                │ /api/v1/* (Proxy)     │ /socket.io/*
                                ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   FASTAPI + PYTHON-SOCKETIO ASGI APP                    │
│                                                                         │
│  Routers (/api/v1): auth │ masters │ inventory │ production │ sales     │
│                     finance │ reports │ realtime                        │
│  Services: StockService │ ProductionService │ SalesService              │
│            InvoiceService (ReportLab) │ PaymentService │ ReportService  │
└───────────────────────────────┬───────────────────────┬─────────────────┘
                                │ SQLAlchemy 2 Async    │ OutboxPublisher
                                ▼                       ▼
┌───────────────────────────────────────┐   ┌─────────────────────────────┐
│        POSTGRESQL 16 (Truth)          │   │     REDIS / SOCKET.IO       │
│  • 3NF Masters & Operational Tables   │   │  Rooms: role:<role>,        │
│  • Append-Only `stock_ledger`         │──►│  user:<id>, channel:orders, │
│  • `outbox_events` (Same Transaction) │   │  channel:inventory,         │
│  • Exact NUMERIC(14,4) / NUMERIC(14,2)│   │  channel:production,finance │
└───────────────────────────────────────┘   └─────────────────────────────┘
```

### Technology Stack

| Layer | Technologies | Notes |
|---|---|---|
| **Frontend** | Next.js 15.1, React 19, TypeScript 5.7, Tailwind CSS 3.4 | App Router, PWA service worker (`public/sw.js`), isolated `.next-dev` vs `.next` build dirs |
| **Frontend State & Sync** | TanStack Query v5, Zustand, `idb-keyval`, `socket.io-client` | Client UUID `idempotency_key` deduplication for offline sales order sync |
| **Backend API** | Python 3.12, FastAPI, Uvicorn, Pydantic v2 | Modular routers & pure domain service layer; OpenAPI at `/api/v1/docs` |
| **ORM & Database** | SQLAlchemy 2 Async, `asyncpg`, Alembic, PostgreSQL 16 | All stock/financial columns use `NUMERIC`; no binary floats for money or quantities |
| **Auth & Security** | PyJWT (HS256), Passlib (`bcrypt`) | Role claims verified server-side on every endpoint and Socket.IO handshake |
| **Documents & Exports** | ReportLab, `openpyxl` | GST Tax Invoice PDFs + Excel/CSV audit exports |
| **Realtime & Tests** | `python-socketio`, Redis 7 (`fakeredis` fallback), `pytest` | 26 async integration & canonical benchmark tests |

---

## 5. Core Engineering & Accounting Guarantees

1. **Append-Only Stock Ledger:** Inventory balances are never overwritten directly. Current balances are derived from `stock_ledger` movements (`OPENING_STOCK`, `PURCHASE_RECEIPT`, `PRODUCTION_ISSUE`, `PRODUCTION_OUTPUT`, `SALES_DISPATCH`, `STOCK_ADJUSTMENT`) with an audit endpoint (`/api/v1/inventory/reconciliation`) verifying ledger sums against reported balances.
2. **Weighted-Average Valuation (WAR):** Every raw/packaging purchase receipt updates the item's `current_valuation_rate` using exact decimal math, while historical production runs freeze their snapshot valuation rates (`valuation_rate_snapshot`).
3. **Production Variance & Costing:** Batch posting scales planned BOM quantities, computes yield variance % and material consumption variance %, flags deviations exceeding $\pm 3.0\%$, separates physical packaging scrap (`damaged_pouches`, `cartons_used`, `loose_packets_exception`), and calculates exact per-packet cost including materials, packaging, direct labour, power/gas, and overheads.
4. **GST Tax Engine & Dispatch Guard:** Applies Indian GST for snack HSN `190590` at `5%` (`2.5% CGST + 2.5% SGST` inside Tamil Nadu; `5% IGST` for interstate customers) and blocks over-dispatch when requested units exceed locked finished-goods stock.
5. **Transactional Outbox Pattern:** Every mutation writes both business rows and an `outbox_events` record in the same PostgreSQL commit before dispatching Socket.IO room notifications (`STOCK_UPDATED`, `ORDER_CREATED`, `PRODUCTION_POSTED`, `PAYMENT_RECEIVED`).

---

## 6. Backend API Surface

All API endpoints are mounted under `/api/v1` (with `/api/v1/health` and `/api/v1/docs`):

- **`/auth`:** `POST /login`, `GET /me`
- **`/masters`:** `GET /materials`, `GET /products`, `GET /customers`, `GET /boms/{product_id}`
- **`/inventory`:** `GET /summary`, `GET /ledger`, `POST /purchases`, `POST /adjustments`, `GET /reconciliation`
- **`/production`:** `GET /runs`, `POST /runs`, `POST /runs/{run_id}/post`
- **`/sales`:** `POST /orders`, `GET /orders`, `GET /orders/{order_id}`, `GET /orders/{order_id}/stock-check`, `PATCH /orders/{order_id}/status`, `POST /orders/{order_id}/invoice`, `GET /invoices`, `GET /invoices/{invoice_id}/pdf`, `POST /orders/{order_id}/dispatch`
- **`/payments`:** `POST /`, `GET /`, `GET /receivables`
- **`/reports`:** `GET /sales-register`, `GET /gst-summary`, `GET /stock-ledger`, `GET /production-variance`, `GET /batch-costing` (`json`, `csv`, `excel` formats)
- **`/realtime`:** `POST /process-outbox`, `GET /events`, `GET /stats`

---

## 7. Repository Structure

```text
Annapurna/
├── backend/
│   ├── alembic/                 # PostgreSQL schema migrations
│   ├── app/
│   │   ├── core/                # config.py, database.py, permissions.py, security.py, realtime.py
│   │   ├── models/              # user, master, inventory, production, sales, finance, outbox
│   │   ├── modules/             # FastAPI routers per bounded domain
│   │   ├── schemas/             # Pydantic v2 request/response contracts
│   │   ├── services/            # Stock, Production, Sales, Invoice, Payment, Report services
│   │   └── main.py              # FastAPI + Socket.IO ASGI entrypoint (`asgi_app`)
│   ├── seed/
│   │   ├── seed_data.py         # Canonical clean benchmark seed (`run_seed`)
│   │   └── mock_data.py         # 45-day realistic operational dataset (`--with-mock`)
│   ├── tests/                   # 26 pytest tests covering RBAC, ledger, production, GST, realtime, E2E
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── app/                     # App Router pages: /, /login, /owner, /admin, /salesman, /production, /inventory, /reports
│   ├── components/
│   │   ├── layout/AppShell.tsx  # Role-adaptive sidebar, top bar, Ctrl+K search, live outbox notifications
│   │   └── Navbar.tsx
│   ├── lib/                     # api.ts (typed client + auth file download), offlineQueue.ts, realtime.ts
│   ├── stores/                  # Zustand authStore.ts
│   ├── public/                  # manifest.json, sw.js
│   ├── Dockerfile
│   ├── next.config.js           # Separate .next-dev/.next caches + /api/v1 & /socket.io proxy rewrites
│   └── package.json
├── docs/                        # Detailed product, architecture, database, and business-rule specifications
├── .env.example                 # Template for DB, SECRET_KEY, Redis, and NEXT_PUBLIC_DEMO_MODE
└── docker-compose.yml           # PostgreSQL 16, Redis 7, Backend, Frontend stack
```

---

## 8. Documentation Index

- **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** — Detailed technical architecture, module boundaries, API/Socket.IO contracts, outbox pipeline, and build/security setup.
- **[`docs/PRD.md`](docs/PRD.md)** — Product requirements, role permissions matrix, and operational screen specifications.
- **[`docs/DATABASE_DESIGN.md`](docs/DATABASE_DESIGN.md)** — Relational schema, ER diagram, table columns, and `NUMERIC` precision definitions.
- **[`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md)** — Accounting equations, WAR formula, production variance rules, GST rules, and receivables aging buckets.
- **[`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)** — Original phase-by-phase build log and verification roadmap.

---

## 9. Running Locally & With Docker

### Option A: Docker Compose (Recommended)

```bash
cp .env.example .env
# Edit .env with strong POSTGRES_PASSWORD and SECRET_KEY values
docker compose up --build
```

Services exposed:
- Frontend: `http://localhost:3000`
- Backend OpenAPI Docs: `http://localhost:8000/api/v1/docs`
- PostgreSQL 16: `localhost:5433`
- Redis 7: `localhost:6379`

### Option B: Local Development Setup

1. **PostgreSQL 16:** Ensure PostgreSQL is running on port `5433` with database `annapurna` (or set `DATABASE_URL` / `DB_*` env vars).
2. **Backend (`backend/`):**
   ```powershell
   cd backend
   python -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   .\.venv\Scripts\python.exe -m alembic upgrade head
   # Load canonical benchmark seed OR rich 45-day operational mock data:
   .\.venv\Scripts\python.exe -m seed.mock_data
   .\.venv\Scripts\python.exe -m uvicorn app.main:asgi_app --host 127.0.0.1 --port 8000 --reload
   ```
3. **Frontend (`frontend/`):**
   ```powershell
   cd frontend
   npm install
   npm run dev
   ```
   Open `http://localhost:3000`. Note: set `NEXT_PUBLIC_DEMO_MODE=true` in `frontend/.env.local` **only** if you want the quick role-switcher exposed during local demos; by default (`false`), login renders standard empty credential fields.
4. **Run Backend Test Suite (26 tests):**
   ```powershell
   cd backend
   .\.venv\Scripts\python.exe -m pytest -v
   ```

---

## 10. Seeded Local Accounts & Benchmark Verification

> **Security Note:** Seed passwords below are strictly for local development and automated test suites. Always set `APP_ENV=production` and a freshly generated `SECRET_KEY` (`python -c "import secrets; print(secrets.token_urlsafe(48))"`) before deploying.

| Role | Username | Local Dev Password | Employee Identity |
|---|---|---|---|
| **Owner** | `owner` | `Owner123!` | Annapurna Sundaram (Factory Owner) |
| **Admin** | `admin` | `Admin123!` | Kalyanasundaram (Factory Administrator) |
| **Salesman A** | `salesman_a` | `Salesman123!` | Senthil Kumar (Tamil Nadu Sales) |
| **Salesman B** | `salesman_b` | `Salesman123!` | Venkatesh Rao (Karnataka Sales) |
| **Supervisor** | `supervisor` | `Supervisor123!` | Muthuvel (Production Supervisor) |
| **Accountant** | `accountant` | `Accountant123!` | Ramanathan (Factory Accountant & Auditor) |

The canonical end-to-end test suite (`backend/tests/test_e2e_benchmark_canonical.py`) deterministically verifies opening inventory valuation (`₹12,600.00`), Weighted-Average Rate updates (`₹43.1250/kg`), batch costing (`₹5,855.00` / `₹31.14` per packet), `-6.00%` yield and `+5.00%` cooking-oil variance flagging, Tamil Nadu CGST/SGST vs. Karnataka IGST invoicing, `32`-packet dispatch shortage locking, FIFO partial payment allocation (`₹3,875.00` balance, `₹10,175.00` receivables), and GSTR-1 reconciliation.
