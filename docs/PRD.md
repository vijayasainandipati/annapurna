# Annapurna — Product Requirements & Operational Specification

**Product:** Annapurna — Order-to-Audit Manufacturing ERP  
**Category:** Internal Manufacturing Operations & Financial Audit Platform  
**Target Users:** South Indian packaged-snack manufacturers (Murukku, Mixture, Ribbon Pakoda, Karasev, Thattai)  
**Plant Context:** Plant 01 — Madurai (Tamil Nadu)

---

## 1. Problem Statement & Product Identity

Small packaged-snack factories routinely suffer operational losses because sales orders arrive over phone/WhatsApp messages, production material issues are estimated informally, finished-goods stock is tracked in spreadsheets, and accounting relies on end-of-month manual GST reconciliation.

Annapurna is an **internal daily operations application**—not a public marketing portal—that connects every step of the factory loop inside one audited transactional database:

```text
Sales Order ─► Admin Approval ─► GST Invoice ─► Stock-Locked Dispatch ─► Payment Allocation
                                                                                  │
Audit Reports ◄─ Batch Costing ◄─ FG Output & Scrap ◄─ Production Issue ◄─────────┘
```

---

## 2. Core Product Principles

1. **Single Source of Truth:** PostgreSQL owns all business records (`sales_orders`, `invoices`, `dispatches`, `payments`, `production_runs`, `stock_ledger`, `outbox_events`).
2. **Immutable Traceability:** Stock levels are never edited directly; closing inventory is projected strictly from append-only `stock_ledger` transactions.
3. **Exact Decimal Arithmetic:** Inventory quantities (`NUMERIC(14,4)`) and monetary/GST figures (`NUMERIC(14,2)`) use exact `Decimal` calculations throughout.
4. **Role-Tailored Density:** Each employee sees operational tables, filters, detail views, and actions scoped to their plant responsibilities—without showcase cards or marketing clutter.
5. **Offline-Resilient Field Sales:** Salesmen can capture orders offline in IndexedDB with automatic UUID idempotency replay when back online.
6. **Production-Safe Configuration:** Demo account switching and prefilled dev credentials remain disabled by default unless `NEXT_PUBLIC_DEMO_MODE=true` is explicitly enabled.

---

## 3. User Roles & Permissions Matrix

| Capability | `SALESMAN` | `ADMIN` | `PRODUCTION_SUPERVISOR` | `OWNER` | `ACCOUNTANT` |
|---|:---:|:---:|:---:|:---:|:---:|
| View materials, products, BOMs, customers | Read | Read | Read | Read | Read |
| Create sales orders (online & offline queue) | Yes | Yes | No | Yes | No |
| View orders (`/api/v1/sales/orders`) | Own Orders | All | Read (API) | All | All |
| Approve / reject orders & run stock pre-check | Pre-check | Yes | Pre-check | Yes | Pre-check |
| Generate GST invoices & dispatch shipments | No | Yes | No | Yes | No |
| List GST invoices (`/api/v1/sales/invoices`) | No | Yes | No | Yes | Yes |
| Download GST Invoice PDF (`/invoices/{id}/pdf`) | Yes | Yes | Yes | Yes | Yes |
| Record inward purchases & stock adjustments | No | Yes | No | Yes | No |
| View stock summary & stock ledger | Read | Read | Read | Read | Read |
| Run stock-ledger audit reconciliation | No | Yes | No | Yes | Yes |
| Create & post BOM production runs | No | Yes | Yes | Yes | No |
| Record customer payments (`POST /payments`) | No | Yes | No | Yes | Yes |
| View payment history & aged receivables | Yes | Yes | No | Yes | Yes |
| Access sales, GST, stock, variance & costing reports | No | Yes | Stock / Variance | Yes | Sales / GST / Stock / Costing |

---

## 4. Operational Modules & Implemented Screens

### 4.1 Authenticated Enterprise Shell (`AppShell.tsx`)
- **Top Bar:** Plant identity (`ANNAPURNA • PLANT 01 • MADURAI`), global `Ctrl+K` quick-search modal, live Socket.IO status indicator, Outbox notification drawer, employee role badge, optional dev-only role switcher (`NEXT_PUBLIC_DEMO_MODE=true`), and logout.
- **Left Sidebar:** Dynamically filtered by role across Operations, Manufacturing, Supply Chain & Warehouse, and Finance & Compliance.

### 4.2 Executive Overview (`/owner`)
- Live KPIs: inventory valuation, open receivables, pending orders, active production runs, and critical variance/low-stock alerts.
- Cross-module operational summary tables and fast navigation to approvals, production runs, and audit exports.

### 4.3 Factory Admin Order Inbox & Fulfillment (`/admin`)
- Incoming order queue with status filters (`PENDING`, `APPROVED`, `INVOICED`, `DISPATCHED`, `REJECTED`).
- Live finished-goods stock pre-check (`/orders/{id}/stock-check`) showing per-SKU availability and shortages before dispatch.
- One-click Approve/Reject actions (with mandatory reason on rejection), GST Invoice creation, authenticated PDF download, and locked dispatch posting.

### 4.4 Salesman Order Desk (`/salesman`)
- Fast customer and SKU selection with GST-inclusive order preview.
- Online detection + offline IndexedDB queue (`idb-keyval`) storing pending submissions with client-generated `idempotency_key` UUIDs and one-click/automatic sync.
- Live order status tracking for submitted orders.

### 4.5 Production & BOM Execution (`/production`)
- Active batch runs table + BOM recipe inspector (`?tab=bom`) scaling raw and packaging material requirements by planned packet count.
- Draft creation and atomic batch posting: records actual material quantities consumed, `actual_good_output`, `damaged_pouches`, `cartons_used`, `loose_packets_exception`, direct labour, power/gas, and overhead costs.
- Automatic yield variance % and material consumption variance % calculation, flagging breaches beyond $\pm 3.0\%$ and computing exact `cost_per_packet`.

### 4.6 Warehouse, Stock Ledger & Purchases (`/inventory`)
- Grouped live balances across `RAW_MATERIAL`, `PACKAGING`, and `FINISHED_GOOD` with minimum-threshold alerts.
- Immutable stock ledger movement log with source document drilldowns.
- Inward Purchase Receipt entry (`?tab=purchases`) updating Weighted-Average Rate (`WAR`) and posting `PURCHASE_RECEIPT` ledger entries, plus authorized stock adjustments and full ledger-to-balance audit reconciliation.

### 4.7 Finance, GST & Audit Reports (`/reports`)
- **Payments & Receivables (`?tab=receivables`):** Record customer payments (`CASH`, `BANK_TRANSFER`, `UPI`, `CHEQUE`) linked to invoices and review customer ageing buckets (`0–30`, `31–60`, `61–90`, `90+` days).
- **GST & Sales Register (`?tab=gst`):** Intra-state (`2.5% CGST + 2.5% SGST`) vs. inter-state (`5% IGST`) summaries for HSN `190590`, production variance summaries, batch costing breakdown, and authenticated `.csv` / `.xlsx` downloads.

---

## 5. Visual & UX Design Tokens

Defined in [`frontend/tailwind.config.js`](../frontend/tailwind.config.js) and [`frontend/app/globals.css`](../frontend/app/globals.css):

- **Surface & Background:** Warm White (`#FFFBF5`), Kitchen Cream (`#FDF6E9`), Border (`#EADBCE`)
- **Primary Accents:** Deep Turmeric / Terracotta (`#C45C26`), Saffron (`#E07A3D`)
- **Ink & Status:** Charcoal (`#2C2A26`), Muted Ink (`#6B665E`), Leaf Green (`#4E8A3E` / `#2E7D32`), Alert Red (`#C62828`)
- **Typography:** Restrained serif headings (`Georgia, Cambria`) paired with crisp sans-serif UI copy and monospace alignment for currency, quantities, batch numbers, and invoice IDs.
