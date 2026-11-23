# Annapurna — Core Business Rules & Formulas

## 1. Inventory & Stock Ledger

### 1.1 The Stock Ledger Equation
Stock levels are never mutated directly in-place. All current stock is a derived projection or transactional accumulation of immutable ledger transactions:

$$\text{Closing Stock} = \text{Opening Stock} + \text{Purchases} - \text{Production Issues} + \text{Production Outputs} - \text{Dispatches} + \text{Returns} \pm \text{Adjustments}$$

### 1.2 Ledger Movement Record Requirements
Every row in `stock_ledger` must contain:
1. `id` (UUID primary key)
2. `item_type` (`RAW_MATERIAL`, `PACKAGING`, `FINISHED_GOOD`)
3. `item_id` (foreign key to corresponding entity)
4. `quantity_delta` (positive for inflows, negative for outflows)
5. `unit` (`kg`, `L`, `pieces`, `packets`, `cartons`)
6. `valuation_rate` (snapshot of cost rate at the moment of movement)
7. `source_type` (`PURCHASE_RECEIPT`, `PRODUCTION_ISSUE`, `PRODUCTION_OUTPUT`, `SALES_DISPATCH`, `STOCK_ADJUSTMENT`)
8. `source_document_id` (UUID link to invoice, purchase, or production run)
9. `created_at` (UTC timestamp)
10. `created_by` (UUID of authenticated user)

---

## 2. Valuation & Costing

### 2.1 Weighted-Average Rate (WAR)
When new materials are received, the weighted-average rate is recalculated:

$$\text{W.A. Rate}_{\text{new}} = \frac{(Q_{\text{current}} \times R_{\text{current}}) + (Q_{\text{received}} \times R_{\text{purchase}})}{Q_{\text{current}} + Q_{\text{received}}}$$

- Historical production runs must freeze their snapshot valuation rates. Subsequent purchases at higher or lower rates never alter historical batch costs.

### 2.2 Production Run Cost Breakdown
$$\text{Total Production Cost} = \text{Material Cost} + \text{Packaging Cost} + \text{Direct Labour} + \text{Power/Gas} + \text{Other Overheads}$$

Where:
- $\text{Material Cost} = \sum_{m} (\text{Actual Material Quantity}_m \times \text{Valuation Rate}_m)$
- $\text{Packaging Cost} = (\text{Total Pouches Consumed} \times \text{Pouch Rate}) + (\text{Cartons Consumed} \times \text{Carton Rate})$
- $\text{Cost Per Good Packet} = \frac{\text{Total Production Cost}}{\text{Actual Good Packets Output}}$

---

## 3. Production Variances & Tolerances

### 3.1 Yield Variance Formula
$$\text{Yield Variance \%} = \left( \frac{\text{Actual Good Output} - \text{Planned Output}}{\text{Planned Output}} \right) \times 100$$

### 3.2 Material Consumption Variance Formula
$$\text{Material Variance \%} = \left( \frac{\text{Actual Consumption} - \text{Planned Consumption}}{\text{Planned Consumption}} \right) \times 100$$

### 3.3 Tolerance Thresholds & Alerting Rules
- **Default Tolerance:** Absolute variance greater than $3.0\%$ ($|\text{Variance}| > 3.0\%$) triggers a critical variance alert.
- **Physical Scrap Distinction:**
  - Yield shortfall is not automatically physical scrap. For instance, planned 200 packets vs actual 188 packets gives a $-6.0\%$ yield shortfall.
  - Known physical damage (e.g. 6 burst pouches) is recorded explicitly as packaging scrap.
  - The remaining 12-packet gap represents process shrinkage/evaporation/dough-weight differences, not confirmed salvageable scrap.

---

## 4. Taxation & Invoicing Rules

### 4.1 Goods and Services Tax (GST) Logic
All manufactured snack goods fall under HSN code `190590` at a total tax rate of $5.0\%$.

- **Intra-State Supply (Factory in TN $\rightarrow$ Customer in TN):**
  - $\text{Taxable Value} = \text{Quantity} \times \text{Unit Price}$
  - $\text{CGST} = \text{Taxable Value} \times 2.5\%$
  - $\text{SGST} = \text{Taxable Value} \times 2.5\%$
  - $\text{Invoice Total} = \text{Taxable Value} + \text{CGST} + \text{SGST}$
- **Inter-State Supply (Factory in TN $\rightarrow$ Customer outside TN, e.g. KA):**
  - $\text{Taxable Value} = \text{Quantity} \times \text{Unit Price}$
  - $\text{IGST} = \text{Taxable Value} \times 5.0\%$
  - $\text{Invoice Total} = \text{Taxable Value} + \text{IGST}$

### 4.2 Stock Dispatch Policy & Guardrails
- An order can only be dispatched if $\text{Available Finished Goods} \ge \text{Order Quantity}$.
- Over-dispatching or phantom dispatching is strictly forbidden at the database transaction layer.
- If inventory is insufficient, the system provides:
  1. Partial dispatch (dispatches available packets with customer approval, generating an invoice for the fulfilled portion).
  2. Backorder (holds remainder in queued status until a new production run completes).

---

## 5. Payments & Accounts Receivable

### 5.1 Payment Allocation
- Payments are credited against specific outstanding invoices using FIFO or manual selection.
- Invoice payment statuses:
  - `UNPAID`: $\text{Paid Amount} = 0$
  - `PARTIALLY_PAID`: $0 < \text{Paid Amount} < \text{Invoice Total}$
  - `PAID`: $\text{Paid Amount} = \text{Invoice Total}$

### 5.2 Ageing Buckets
Invoices are bucketed relative to `due_date` or `invoice_date`:
1. `Current / 0–30 Days`
2. `31–60 Days`
3. `60+ Days (Overdue Alert)`
