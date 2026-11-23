# Annapurna — Order-to-Audit System

> **From the first order to the final audit.**  
> A premium, production-first, real-time manufacturing operations and audit intelligence web application built for small South Indian packaged-snack manufacturers (Murukku, mixture, chips, sweets).

---

## 1. About the Product

Annapurna replaces fragmented WhatsApp orders, physical notebooks, arbitrary spreadsheets, and unrecorded stock adjustments with an immutable, single source of truth:

$$\text{Sales Order} \rightarrow \text{Approval} \rightarrow \text{GST Invoice} \rightarrow \text{Dispatch} \rightarrow \text{Payment} \rightarrow \text{Production} \rightarrow \text{Material Consumption} \rightarrow \text{Finished Goods} \rightarrow \text{Costing} \rightarrow \text{Audit Reports}$$

---

## 2. Locked Technology Stack

- **Frontend:** Next.js 15 (App Router) + TypeScript
- **Styling:** Tailwind CSS (Vintage Kitchen Premium Design System)
- **State Management:** TanStack Query (server state), Zustand (client offline queue)
- **Backend API:** Python 3.12 + FastAPI (Async REST)
- **ORM & Migrations:** SQLAlchemy 2.0 (Async) + Alembic
- **Database:** PostgreSQL 16 (`NUMERIC` precision for all money and quantities)
- **Realtime Pub/Sub:** Python-SocketIO (ASGI) + Redis Pub/Sub + Transactional Outbox
- **Authentication:** JWT Bearer Authentication + Argon2id / Bcrypt password hashing
- **Exports:** ReportLab (GST PDF Invoices & Reports) + openpyxl (Excel registers)
- **Visual Assets:** Nano Banana (Authentic South Indian kitchen mural illustrations)

---

## 3. Benchmark Verification Reference

Annapurna is benchmarked against the canonical factory scenario:

1. **Opening Stock:**
   - Flour: 100 kg @ ₹42/kg
   - Oil: 30 L @ ₹140/L
   - Spice mix: 5 kg @ ₹200/kg
   - 200g Pouches: 500 pcs @ ₹2.50 each
   - Cartons: 30 pcs @ ₹15 each
   - Finished Murukku (200g): 50 packets
2. **Purchase:** 60 kg flour @ ₹45/kg (Flour weighted average rate becomes ₹43.125/kg)
3. **Production Batch (Murukku 200g):**
   - Issued: 40 kg flour, 10.5 L oil (+5% variance), 1.2 kg spice mix
   - Output: 188 good packets (-6% yield variance)
   - Packaging: 194 pouches consumed (188 good + 6 damaged), 9 cartons used (180 packets packed + 8 loose)
   - Overheads: ₹1,200 labour + ₹600 power/gas
   - Total batch cost: ₹5,855.00 $\rightarrow$ ₹31.14 per packet
   - Finished stock becomes: 50 + 188 = 238 packets
4. **Sales & GST (Retailer A - Tamil Nadu):**
   - 150 packets @ ₹50 = ₹7,500 taxable
   - CGST (2.5%) = ₹187.50, SGST (2.5%) = ₹187.50 $\rightarrow$ Invoice Total = ₹7,875.00
   - Finished stock after dispatch = 238 - 150 = 88 packets
5. **Stock Guardrail (Distributor B - Karnataka):**
   - Requested: 120 packets. Shortage flagged: 32 packets (only 88 available).
6. **Payment Allocation:**
   - Retailer A pays ₹4,000 $\rightarrow$ Outstanding balance: ₹3,875.00.

---

## 4. Documentation Index

- [PRD (Product Requirements)](file:///C:/Users/Vijayasai/Desktop/Annapurna/docs/PRD.md)
- [Architecture & Tech Specs](file:///C:/Users/Vijayasai/Desktop/Annapurna/docs/ARCHITECTURE.md)
- [Business Rules & Formulas](file:///C:/Users/Vijayasai/Desktop/Annapurna/docs/BUSINESS_RULES.md)
- [Database ER Design](file:///C:/Users/Vijayasai/Desktop/Annapurna/docs/DATABASE_DESIGN.md)
- [Implementation Plan & Phase Roadmaps](file:///C:/Users/Vijayasai/Desktop/Annapurna/docs/IMPLEMENTATION_PLAN.md)
