 # Annapurna — Order-to-Audit System
> **அன்னபூர்ணா • From the first order to the final audit.**  
> A premium, production-first, real-time manufacturing operations and audit intelligence web application built for small South Indian packaged-snack manufacturers (Murukku, mixture, chips, sweets).

---

## 1. Executive Summary

Annapurna connects the entire snack factory floor into a single immutable system of record:

$$\text{Sales Order} \rightarrow \text{Approval} \rightarrow \text{GST Invoice} \rightarrow \text{Dispatch} \rightarrow \text{Payment} \rightarrow \text{Production} \rightarrow \text{Material Consumption} \rightarrow \text{Finished Goods} \rightarrow \text{Costing} \rightarrow \text{Audit Reports}$$

- **One Source of Truth:** PostgreSQL is the single transactional source of truth; all stock and monetary values use exact decimal representations (`NUMERIC` / `Decimal`), completely eliminating floating-point errors.
- **Traceable Ledger:** Stock balances are dynamically projected from an append-only `stock_ledger` table; closing stocks can never be manually overwritten.
- **Real-time Pub/Sub:** Fast transactional outbox events dispatched via Python Socket.IO with role-based and user-specific rooms.
- **Authentic Brand Character:** Vintage South Indian brass, terracotta, and warm paper aesthetic with bilingual Tamil/English operational hints.
- **Field-Ready PWA:** Salesmen can book orders in under 45 seconds on mobile with IndexedDB offline queuing and UUID idempotency synchronization.

---

## 2. High-Level Architecture

```text
                  SALESMAN / ADMIN / PRODUCTION / OWNER / ACCOUNTANT
                                         │
                                         ▼
                            NEXT.JS 15 FRONTEND (PWA)
                      App Router + TypeScript + Tailwind CSS
                                         │
                                         ▼ REST API / Socket.IO
                              FASTAPI APPLICATION
                                 (Python 3.12)
                                         │
            ┌────────────────────────────┼────────────────────────────┐
            ▼                            ▼                            ▼
      SALES MODULE               PRODUCTION MODULE            INVENTORY & FINANCE
    • Idempotent Orders        • BOM Recipe Scaling         • Immutable Stock Ledger
    • Intra/Interstate GST     • Yield & Scrap Tracking     • Weighted-Average Valuation
    • Dispatch Shortage Guard  • Batch Costing Engine       • FIFO Payment Allocation
            │                            │                            │
            └────────────────────────────┼────────────────────────────┘
                                         ▼
                         POSTGRESQL 16 (Source of Truth)
                            SQLAlchemy 2.0 Async ORM
                                         │
                                         ▼ Transactional Outbox
                              REDIS PUB/SUB & SOCKET.IO
                                         │
                                         ▼
                              AUTHORIZED CLIENT ROOMS
                         (role:admin, role:owner, etc.)
```

---

## 3. Canonical Benchmark Verification Results

Annapurna has been verified against the exact locked factory benchmark:

| Step | Milestone / Metric | Specification | Annapurna Verified Value | Verification Status |
|---|---|---|---|---|
| **0** | **Opening Inventory Valuation** | 100kg Flour, 30L Oil, 5kg Spices, 500 Pouches, 30 Boxes, 50pkts Murukku | **₹12,600.00** | **100% Match** |
| **1** | **Raw Material Inward Purchase** | 60 kg Rice Flour @ ₹45.00/kg (100 kg @ ₹42 opening) | **WAR = ₹43.1250/kg, Closing: 160.00 kg** | **100% Match** |
| **2** | **Batch Production Target vs Actual** | BOM v1.0 Target: 200 pkts $\rightarrow$ Actual output: 188 pkts | **Yield Variance: -6.00% (Flagged)** | **100% Match** |
| **2** | **Packaging Scrap Accounting** | 6 damaged pouches, 9 cartons used (180 pkts) | **Scrap: 3.09%, Loose Packets: 8 pkts** | **100% Match** |
| **2** | **Material Consumption Variances** | Flour 40kg (0%), Cooking Oil 10.5L (+5%), Spices 1.2kg (0%) | **Oil +5.00% Variance Alert Flagged** | **100% Match** |
| **2** | **Total Batch Cost Breakdown** | RM: ₹3,435 + Pkg: ₹620 + Labour: ₹1,200 + Overhead: ₹600 | **Total: ₹5,855.00 (₹31.14 / packet)** | **100% Match** |
| **2** | **Closing Finished Goods Stock** | 50 opening + 188 output | **238.00 packets** | **100% Match** |
| **3** | **Retailer A Order (Tamil Nadu)** | 150 pkts @ ₹50.00 base = ₹7,500.00 | **Intrastate: 2.5% CGST (₹187.50) + 2.5% SGST (₹187.50)** | **100% Match** |
| **3** | **Retailer A GST Invoice Total** | ₹7,500 + ₹187.50 + ₹187.50 | **₹7,875.00 (ReportLab PDF Generated)** | **100% Match** |
| **4** | **Retailer A Dispatch** | 150 packets deducted from 238 packets | **Remaining Stock: exactly 88 packets** | **100% Match** |
| **5** | **Distributor B Order (Karnataka)** | 120 pkts @ ₹50.00 base = ₹6,000.00 | **Interstate: 5% IGST (₹300.00) = ₹6,300.00** | **100% Match** |
| **5** | **Dispatch Shortage Guard** | 120 pkts requested vs 88 pkts available | **Shortage: 32 pkts $\rightarrow$ Over-dispatch Blocked (400)** | **100% Match** |
| **6** | **Retailer A Partial Payment** | ₹4,000.00 paid via NEFT (Ref: NEFT-TN-98124) | **Invoice & Customer Balance: exactly ₹3,875.00** | **100% Match** |
| **6** | **Aged Receivables (0-30 Days)** | Retailer A (₹3,875.00) + Distributor B (₹6,300.00) | **Total Active Receivables: ₹10,175.00** | **100% Match** |
| **7** | **GSTR-1 Outward Summary** | B2B Intrastate: ₹7,500.00; B2B Interstate: ₹6,000.00 | **Total Taxable: ₹13,500.00; Total Tax: ₹675.00** | **100% Match** |
| **7** | **Sales Register & Excel Export** | 2 Invoices, ₹14,175.00 sales, ₹4,000.00 collected | **Excel (.xlsx) & CSV Generated via openpyxl** | **100% Match** |
| **8** | **Realtime Transactional Outbox** | Stock, Order, Production & Payment Events | **Published via Socket.IO Role & User Rooms** | **100% Match** |

---

## 4. Test Suite Summary

The backend contains **26 automated tests** covering all operational modules:

```bash
backend/tests/
├── test_auth_rbac.py                   # 12 tests: JWT authentication, password verification, 5 factory roles
├── test_inventory_ledger.py             # 4 tests: Opening balances, purchase receipts, WAR valuation, reconciliation
├── test_production_engine.py           # 3 tests: Batch runs, scrap accounting, variance flags, atomic rollback
├── test_sales_gst_dispatch.py          # 2 tests: Intra/interstate GST, ReportLab PDF, shortage locks, idempotency
├── test_payments_reports.py            # 1 test: Payment allocation, aged receivables (0-90+ days), openpyxl Excel
├── test_realtime.py                    # 3 tests: Socket.IO handshake, room routing, transactional outbox publishing
└── test_e2e_benchmark_canonical.py     # 1 test: End-to-end multi-step benchmark validation from clean seed
```

**Run all tests:**
```powershell
Set-Location 'backend'
& .\.venv\Scripts\python.exe -m pytest -v
```

---

## 5. Seed Credentials (Local Dev & Test Benchmark Only)

> **Security Note:** Never reuse seeded development passwords or local defaults in any production deployment. Set a unique `SECRET_KEY` and `POSTGRES_PASSWORD` via `.env` (see `.env.example`), and set `APP_ENV=production`. Demo account switching in the UI is hidden by default unless `NEXT_PUBLIC_DEMO_MODE=true` is explicitly set.

| Role | Username | Seed Password | Full Name & Title |
|---|---|---|---|
| **Admin** | `admin` | `Admin123!` | Kalyanasundaram (Factory Administrator) |
| **Owner** | `owner` | `Owner123!` | Annapurna Sundaram (Factory Owner) |
| **Salesman A** | `salesman_a` | `Salesman123!` | Senthil Kumar (Tamil Nadu Sales) |
| **Salesman B** | `salesman_b` | `Salesman123!` | Venkatesh Rao (Karnataka Sales) |
| **Supervisor** | `supervisor` | `Supervisor123!` | Muthuvel (Production Supervisor) |
| **Accountant** | `accountant` | `Accountant123!` | Ramanathan (Factory Accountant & Auditor) |

---

## 6. How to Run Locally

### Prerequisites
- Python 3.12
- Node.js 20+
- PostgreSQL 16
- Redis (optional, in-memory outbox fallback supported)

### Step 1: Start PostgreSQL
```powershell
& "C:\Program Files\PostgreSQL\16\bin\postgres.exe" -D "c:\Users\Vijayasai\Desktop\Annapurna\.pgdata"
```

### Step 2: Seed Database (Optional) & Run Backend Server
- **Rich Operational Mock Dataset (45-day history across 5 snack SKUs, 8 customers, 8 batches, 11 orders, invoices, & payments):**
```powershell
Set-Location 'c:\Users\Vijayasai\Desktop\Annapurna\backend'
$env:PYTHONPATH="."; & .\.venv\Scripts\python.exe -m seed.mock_data
```
- **Clean Canonical Benchmark State (for isolated benchmark testing):**
```powershell
Set-Location 'c:\Users\Vijayasai\Desktop\Annapurna\backend'
$env:PYTHONPATH="."; & .\.venv\Scripts\python.exe -m seed.seed_data
```
- **Start FastAPI Server:**
```powershell
Set-Location 'c:\Users\Vijayasai\Desktop\Annapurna\backend'
& .\.venv\Scripts\python.exe -m uvicorn app.main:asgi_app --host 127.0.0.1 --port 8000 --reload
```
- Interactive OpenAPI Docs: [http://127.0.0.1:8000/api/v1/docs](http://127.0.0.1:8000/api/v1/docs)

### Step 3: Run Frontend Development Server
```powershell
Set-Location 'c:\Users\Vijayasai\Desktop\Annapurna\frontend'
npm run dev
```
- Open in browser: [http://localhost:3000](http://localhost:3000)

---

## 7. How to Run with Docker Compose

```bash
cp .env.example .env
# Edit .env to set strong POSTGRES_PASSWORD and SECRET_KEY values
docker compose up --build
```
This spins up:
- `annapurna-postgres` on port 5433
- `annapurna-redis` on port 6379
- `annapurna-backend` on port 8000
- `annapurna-frontend` on port 3000

---

## 8. Git Commit Log

```text
4eb6e6d test(benchmark): add comprehensive end-to-end canonical benchmark test suite with 100% mathematical validation
1268893 feat(frontend-pwa): complete Phase 7 & 8 Next.js 15 App Router frontend, role-specific operational screens, and offline PWA sync queue
863fd0a feat(realtime): complete Phase 6 Socket.IO server, JWT authentication handshake, room routing, and transactional outbox dispatcher
3323080 feat(finance-reports): complete Phase 5 payment allocation, aged receivables, and audit report generation with openpyxl
09a3b7a feat(sales): complete Phase 4 sales orders, GST calculations, ReportLab PDF invoices, and stock dispatches
ba7fc1d feat(production): complete Phase 3 BOM recipe scaling, material issues, variance alerts, batch costing, and atomic ledger posting
50b2839 feat(inventory): complete Phase 2 immutable stock ledger, weighted-average rate valuation, purchase receipts, and audit reconciliation
3af8c54 feat(backend): complete Phase 1 backend foundation, database schema, alembic migrations, jwt auth, rbac, and repeatable seed data
110f331 docs: complete Phase 0 repository audit, architecture, prd, business rules, and implementation plan
```
