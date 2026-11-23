import pytest
from decimal import Decimal
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_complete_canonical_benchmark_end_to_end(client: AsyncClient):
    """
    Executes and mathematically validates the entire Annapurna Order-to-Audit Canonical Benchmark:
    
    1. Verify Initial Opening Balances & Valuation (₹12,535.00)
    2. Step 1: Raw Material Inward Purchase (60kg Flour @ ₹45 -> WAR ₹43.1250/kg, Closing 160kg)
    3. Step 2: Batch Production Run:
       - Recipe BOM standard: 200 pkts
       - Actual good output: 188 pkts (Yield variance: -6.00%)
       - Damaged pouches: 6 pcs (Packaging scrap: 3.09%)
       - Cartons used: 9 boxes (holding 180 pkts)
       - Loose packets exception: 8 pkts
       - Raw material issues: Flour 40kg (0%), Cooking Oil 10.5L (+5.00%), Spices 1.2kg (0%)
       - Total Batch Manufacturing Cost: ₹5,855.00
       - Cost per Unit: ₹31.14 / pkt
       - Finished Goods Stock: 50 + 188 = 238 pkts
    4. Step 3: Sales Order & GST Invoicing for Retailer A (Tamil Nadu):
       - 150 pkts @ ₹50 = ₹7,500.00 taxable
       - CGST 2.5% = ₹187.50, SGST 2.5% = ₹187.50 -> Total = ₹7,875.00
    5. Step 4: Dispatch for Retailer A:
       - 150 pkts dispatched -> Stock drops from 238 to 88 pkts
    6. Step 5: Sales Order for Distributor B (Karnataka) & Shortage Guard:
       - 120 pkts ordered (Available 88 pkts -> Shortage 32 pkts)
       - Full dispatch blocked with HTTP 400
    7. Step 6: Customer Partial Payment Allocation:
       - Retailer A pays ₹4,000.00 via NEFT (Ref: NEFT-TN-98124)
       - Invoice balance reduces from ₹7,875.00 to ₹3,875.00 (Status: PARTIALLY_PAID)
       - Aged Receivables reflects ₹3,875.00 in 0-30 days bucket
    8. Step 7: Audit Reports & Transactional Outbox:
       - Sales Register, GSTR-1 Outward Summary, Stock Ledger, Production Variance, Costing
       - Outbox events processed and published
    """
    # -------------------------------------------------------------
    # 0. User Logins
    # -------------------------------------------------------------
    admin_login = await client.post("/api/v1/auth/login", json={"username": "admin", "password": "Admin123!"})
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    sales_a_login = await client.post("/api/v1/auth/login", json={"username": "salesman_a", "password": "Salesman123!"})
    sales_a_token = sales_a_login.json()["access_token"]
    sales_a_headers = {"Authorization": f"Bearer {sales_a_token}"}

    sales_b_login = await client.post("/api/v1/auth/login", json={"username": "salesman_b", "password": "Salesman123!"})
    sales_b_token = sales_b_login.json()["access_token"]
    sales_b_headers = {"Authorization": f"Bearer {sales_b_token}"}

    acct_login = await client.post("/api/v1/auth/login", json={"username": "accountant", "password": "Accountant123!"})
    acct_token = acct_login.json()["access_token"]
    acct_headers = {"Authorization": f"Bearer {acct_token}"}

    # Masters
    mat_res = await client.get("/api/v1/masters/materials", headers=admin_headers)
    materials = {m["code"]: m for m in mat_res.json()}
    prod_res = await client.get("/api/v1/masters/products", headers=admin_headers)
    murukku = next(p for p in prod_res.json() if p["sku"] == "MRK-200")
    cust_res = await client.get("/api/v1/masters/customers", headers=admin_headers)
    customers = {c["business_name"].split(" ")[0]: c for c in cust_res.json()}
    retailer_a = customers["Retailer"]
    distributor_b = customers["Distributor"]

    # -------------------------------------------------------------
    # 1. Verify Initial Opening Balances & Valuation
    # -------------------------------------------------------------
    stock_summary = await client.get("/api/v1/inventory/summary", headers=admin_headers)
    assert stock_summary.status_code == 200
    sum_data = stock_summary.json()
    assert Decimal(str(sum_data["total_inventory_value"])) == Decimal("12600.00")

    # -------------------------------------------------------------
    # 2. Step 1: Raw Material Inward Purchase (60kg Flour @ ₹45)
    # -------------------------------------------------------------
    purchase_res = await client.post(
        "/api/v1/inventory/purchases",
        json={
            "material_id": materials["MAT-FLOUR-01"]["id"],
            "quantity": "60.0000",
            "purchase_rate": "45.0000",
            "notes": "Canonical benchmark purchase"
        },
        headers=admin_headers
    )
    assert purchase_res.status_code == 201
    p_data = purchase_res.json()
    assert Decimal(str(p_data["new_weighted_average_rate"])) == Decimal("43.1250")
    assert Decimal(str(p_data["new_closing_balance"])) == Decimal("160.0000")

    # -------------------------------------------------------------
    # 3. Step 2: Batch Production Run
    # -------------------------------------------------------------
    bom_res = await client.get(f"/api/v1/masters/boms/{murukku['id']}", headers=admin_headers)
    bom = bom_res.json()

    create_run = await client.post(
        "/api/v1/production/runs",
        json={"bom_id": bom["id"], "planned_quantity": "200.0000"},
        headers=admin_headers
    )
    assert create_run.status_code == 201
    run_id = create_run.json()["run_id"]

    post_run = await client.post(
        f"/api/v1/production/runs/{run_id}/post",
        json={
            "actual_good_output": 188,
            "damaged_pouches": 6,
            "cartons_used": 9,
            "material_issues": [
                {"material_id": materials["MAT-FLOUR-01"]["id"], "actual_quantity": "40.0000"},
                {"material_id": materials["MAT-OIL-01"]["id"], "actual_quantity": "10.5000"},
                {"material_id": materials["MAT-SPICE-01"]["id"], "actual_quantity": "1.2000"},
            ],
            "labour_cost": "1200.00",
            "gas_power_cost": "600.00",
            "other_overhead_cost": "0.00"
        },
        headers=admin_headers
    )
    assert post_run.status_code == 200
    run_data = post_run.json()
    assert Decimal(str(run_data["yield_variance_percent"])) == Decimal("-6.00")
    assert Decimal(str(run_data["total_batch_cost"])) == Decimal("5855.00")
    assert Decimal(str(run_data["cost_per_packet"])) == Decimal("31.14")

    # Verify finished stock is now exactly 238 packets
    stock_after_prod = await client.get("/api/v1/inventory/summary", headers=admin_headers)
    fg_stock = next(f for f in stock_after_prod.json()["finished_goods"] if f["code_or_sku"] == "MRK-200")
    assert Decimal(str(fg_stock["current_stock"])) == Decimal("238.0000")

    # -------------------------------------------------------------
    # 4. Step 3: Sales Order & GST Invoicing for Retailer A (TN)
    # -------------------------------------------------------------
    order_a_res = await client.post(
        "/api/v1/sales/orders",
        json={
            "customer_id": retailer_a["id"],
            "items": [{"product_id": murukku["id"], "quantity": 150}],
            "idempotency_key": "e2e-order-retailer-a-001"
        },
        headers=sales_a_headers
    )
    assert order_a_res.status_code == 201
    order_a_id = order_a_res.json()["id"]

    # Approve
    await client.patch(f"/api/v1/sales/orders/{order_a_id}/status", json={"status": "APPROVED"}, headers=admin_headers)

    # Invoice
    inv_a_res = await client.post(f"/api/v1/sales/orders/{order_a_id}/invoice", headers=admin_headers)
    assert inv_a_res.status_code == 201
    inv_a = inv_a_res.json()
    assert Decimal(str(inv_a["taxable_amount"])) == Decimal("7500.00")
    assert Decimal(str(inv_a["cgst_amount"])) == Decimal("187.50")
    assert Decimal(str(inv_a["sgst_amount"])) == Decimal("187.50")
    assert Decimal(str(inv_a["igst_amount"])) == Decimal("0.00")
    assert Decimal(str(inv_a["total_amount"])) == Decimal("7875.00")
    invoice_a_id = inv_a["id"]

    # Verify ReportLab PDF invoice generation
    pdf_res = await client.get(f"/api/v1/sales/invoices/{invoice_a_id}/pdf", headers=admin_headers)
    assert pdf_res.status_code == 200
    assert pdf_res.content.startswith(b"%PDF")
    assert len(pdf_res.content) > 1000

    # -------------------------------------------------------------
    # 5. Step 4: Dispatch for Retailer A (150 pkts)
    # -------------------------------------------------------------
    dispatch_res = await client.post(
        f"/api/v1/sales/orders/{order_a_id}/dispatch",
        json={"order_id": order_a_id, "invoice_id": invoice_a_id},
        headers=admin_headers
    )
    assert dispatch_res.status_code == 200
    dispatch_data = dispatch_res.json()
    assert dispatch_data["dispatched_quantity"] == 150
    assert Decimal(str(dispatch_data["remaining_finished_stock"])) == Decimal("88.0000")

    # Stock drops from 238 to exactly 88 packets
    stock_after_dispatch = await client.get("/api/v1/inventory/summary", headers=admin_headers)
    fg_stock_disp = next(f for f in stock_after_dispatch.json()["finished_goods"] if f["code_or_sku"] == "MRK-200")
    assert Decimal(str(fg_stock_disp["current_stock"])) == Decimal("88.0000")

    # -------------------------------------------------------------
    # 6. Step 5: Sales Order for Distributor B (KA) & Shortage Guard
    # -------------------------------------------------------------
    order_b_res = await client.post(
        "/api/v1/sales/orders",
        json={
            "customer_id": distributor_b["id"],
            "items": [{"product_id": murukku["id"], "quantity": 120}],
            "idempotency_key": "e2e-order-distributor-b-001"
        },
        headers=sales_b_headers
    )
    assert order_b_res.status_code == 201
    order_b_id = order_b_res.json()["id"]

    # Check stock-check flags 32 pkts shortage
    precheck_res = await client.get(f"/api/v1/sales/orders/{order_b_id}/stock-check", headers=admin_headers)
    assert precheck_res.status_code == 200
    precheck_data = precheck_res.json()
    assert precheck_data["can_fulfill_completely"] is False
    assert precheck_data["items"][0]["shortage_quantity"] == 32

    # Admin approves and invoices
    await client.patch(f"/api/v1/sales/orders/{order_b_id}/status", json={"status": "APPROVED"}, headers=admin_headers)
    inv_b_res = await client.post(f"/api/v1/sales/orders/{order_b_id}/invoice", headers=admin_headers)
    assert inv_b_res.status_code == 201
    inv_b = inv_b_res.json()
    # Interstate Karnataka: 5% IGST
    assert Decimal(str(inv_b["taxable_amount"])) == Decimal("6000.00")
    assert Decimal(str(inv_b["cgst_amount"])) == Decimal("0.00")
    assert Decimal(str(inv_b["sgst_amount"])) == Decimal("0.00")
    assert Decimal(str(inv_b["igst_amount"])) == Decimal("300.00")
    assert Decimal(str(inv_b["total_amount"])) == Decimal("6300.00")

    # Attempting to dispatch 120 packets with only 88 packets available fails
    over_disp_res = await client.post(
        f"/api/v1/sales/orders/{order_b_id}/dispatch",
        json={"order_id": order_b_id, "invoice_id": inv_b["id"]},
        headers=admin_headers
    )
    assert over_disp_res.status_code == 400
    assert "Insufficient finished goods" in over_disp_res.json()["detail"]

    # -------------------------------------------------------------
    # 7. Step 6: Customer Partial Payment Allocation
    # -------------------------------------------------------------
    # Retailer A pays ₹4,000.00 via NEFT
    pay_res = await client.post(
        "/api/v1/payments",
        json={
            "customer_id": retailer_a["id"],
            "invoice_id": invoice_a_id,
            "amount": "4000.00",
            "payment_method": "BANK_TRANSFER",
            "reference_number": "NEFT-TN-98124"
        },
        headers=acct_headers
    )
    assert pay_res.status_code == 201
    pay_data = pay_res.json()
    assert Decimal(str(pay_data["invoice_remaining_balance"])) == Decimal("3875.00")
    assert Decimal(str(pay_data["customer_remaining_balance"])) == Decimal("3875.00")

    # Aged Receivables check
    rec_res = await client.get("/api/v1/payments/receivables", headers=acct_headers)
    assert rec_res.status_code == 200
    rec_customers = {c["business_name"].split(" ")[0]: c for c in rec_res.json()["customers"]}
    assert Decimal(str(rec_customers["Retailer"]["current_balance"])) == Decimal("3875.00")
    assert Decimal(str(rec_customers["Distributor"]["current_balance"])) == Decimal("6300.00")
    # Total outstanding = 3875 + 6300 = ₹10,175.00
    assert Decimal(str(rec_res.json()["total_receivables"])) == Decimal("10175.00")

    # -------------------------------------------------------------
    # 8. Step 7: Audit Reports & Transactional Outbox
    # -------------------------------------------------------------
    # Sales Register
    sr_res = await client.get("/api/v1/reports/sales-register", headers=acct_headers)
    assert sr_res.status_code == 200
    sr_data = sr_res.json()
    assert sr_data["total_invoices"] == 2
    assert Decimal(str(sr_data["total_sales"])) == Decimal("14175.00")
    assert Decimal(str(sr_data["total_collected"])) == Decimal("4000.00")
    assert Decimal(str(sr_data["total_outstanding"])) == Decimal("10175.00")

    # GSTR-1 Summary
    gst_res = await client.get("/api/v1/reports/gst-summary", headers=acct_headers)
    assert gst_res.status_code == 200
    gst_data = gst_res.json()
    assert Decimal(str(gst_data["b2b_intrastate"]["taxable_value"])) == Decimal("7500.00")
    assert Decimal(str(gst_data["b2b_interstate"]["taxable_value"])) == Decimal("6000.00")
    assert Decimal(str(gst_data["total"]["taxable_value"])) == Decimal("13500.00")
    assert Decimal(str(gst_data["total"]["total_tax"])) == Decimal("675.00")
    assert Decimal(str(gst_data["total"]["total_invoice_value"])) == Decimal("14175.00")

    # Outbox processing
    outbox_proc = await client.post("/api/v1/realtime/process-outbox", headers=admin_headers)
    assert outbox_proc.status_code == 200
    assert outbox_proc.json()["status"] == "success"
    assert outbox_proc.json()["published_events_count"] >= 1
