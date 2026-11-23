# Annapurna — Technical Architecture

## 1. System Overview & Technology Stack

Annapurna is structured as a **modular monolith** with transactional integrity enforced by PostgreSQL and real-time distribution handled via an asynchronous transactional outbox with Redis and Socket.IO.

```text
                 SALESMAN / ADMIN / PRODUCTION / OWNER
                                  |
                                  v
                        NEXT.JS FRONTEND
             (App Router, TypeScript, Tailwind CSS, TanStack Query)
                                  |
                         REST API / Socket.IO
                                  |
                                  v
                         FASTAPI APPLICATION
                                  |
          +-----------------------+-----------------------+
          |                       |                       |
          v                       v                       v
      SALES MODULE          INVENTORY MODULE        PRODUCTION MODULE
          |                       |                       |
          v                       v                       v
      PAYMENTS                STOCK LEDGER             COSTING
          |                       |                       |
          +-----------------------+-----------------------+
                                  |
                                  v
                       SQLALCHEMY 2.x (Async)
                                  |
                                  v
                        POSTGRESQL 16 (Source of Truth)
                                  |
                       Transactional Outbox
                                  |
                                  v
                           REDIS PUB/SUB
                                  |
                                  v
                         SOCKET.IO SERVER
                                  |
                                  v
                      AUTHORIZED CLIENT ROOMS
```

### Stack Components

| Layer | Technology | Purpose & Rationale |
|---|---|---|
| **Frontend** | Next.js 15 (App Router) + TypeScript | Modern server-rendered and client components, SEO, fast PWA routing |
| **Styling** | Tailwind CSS v4 | Rapid design token system, responsive utility styling |
| **Server State** | TanStack Query v5 | Cache invalidation, optimistic updates, background refetching |
| **Client State** | Zustand | Local UI state, offline queue orchestration |
| **Backend API** | Python 3.12 + FastAPI | High-performance async REST endpoints, automated OpenAPI docs |
| **ORM / DB Layer** | SQLAlchemy 2.x + Asyncpg | Async ORM, strict typed models, migration-ready |
| **Database** | PostgreSQL 16 | ACID transactions, row-level locking, NUMERIC monetary precision |
| **Schema Migrations** | Alembic | Version-controlled, deterministic database schema history |
| **Realtime Pub/Sub** | Redis 7 / Python-SocketIO | Scalable room-based event broadcasting, low latency |
| **Authentication** | JWT (PyJWT) + Passlib (Argon2id/Bcrypt) | Stateless bearer authentication with role claims |
| **Validation** | Pydantic v2 | Robust runtime request/response serialization & validation |
| **Reporting / Export**| ReportLab (PDF) + openpyxl (Excel) | High-fidelity server-side document rendering |

---

## 2. Critical Architectural Principles

### 2.1 Single Source of Truth
PostgreSQL is the sole authoritative state of the business. Redis and Socket.IO are broadcast mechanisms only. If a client disconnects, reconnects, or drops packets, it re-synchronises completely from the REST API.

### 2.2 Transactional Outbox Pattern
To prevent dual-write inconsistencies (e.g. database commits but Redis publishing fails, or vice versa):
1. Every business mutation and its corresponding real-time event are written to the database in the same transaction:
   ```sql
   BEGIN;
   INSERT INTO stock_ledger (...);
   INSERT INTO outbox_events (event_type, payload, status, created_at) VALUES (...);
   COMMIT;
   ```
2. A lightweight outbox dispatcher polls/listens for pending outbox events, publishes them to Redis Pub/Sub, and marks them `PUBLISHED`.
3. Socket.IO workers subscribe to Redis channels and broadcast events to specific authorized client rooms.

### 2.3 Strict Decimal & Money Policy
- No binary floating-point (`float` in Python or `FLOAT/REAL` in PostgreSQL) is permitted for quantities, rates, taxes, or currency totals.
- PostgreSQL schema enforces `NUMERIC(14, 4)` for material quantities and `NUMERIC(14, 2)` for currency amounts.
- Python business services strictly employ `decimal.Decimal` and `quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)`.

### 2.4 Concurrency & Row-Level Locking
When dispatching sales orders or issuing production materials, inventory availability is verified under row-level lock (`SELECT ... FOR UPDATE` or transactional ledger aggregation) to eliminate race conditions and negative inventory balances.

---

## 3. Realtime Room Topology & Authorization

Clients connect via Socket.IO passing their JWT bearer token in the `auth` handshake. The server verifies the token and dynamically assigns the connection to specific authorized rooms:

- `role:owner`: Broadcasts all operational, costing, variance, and financial KPIs.
- `role:admin`: Broadcasts incoming orders, stock changes, and dispatch alerts.
- `role:production`: Broadcasts batch updates, BOM adjustments, and material issues.
- `role:accountant`: Broadcasts invoice and payment reconciliation events.
- `user:{user_id}`: Dedicated private room for salesman order status confirmations.
- `stock`: Global inventory ledger delta events.
- `order:{order_id}`: Granular updates for active order inspection.

Clients can never subscribe to arbitrary rooms by name; membership is governed strictly server-side upon authentication.
