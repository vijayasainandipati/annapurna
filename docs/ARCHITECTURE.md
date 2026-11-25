# Annapurna — System & Technical Architecture

## 1. Architectural Style & System Overview

Annapurna is built as a **modular monolith backend** paired with a **role-adaptive Next.js 15 App Router frontend**. Business state and audit history live strictly inside **PostgreSQL 16**, while real-time notifications are propagated reliably using a **transactional outbox** backed by **Python Socket.IO** (with Redis Pub/Sub ready in containerized deployments).

```text
                ┌──────────────────────────────────────────────────┐
                │            Next.js 15 Frontend (PWA)             │
                │  • AppShell (Sidebar, Top Bar, Ctrl+K, Alerts)   │
                │  • Role Pages: /owner /admin /salesman           │
                │    /production /inventory /reports /login        │
                │  • TanStack Query v5 + Zustand + idb-keyval      │
                └───────────────┬──────────────────────┬───────────┘
                                │ REST (/api/v1/*)     │ WebSocket/Polling
                                │ via next.config.js   │ (/socket.io/*)
                                ▼                      ▼
                ┌──────────────────────────────────────────────────┐
                │        FastAPI + python-socketio ASGI App        │
                │               (app.main:asgi_app)                │
                │                                                  │
                │  Modules (/api/v1):                              │
                │  auth │ masters │ inventory │ production         │
                │  sales │ finance │ reports │ realtime            │
                │                                                  │
                │  Domain Services:                                │
                │  StockService │ ProductionService │ SalesService │
                │  InvoiceService │ PaymentService │ ReportService │
                └───────────────┬──────────────────────┬───────────┘
                                │ SQLAlchemy 2 Async   │ OutboxPublisher
                                ▼                      ▼
                ┌──────────────────────────┐  ┌────────────────────┐
                │     PostgreSQL 16        │  │ Socket.IO Server   │
                │  • 3NF Masters & Orders  │  │ (& Redis Pub/Sub)  │
                │  • stock_ledger          ├─►│ Rooms:             │
                │  • outbox_events         │  │ role:*, user:*,    │
                │  • NUMERIC Precision     │  │ channel:*          │
                └──────────────────────────┘  └────────────────────┘
```

### Technology Stack

| Layer | Technology | Role in System |
|---|---|---|
| **Frontend Framework** | Next.js 15.1.7 (App Router), React 19, TypeScript 5.7 | Multi-role ERP workspace with client-side SPA transitions and proxy rewrites |
| **Styling & Design System** | Tailwind CSS 3.4.17 | Warm manufacturing palette (`#FFFBF5`, `#FDF6E9`, `#C45C26`, `#E07A3D`, `#2C2A26`, `#4E8A3E`) and monospace numeric alignment |
| **Client & Server State** | TanStack Query v5, Zustand v5 | API caching/refetching, persistent session state (`authStore.ts`), live realtime socket state |
| **Offline PWA Support** | `idb-keyval`, `public/sw.js`, `public/manifest.json` | IndexedDB offline sales order queueing with client-generated UUID `idempotency_key` sync |
| **API Runtime** | Python 3.12, FastAPI (`>=0.115.0`), Uvicorn, Pydantic v2 | Typed async HTTP endpoints, OpenAPI docs at `/api/v1/docs`, CORS middleware |
| **Data Access & Migrations** | SQLAlchemy 2 Async, `asyncpg`, `psycopg2-binary`, Alembic | Async transactional execution with versioned PostgreSQL schema (`backend/alembic/`) |
| **Database** | PostgreSQL 16 | ACID transactions, row-level stock locking, exact `NUMERIC` precision |
| **Authentication & RBAC** | PyJWT (HS256), Passlib (`bcrypt`) | Stateless Bearer JWTs with role claims enforced via FastAPI dependencies (`require_roles`) |
| **Reporting & Exports** | ReportLab (`>=4.2.5`), `openpyxl` (`>=3.1.5`) | Server-side GST Tax Invoice PDF generation and `.xlsx` / `.csv` audit exports |
| **Realtime & Tests** | `python-socketio`, Redis 7 (`fakeredis` fallback), `pytest` | Authenticated Socket.IO rooms + outbox dispatcher; 26 automated tests |

---

## 2. Backend Modular Architecture (`backend/app/`)

Each bounded domain separates HTTP routing (`modules/<domain>/router.py`), validation contracts (`schemas/`), business rules (`services/`), and persistence models (`models/`):

| Domain | Router Prefix | Core Models | Core Service & Responsibility |
|---|---|---|---|
| **Auth** | `/api/v1/auth` | `User`, `RoleEnum` | Credential verification, HS256 token issuance (`POST /login`), current profile (`GET /me`) |
| **Masters** | `/api/v1/masters` | `Material`, `Product`, `BOM`, `BOMLine`, `Customer` | Materials (RM/PKG), snack SKUs (HSN/GST/selling price), active BOM recipes, customer GSTIN/state |
| **Inventory** | `/api/v1/inventory` | `StockLedger`, `ItemTypeEnum`, `StockMovementSourceEnum` | Live stock summary, ledger drilldown, inward purchases with WAR recalculation, adjustments, reconciliation |
| **Production** | `/api/v1/production` | `ProductionRun`, `ProductionIssue` | Draft batch initialization, atomic batch posting (material/packaging issues, FG output, $\pm 3\%$ variance alerts, unit costing) |
| **Sales** | `/api/v1/sales` | `SalesOrder`, `SalesOrderItem`, `Invoice`, `Dispatch` | Idempotent orders, stock pre-check, approval/rejection, GST calculation & ReportLab PDFs, locked dispatches |
| **Finance** | `/api/v1/payments` | `Payment`, `PaymentMethodEnum` | Invoice payment allocation, status updates (`ISSUED` / `PAID`), aged receivables (`0–30`, `31–60`, `61–90`, `90+` days) |
| **Reports** | `/api/v1/reports` | Queries across `SalesOrder`, `Invoice`, `StockLedger`, `ProductionRun` | Sales Register (`json`/`csv`/`excel`), GSTR-1 Summary, Stock Ledger, Production Variance, Batch Costing |
| **Realtime** | `/api/v1/realtime` | `OutboxEvent`, `OutboxStatusEnum` | Pending event dispatch (`POST /process-outbox`), event feed (`GET /events`), active sockets (`GET /stats`) |

---

## 3. Core Architectural Principles

### 3.1 Single Source of Truth
PostgreSQL is the sole authoritative store of operational state. Socket.IO and Redis act strictly as notification delivery channels. Clients treat real-time events as triggers to update notifications and invalidate TanStack Query caches via the REST API.

### 3.2 Transactional Outbox Pattern (`OutboxPublisher`)
To prevent dual-write drift between PostgreSQL commits and Socket.IO broadcasts:
1. Domain services insert an `OutboxEvent` row (`PENDING`) inside the exact same PostgreSQL transaction as the business mutation (`StockLedger`, `SalesOrder`, `ProductionRun`, `Payment`).
2. `OutboxPublisher.process_pending_events` queries `PENDING` events in chronological order, emits them to target Socket.IO rooms (`STOCK_UPDATED`, `ORDER_CREATED`, `PRODUCTION_POSTED`, `PAYMENT_RECEIVED`), and marks rows `PUBLISHED` with `published_at`.

### 3.3 Strict Decimal & Monetary Precision
- Binary floating-point (`float`) is excluded from stock and financial arithmetic.
- Quantities use `NUMERIC(14, 4)` and currency values use `NUMERIC(14, 2)` in PostgreSQL, computed in Python via `decimal.Decimal`.

### 3.4 Concurrency Guards & Idempotency
- **Dispatch Stock Protection:** Dispatches validate available finished goods under transactional locks and return `400` if requested quantity exceeds stock on hand.
- **Offline Sync Idempotency:** Sales orders accept a client-generated `idempotency_key` (`UNIQUE` on `sales_orders`), safely deduplicating retries from the browser's IndexedDB queue.

---

## 4. Realtime Room Topology & Authorization

Socket.IO clients connect with a JWT (`auth: { token }` or query param) verified inside [`app/core/realtime.py`](../backend/app/core/realtime.py). Unauthenticated or inactive users are rejected with `ConnectionRefusedError`. The server assigns rooms strictly from the verified database user record:

- **Role rooms:** `role:owner`, `role:admin`, `role:salesman`, `role:production_supervisor`, `role:accountant`
- **Private user room:** `user:{user_id}`
- **Channel rooms by role:**
  - `ADMIN`, `OWNER`: `channel:orders`, `channel:inventory`, `channel:production`, `channel:finance`
  - `SALESMAN`: `channel:orders`, `channel:inventory`
  - `PRODUCTION_SUPERVISOR`: `channel:production`, `channel:inventory`
  - `ACCOUNTANT`: `channel:orders`, `channel:finance`
- **Global room:** `broadcast`

---

## 5. Frontend Application Architecture (`frontend/`)

- **Proxy Routing (`next.config.js`):** Rewrites `/api/v1/:path*` and `/socket.io/:path*` to `http://127.0.0.1:8000/...` so client requests avoid cross-origin friction in local dev, while isolating development compilation into `.next-dev` (separate from production builds in `.next`).
- **Authenticated Enterprise Shell (`components/layout/AppShell.tsx`):**
  - Renders bare on `/login`; enforces authenticated workspace layout elsewhere.
  - Adapts left sidebar navigation dynamically by user role (`Executive Overview`, `Admin Order Inbox`, `Sales Order Entry`, `Production Runs`, `Recipes & BOM`, `Warehouse & Stock`, `Inward Purchases`, `Payments & Receivables`, `GST & Sales Register`).
  - Provides `Ctrl+K` quick jump across modules, an honest Socket.IO connection indicator, and an `OutboxEvent`-backed notification bell.
  - Exposes a quick role-switcher drawer **only** when `NEXT_PUBLIC_DEMO_MODE === 'true'`.
- **Authenticated Binary Downloads (`lib/api.ts`):** PDF invoices and `.xlsx` / `.csv` reports are fetched via `downloadAuthenticatedFile` with `Authorization: Bearer <token>` headers rather than unauthenticated browser redirects.
- **Offline Queue (`lib/offlineQueue.ts`):** Stores failed/offline salesman orders in IndexedDB under `annapurna_offline_orders` and replays them cleanly once connectivity resumes.

---

## 6. Security & Environment Configuration

Configured via [`backend/app/core/config.py`](../backend/app/core/config.py) and `.env` (template in [`.env.example`](../.env.example)):

- **No Hardcoded Production Secrets:** When `SECRET_KEY` is omitted in non-production environments (`APP_ENV != "production"`), `Settings` generates a random ephemeral `secrets.token_urlsafe(32)` key per process. When `APP_ENV=production`, `Settings` fails startup unless `SECRET_KEY` is explicitly provided.
- **Database Parameterization:** `docker-compose.yml` requires `POSTGRES_PASSWORD` and `SECRET_KEY` from `.env`, keeping `.env*` ignored by Git.
- **Demo Mode Gating:** Login defaults to blank username/password inputs (`NEXT_PUBLIC_DEMO_MODE=false`) so production builds never expose demo credentials.
