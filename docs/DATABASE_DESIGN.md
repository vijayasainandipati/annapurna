# Annapurna — Database Entity-Relationship & Schema Design

## 1. Relational Database Schema Overview

The database design adheres to 3NF normalization for masters and operational records, complemented by an immutable transactional ledger for all inventory movements.

```text
+-------------------+       +-----------------------+       +-------------------+
|     customers     |<----->|     sales_orders      |<----->| sales_order_items |
+-------------------+       +-----------------------+       +-------------------+
                                        |                             |
                                        v                             v
+-------------------+       +-----------------------+       +-------------------+
|     payments      |<----->|       invoices        |<----->|   invoice_items   |
+-------------------+       +-----------------------+       +-------------------+
                                        |                             |
                                        v                             v
                            +-----------------------+       +-------------------+
                            |      dispatches       |<----->|  dispatch_items   |
                            +-----------------------+       +-------------------+
                                        |
                                        v
                            +-----------------------+
                            |     stock_ledger      |
                            +-----------------------+
                                        ^
                                        |
+-------------------+       +-----------------------+       +-------------------+
|  production_runs  |<----->|   production_issues   |       |    boms / lines   |
+-------------------+       +-----------------------+       +-------------------+
          |
          v
+-------------------+
| production_costs  |
+-------------------+
```

---

## 2. Entity Definitions & DDL Specifications

### 2.1 Identity & Access Control
- `users`:
  - `id`: `UUID PRIMARY KEY`
  - `username`: `VARCHAR(50) UNIQUE NOT NULL`
  - `email`: `VARCHAR(255) UNIQUE NOT NULL`
  - `hashed_password`: `VARCHAR(255) NOT NULL`
  - `full_name`: `VARCHAR(100) NOT NULL`
  - `phone`: `VARCHAR(20)`
  - `role`: `VARCHAR(30) NOT NULL` (`ADMIN`, `SALESMAN`, `PRODUCTION_SUPERVISOR`, `OWNER`, `ACCOUNTANT`)
  - `is_active`: `BOOLEAN DEFAULT TRUE`
  - `created_at`: `TIMESTAMPTZ DEFAULT NOW()`

### 2.2 Master Data Entities
- `materials` (Raw and packaging materials):
  - `id`: `UUID PRIMARY KEY`
  - `code`: `VARCHAR(50) UNIQUE NOT NULL` (e.g. `MAT-FLOUR-01`, `PKG-POUCH-200`)
  - `name`: `VARCHAR(100) NOT NULL`
  - `category`: `VARCHAR(30) NOT NULL` (`RAW_MATERIAL`, `PACKAGING`)
  - `unit`: `VARCHAR(20) NOT NULL` (`kg`, `L`, `pieces`)
  - `current_valuation_rate`: `NUMERIC(14, 4) NOT NULL DEFAULT 0.0000`
  - `minimum_threshold`: `NUMERIC(14, 4) DEFAULT 10.0000`
  - `is_active`: `BOOLEAN DEFAULT TRUE`

- `products` (Product families & finished goods):
  - `id`: `UUID PRIMARY KEY`
  - `sku`: `VARCHAR(50) UNIQUE NOT NULL` (e.g. `MRK-200`)
  - `name`: `VARCHAR(100) NOT NULL` (e.g. `Murukku 200g`)
  - `pack_size_grams`: `INTEGER NOT NULL DEFAULT 200`
  - `hsn_code`: `VARCHAR(20) NOT NULL DEFAULT '190590'`
  - `gst_rate_percent`: `NUMERIC(5, 2) NOT NULL DEFAULT 5.00`
  - `base_selling_price`: `NUMERIC(14, 2) NOT NULL` (e.g. `50.00`)
  - `minimum_threshold`: `INTEGER DEFAULT 50`

- `boms` (Bill of Materials header):
  - `id`: `UUID PRIMARY KEY`
  - `product_id`: `UUID REFERENCES products(id) NOT NULL`
  - `version`: `VARCHAR(20) NOT NULL DEFAULT 'v1.0'`
  - `batch_output_units`: `NUMERIC(14, 4) NOT NULL DEFAULT 200.0000`
  - `is_active`: `BOOLEAN DEFAULT TRUE`

- `bom_lines`:
  - `id`: `UUID PRIMARY KEY`
  - `bom_id`: `UUID REFERENCES boms(id) ON DELETE CASCADE NOT NULL`
  - `material_id`: `UUID REFERENCES materials(id) NOT NULL`
  - `planned_quantity`: `NUMERIC(14, 4) NOT NULL`
  - `unit`: `VARCHAR(20) NOT NULL`

- `customers`:
  - `id`: `UUID PRIMARY KEY`
  - `business_name`: `VARCHAR(150) NOT NULL`
  - `contact_person`: `VARCHAR(100)`
  - `phone`: `VARCHAR(20) NOT NULL`
  - `state`: `VARCHAR(50) NOT NULL` (e.g. `Tamil Nadu`, `Karnataka`)
  - `gstin`: `VARCHAR(15)`
  - `credit_limit`: `NUMERIC(14, 2) DEFAULT 50000.00`
  - `created_at`: `TIMESTAMPTZ DEFAULT NOW()`

### 2.3 Sales, Invoicing & Dispatches
- `sales_orders`:
  - `id`: `UUID PRIMARY KEY`
  - `order_number`: `VARCHAR(50) UNIQUE NOT NULL`
  - `customer_id`: `UUID REFERENCES customers(id) NOT NULL`
  - `salesman_id`: `UUID REFERENCES users(id) NOT NULL`
  - `status`: `VARCHAR(30) NOT NULL` (`PENDING`, `APPROVED`, `REJECTED`, `INVOICED`, `DISPATCHED`, `CANCELLED`)
  - `idempotency_key`: `VARCHAR(100) UNIQUE`
  - `total_taxable_amount`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
  - `total_tax_amount`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
  - `total_order_amount`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
  - `notes`: `TEXT`
  - `created_at`: `TIMESTAMPTZ DEFAULT NOW()`
  - `updated_at`: `TIMESTAMPTZ DEFAULT NOW()`

- `sales_order_items`:
  - `id`: `UUID PRIMARY KEY`
  - `order_id`: `UUID REFERENCES sales_orders(id) ON DELETE CASCADE NOT NULL`
  - `product_id`: `UUID REFERENCES products(id) NOT NULL`
  - `quantity`: `INTEGER NOT NULL`
  - `unit_price`: `NUMERIC(14, 2) NOT NULL`
  - `taxable_amount`: `NUMERIC(14, 2) NOT NULL`
  - `tax_amount`: `NUMERIC(14, 2) NOT NULL`
  - `line_total`: `NUMERIC(14, 2) NOT NULL`

- `invoices`:
  - `id`: `UUID PRIMARY KEY`
  - `invoice_number`: `VARCHAR(50) UNIQUE NOT NULL` (e.g. `INV-2026-27/0001`)
  - `order_id`: `UUID REFERENCES sales_orders(id) NOT NULL`
  - `customer_id`: `UUID REFERENCES customers(id) NOT NULL`
  - `customer_state`: `VARCHAR(50) NOT NULL`
  - `taxable_amount`: `NUMERIC(14, 2) NOT NULL`
  - `cgst_amount`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
  - `sgst_amount`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
  - `igst_amount`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
  - `total_amount`: `NUMERIC(14, 2) NOT NULL`
  - `paid_amount`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
  - `status`: `VARCHAR(30) NOT NULL DEFAULT 'ISSUED'` (`ISSUED`, `PAID`, `CANCELLED`)
  - `created_at`: `TIMESTAMPTZ DEFAULT NOW()`

- `dispatches`:
  - `id`: `UUID PRIMARY KEY`
  - `dispatch_number`: `VARCHAR(50) UNIQUE NOT NULL`
  - `order_id`: `UUID REFERENCES sales_orders(id) NOT NULL`
  - `invoice_id`: `UUID REFERENCES invoices(id) NOT NULL`
  - `dispatched_by`: `UUID REFERENCES users(id) NOT NULL`
  - `dispatched_at`: `TIMESTAMPTZ DEFAULT NOW()`

### 2.4 Inventory & Stock Ledger
- `stock_ledger`:
  - `id`: `UUID PRIMARY KEY`
  - `item_type`: `VARCHAR(30) NOT NULL` (`RAW_MATERIAL`, `PACKAGING`, `FINISHED_GOOD`)
  - `material_id`: `UUID REFERENCES materials(id)`
  - `product_id`: `UUID REFERENCES products(id)`
  - `quantity_delta`: `NUMERIC(14, 4) NOT NULL`
  - `unit`: `VARCHAR(20) NOT NULL`
  - `valuation_rate`: `NUMERIC(14, 4) NOT NULL DEFAULT 0.0000`
  - `source_type`: `VARCHAR(50) NOT NULL` (`OPENING_STOCK`, `PURCHASE_RECEIPT`, `PRODUCTION_ISSUE`, `PRODUCTION_OUTPUT`, `SALES_DISPATCH`, `STOCK_ADJUSTMENT`)
  - `source_document_id`: `UUID NOT NULL`
  - `notes`: `TEXT`
  - `created_at`: `TIMESTAMPTZ DEFAULT NOW()`
  - `created_by`: `UUID REFERENCES users(id) NOT NULL`

### 2.5 Production & Costing
- `production_runs`:
  - `id`: `UUID PRIMARY KEY`
  - `batch_number`: `VARCHAR(50) UNIQUE NOT NULL`
  - `bom_id`: `UUID REFERENCES boms(id) NOT NULL`
  - `product_id`: `UUID REFERENCES products(id) NOT NULL`
  - `planned_quantity`: `NUMERIC(14, 4) NOT NULL`
  - `actual_good_output`: `INTEGER NOT NULL DEFAULT 0`
  - `yield_variance_percent`: `NUMERIC(6, 2) NOT NULL DEFAULT 0.00`
  - `damaged_pouches`: `INTEGER NOT NULL DEFAULT 0`
  - `cartons_used`: `INTEGER NOT NULL DEFAULT 0`
  - `loose_packets_exception`: `INTEGER NOT NULL DEFAULT 0`
  - `labour_cost`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
  - `gas_power_cost`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
  - `other_overhead_cost`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
  - `total_batch_cost`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
  - `cost_per_packet`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
  - `status`: `VARCHAR(30) NOT NULL DEFAULT 'DRAFT'` (`DRAFT`, `POSTED`, `CANCELLED`)
  - `posted_at`: `TIMESTAMPTZ`
  - `created_by`: `UUID REFERENCES users(id) NOT NULL`
  - `created_at`: `TIMESTAMPTZ DEFAULT NOW()`

- `production_issues`:
  - `id`: `UUID PRIMARY KEY`
  - `production_run_id`: `UUID REFERENCES production_runs(id) ON DELETE CASCADE NOT NULL`
  - `material_id`: `UUID REFERENCES materials(id) NOT NULL`
  - `planned_quantity`: `NUMERIC(14, 4) NOT NULL`
  - `actual_quantity`: `NUMERIC(14, 4) NOT NULL`
  - `variance_percent`: `NUMERIC(6, 2) NOT NULL DEFAULT 0.00`
  - `valuation_rate_snapshot`: `NUMERIC(14, 4) NOT NULL`

### 2.6 Payments & Outbox
- `payments`:
  - `id`: `UUID PRIMARY KEY`
  - `payment_number`: `VARCHAR(50) UNIQUE NOT NULL`
  - `invoice_id`: `UUID REFERENCES invoices(id) NOT NULL`
  - `customer_id`: `UUID REFERENCES customers(id) NOT NULL`
  - `amount`: `NUMERIC(14, 2) NOT NULL`
  - `payment_method`: `VARCHAR(30) NOT NULL` (`CASH`, `BANK_TRANSFER`, `UPI`, `CHEQUE`)
  - `reference_number`: `VARCHAR(100)`
  - `payment_date`: `DATE NOT NULL`
  - `recorded_by`: `UUID REFERENCES users(id) NOT NULL`
  - `created_at`: `TIMESTAMPTZ DEFAULT NOW()`

- `outbox_events`:
  - `id`: `UUID PRIMARY KEY`
  - `event_type`: `VARCHAR(100) NOT NULL`
  - `channel`: `VARCHAR(100) NOT NULL`
  - `payload`: `JSONB NOT NULL`
  - `status`: `VARCHAR(30) NOT NULL DEFAULT 'PENDING'` (`PENDING`, `PUBLISHED`, `FAILED`)
  - `created_at`: `TIMESTAMPTZ DEFAULT NOW()`
  - `published_at`: `TIMESTAMPTZ`
