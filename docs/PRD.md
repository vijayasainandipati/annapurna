# Annapurna — Product Requirements Document (PRD)

**Product:** Annapurna — Order-to-Audit System  
**Category:** Manufacturing Operations & Audit Intelligence  
**Target Users:** Small South Indian packaged-snack manufacturers (Murukku, mixture, chips, sweets)  
**Implementation Agent:** Antigravity  
**Visual Asset Generation:** Nano Banana  
**Status:** Architecture and Product Direction Locked  

---

## 1. Mission and Problem Statement
Small South Indian snack factories operate in silos of disconnected WhatsApp order messages, physical notebooks, arbitrary spreadsheets, and unrecorded inventory adjustments.

This causes:
- Lost orders, duplicate entries, and communication breakdowns between salesmen and the factory floor.
- Inaccurate stock levels: production runs without material availability checks, stockouts, or phantom inventory.
- Hidden manufacturing losses: unmeasured oil and flour consumption variances, unaccounted packaging scrap, and inaccurate batch costing.
- Tax and audit vulnerabilities: manual GST calculations, untraceable dispatches, and disconnected payment receipts.

**Annapurna** connects the entire factory loop into one single, traceable source of truth:
$$\text{Sales Order} \rightarrow \text{Approval} \rightarrow \text{GST Invoice} \rightarrow \text{Dispatch} \rightarrow \text{Payment} \rightarrow \text{Production} \rightarrow \text{Material Consumption} \rightarrow \text{Finished Goods} \rightarrow \text{Costing} \rightarrow \text{Audit Reports}$$

---

## 2. Product Principles
1. **One Source of Truth:** Every business transaction originates, validates, and commits in the relational database.
2. **Immutable Traceability:** Stock movements are never directly updated; they are projected from immutable, audit-linked stock ledger entries.
3. **Engineering Correctness Over Visual Polish:** Production formulas, material variances, tax rounding, and financial precision take precedence.
4. **Real-time Awareness:** Critical business events (new orders, stock thresholds, production variance alerts) publish instantly across authorized client dashboards.
5. **Intuitive & Resilient UI:** Purpose-built for non-technical factory workers and mobile-first field sales reps, with offline submission capabilities.
6. **Vintage Kitchen Premium Identity:** Grounded in South Indian culinary tradition (turmeric, saffron, brass, terracotta, kitchen cream) with modern, clean ergonomics.

---

## 3. User Roles & Permission Matrix

| Capability / Action | Salesman | Factory Admin | Production Supervisor | Owner | Accountant / Auditor |
|---|:---:|:---:|:---:|:---:|:---:|
| View assigned customers & product pricing | ✅ | ✅ | ❌ | ✅ | ✅ |
| Create & queue sales orders (online/offline) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve / reject / edit incoming orders | ❌ | ✅ | ❌ | ✅ | ❌ |
| Check live stock balances & projections | Read-only | ✅ | ✅ | ✅ | ✅ |
| Generate GST Invoices & credit notes | ❌ | ✅ | ❌ | ✅ | Read-only |
| Record dispatches & warehouse shipments | ❌ | ✅ | ❌ | ✅ | ❌ |
| Record customer payments & allocations | ❌ | ✅ | ❌ | ✅ | Read-only |
| View & manage BOM / recipes | ❌ | ✅ | ✅ | ✅ | Read-only |
| Record material issues & physical output/scrap | ❌ | ❌ | ✅ | ✅ | ❌ |
| Post production runs (atomic ledger posting) | ❌ | ❌ | ✅ | ✅ | ❌ |
| View production variances & unit costing | ❌ | ✅ | ✅ | ✅ | ✅ |
| Access audit trails & compliance reports | ❌ | ✅ | ❌ | ✅ | ✅ |

---

## 4. Feature Specifications

### 4.1 Salesman Mobile PWA
- **Target Experience:** Order creation completed in under 45 seconds for recurring customers.
- **Customer Directory:** Quick search, recent customers, outstanding balance indicator.
- **Catalog & Stepper:** Visual snack cards, pack sizes (200g, 500g), unit pricing, instant total and GST preview.
- **Offline Resilience:** IndexedDB queue with client-generated UUID idempotency keys. Automatic synchronisation upon network resumption.

### 4.2 Factory Admin Order Inbox
- **Real-time Order Feed:** New orders appear via Socket.IO without manual browser refresh.
- **Stock Pre-check:** Displays requested qty, available finished goods, and projected balance.
- **Actions:** One-click Approve, Reject with recorded reason, or Edit with audit log.
- **Fulfillment Guardrail:** Hard stop if requested quantity exceeds available stock; offers backorder or partial dispatch.

### 4.3 GST Invoicing Engine
- **Tax Rules:** Intra-state (Tamil Nadu to Tamil Nadu: 2.5% CGST + 2.5% SGST = 5%); Inter-state (Tamil Nadu to Karnataka: 5% IGST). HSN: 190590.
- **Document Output:** Formatted, print-ready HTML and downloadable ReportLab PDF.
- **Lifecycle Integrity:** Posted invoices cannot be deleted; adjustments require cancellations or credit notes.

### 4.4 Inventory Management & Immutable Ledger
- **Categories:** Raw Materials (Flour, Oil, Spices), Packaging (Pouches, Cartons), Finished Goods (Packets).
- **Ledger Rule:** Every movement records item, delta (+/-), unit, valuation snapshot, document reference, and user timestamp.
- **Formula:**
  $$\text{Closing Stock} = \text{Opening Stock} + \text{Receipts} - \text{Issues} - \text{Dispatches} + \text{Returns} \pm \text{Adjustments}$$

### 4.5 Production Engine & BOM Scaling
- **Decoupled Architecture:** Reusable base recipes (Murukku mass) decoupled from packaging specifications (200g pouch vs 500g pouch).
- **Atomic Posting:** Material consumption + packaging consumption + finished goods output + cost snapshot + variance snapshot execute in a single DB transaction.
- **Tolerance Threshold:** Configurable (default $\pm 3\%$). Alerts triggered for Yield shortfall and Material excess consumption.

### 4.6 Costing & Weighted-Average Valuation
- **Inventory Valuation:** Weighted-average rate calculated upon purchase receipt:
  $$\text{W.A. Rate} = \frac{(Q_{\text{opening}} \times R_{\text{opening}}) + (Q_{\text{purchase}} \times R_{\text{purchase}})}{Q_{\text{opening}} + Q_{\text{purchase}}}$$
- **Batch Costing:**
  $$\text{Run Cost} = \sum(\text{Actual Materials} \times \text{Valuation Rate}) + \sum(\text{Packaging Consumed} \times \text{Rate}) + \text{Labour} + \text{Power/Gas} + \text{Overheads}$$
  $$\text{Cost Per Good Packet} = \frac{\text{Total Run Cost}}{\text{Actual Good Packets}}$$

### 4.7 Payments & Accounts Receivable
- Traceable payment entry linked to specific invoices. Partial payment allocation.
- Aged receivables analysis: 0–30 days, 31–60 days, 60+ days.

### 4.8 Reports & Audit Intelligence
- Sales Register, Customer Sales, Product Sales, GSTR-1/GSTR-3B Outward Summary, Purchase Register, Stock Ledger Drilldown, Production Variance Summary, Batch Costing Report.
- Multi-format exports: CSV, Excel (openpyxl), PDF (ReportLab).
