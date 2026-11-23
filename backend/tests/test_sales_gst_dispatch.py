import pytest
from decimal import Decimal
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_canonical_benchmark_sales_flow(client: AsyncClient):
    """
    Executes the exact canonical benchmark sales and dispatch workflow:
    1. Production posted: finished goods balance = 238 packets (50 opening + 188 output).
    2. Salesman A creates order for Retailer A: 150 packets.
    3. Admin approves order.
    4. Admin generates GST invoice:
       - Retailer A in Tamil Nadu (Intra-state: 2.5% CGST + 2.5% SGST = 5%).
       - 150 * ₹50 = ₹7,500 taxable value.
       - CGST = ₹187.50, SGST = ₹187.50.
       - Invoice Total = ₹7,875.00.
    5. Admin dispatches order:
       - Finished goods inventory reduces from 238 to 88 packets.
    6. ReportLab PDF invoice generation verified.
    7. Salesman B creates order for Distributor B (Karnataka): 120 packets.
    8. Stock availability check flags shortage of 32 packets (available 88).
    9. Full dispatch of 120 packets fails with HTTP 400.
    """
    # 0. Reseed and run initial production to get 238 packets of Murukku
    admin_login = await client.post("/api/v1/auth/login", json={"username": "admin", "password": "Admin123!"})
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Fetch IDs
    mat_res = await client.get("/api/v1/masters/materials", headers=admin_headers)
    materials = {m["code"]: m for m in mat_res.json()}
    prod_res = await client.get("/api/v1/masters/products", headers=admin_headers)
    murukku = next(p for p in prod_res.json() if p["sku"] == "MRK-200")
    cust_res = await client.get("/api/v1/masters/customers", headers=admin_headers)
    customers = {c["business_name"].split(" ")[0]: c for c in cust_res.json()}
    retailer_a = customers["Retailer"]
    distributor_b = customers["Distributor"]

    # Flour purchase
    await client.post(
        "/api/v1/inventory/purchases",
        json={"material_id": materials["MAT-FLOUR-01"]["id"], "quantity": "60.0000", "purchase_rate": "45.0000"},
        headers=admin_headers
    )

    # Post Benchmark Production Run
    bom_res = await client.get(f"/api/v1/masters/boms/{murukku['id']}", headers=admin_headers)
    bom = bom_res.json()
    create_run = await client.post(
        "/api/v1/production/runs",
        json={"bom_id": bom["id"], "planned_quantity": "200.0000"},
        headers=admin_headers
    )
    run_id = create_run.json()["run_id"]
    await client.post(
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

    # Verify initial finished stock is 238
    stock_res = await client.get("/api/v1/inventory/summary", headers=admin_headers)
    fg_stock = next(f for f in stock_res.json()["finished_goods"] if f["code_or_sku"] == "MRK-200")
    assert Decimal(str(fg_stock["current_stock"])) == Decimal("238.0000")

    # Step 10: Salesman A creates order for Retailer A: 150 packets
    sales_a_login = await client.post("/api/v1/auth/login", json={"username": "salesman_a", "password": "Salesman123!"})
    sales_a_token = sales_a_login.json()["access_token"]
    sales_a_headers = {"Authorization": f"Bearer {sales_a_token}"}

    order_payload = {
        "customer_id": retailer_a["id"],
        "items": [
            {"product_id": murukku["id"], "quantity": 150}
        ],
        "idempotency_key": "salesman-a-offline-order-001",
        "notes": "Retailer A benchmark order"
    }
    order_res = await client.post("/api/v1/sales/orders", json=order_payload, headers=sales_a_headers)
    assert order_res.status_code == 201
    order_data = order_res.json()
    order_id = order_data["id"]
    assert order_data["status"] == "PENDING"
    assert Decimal(str(order_data["total_taxable_amount"])) == Decimal("7500.00")
    assert Decimal(str(order_data["total_tax_amount"])) == Decimal("375.00")
    assert Decimal(str(order_data["total_order_amount"])) == Decimal("7875.00")

    # Step 11a: Admin approves order
    approve_res = await client.patch(
        f"/api/v1/sales/orders/{order_id}/status",
        json={"status": "APPROVED"},
        headers=admin_headers
    )
    assert approve_res.status_code == 200
    assert approve_res.json()["status"] == "APPROVED"

    # Step 11b: Admin generates GST Invoice
    invoice_res = await client.post(
        f"/api/v1/sales/orders/{order_id}/invoice",
        headers=admin_headers
    )
    assert invoice_res.status_code == 201
    inv_data = invoice_res.json()
    invoice_id = inv_data["id"]

    # Verify exact tax calculation
    assert Decimal(str(inv_data["taxable_amount"])) == Decimal("7500.00")
    assert Decimal(str(inv_data["cgst_amount"])) == Decimal("187.50")
    assert Decimal(str(inv_data["sgst_amount"])) == Decimal("187.50")
    assert Decimal(str(inv_data["igst_amount"])) == Decimal("0.00")
    assert Decimal(str(inv_data["total_amount"])) == Decimal("7875.00")
    assert inv_data["is_interstate"] is False

    # Step 11c: Download ReportLab PDF Invoice
    pdf_res = await client.get(f"/api/v1/sales/invoices/{invoice_id}/pdf", headers=admin_headers)
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"
    assert pdf_res.content.startswith(b"%PDF")

    # Step 11d: Admin dispatches order
    dispatch_res = await client.post(
        f"/api/v1/sales/orders/{order_id}/dispatch",
        json={"order_id": order_id, "invoice_id": invoice_id},
        headers=admin_headers
    )
    assert dispatch_res.status_code == 200
    dispatch_data = dispatch_res.json()
    assert dispatch_data["dispatched_quantity"] == 150
    assert Decimal(str(dispatch_data["remaining_finished_stock"])) == Decimal("88.0000")

    # Verify stock ledger after dispatch
    stock_after_dsp = await client.get("/api/v1/inventory/summary", headers=admin_headers)
    fg_after = next(f for f in stock_after_dsp.json()["finished_goods"] if f["code_or_sku"] == "MRK-200")
    assert Decimal(str(fg_after["current_stock"])) == Decimal("88.0000")  # 238 - 150 = 88 packets!

    # Step 12: Salesman B creates order for Distributor B (Karnataka): 120 packets
    sales_b_login = await client.post("/api/v1/auth/login", json={"username": "salesman_b", "password": "Salesman123!"})
    sales_b_token = sales_b_login.json()["access_token"]
    sales_b_headers = {"Authorization": f"Bearer {sales_b_token}"}

    order_b_payload = {
        "customer_id": distributor_b["id"],
        "items": [
            {"product_id": murukku["id"], "quantity": 120}
        ],
        "notes": "Distributor B order in Karnataka"
    }
    order_b_res = await client.post("/api/v1/sales/orders", json=order_b_payload, headers=sales_b_headers)
    assert order_b_res.status_code == 201
    order_b_id = order_b_res.json()["id"]

    # Step 13: Stock Pre-check flags shortage of 32 packets
    precheck_res = await client.get(f"/api/v1/sales/orders/{order_b_id}/stock-check", headers=admin_headers)
    assert precheck_res.status_code == 200
    precheck_data = precheck_res.json()
    assert precheck_data["can_fulfill_completely"] is False
    assert precheck_data["total_requested"] == 120
    assert Decimal(str(precheck_data["total_available"])) == Decimal("88.0000")

    item_check = precheck_data["items"][0]
    assert item_check["requested_quantity"] == 120
    assert Decimal(str(item_check["available_stock"])) == Decimal("88.0000")
    assert item_check["has_shortage"] is True
    assert item_check["shortage_quantity"] == 32  # 120 - 88 = 32 shortage!

    # Verify attempt to dispatch 120 packets without enough stock is blocked
    # Generate invoice first
    await client.patch(f"/api/v1/sales/orders/{order_b_id}/status", json={"status": "APPROVED"}, headers=admin_headers)
    inv_b = await client.post(f"/api/v1/sales/orders/{order_b_id}/invoice", headers=admin_headers)
    inv_b_data = inv_b.json()
    assert inv_b_data["is_interstate"] is True
    assert Decimal(str(inv_b_data["igst_amount"])) == Decimal("300.00")  # 120 * 50 = 6000 * 5% = 300

    # Hard stop on over-dispatch
    fail_dsp = await client.post(
        f"/api/v1/sales/orders/{order_b_id}/dispatch",
        json={"order_id": order_b_id, "invoice_id": inv_b_data["id"]},
        headers=admin_headers
    )
    assert fail_dsp.status_code == 400
    assert "Insufficient finished goods" in fail_dsp.json()["detail"]
    assert "Shortage: 32 packets" in fail_dsp.json()["detail"]

@pytest.mark.asyncio
async def test_order_idempotency_deduplication(client: AsyncClient):
    """Ensures offline order resubmission with same idempotency key returns original order without duplicate insertion."""
    sales_login = await client.post("/api/v1/auth/login", json={"username": "salesman_a", "password": "Salesman123!"})
    token = sales_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    prod_res = await client.get("/api/v1/masters/products", headers=headers)
    murukku = prod_res.json()[0]
    cust_res = await client.get("/api/v1/masters/customers", headers=headers)
    customer = cust_res.json()[0]

    order_payload = {
        "customer_id": customer["id"],
        "items": [{"product_id": murukku["id"], "quantity": 10}],
        "idempotency_key": "test-offline-uuid-duplicate-check-999"
    }

    # First submission
    res1 = await client.post("/api/v1/sales/orders", json=order_payload, headers=headers)
    assert res1.status_code == 201
    order1 = res1.json()

    # Second submission (reconnected offline device retry)
    res2 = await client.post("/api/v1/sales/orders", json=order_payload, headers=headers)
    assert res2.status_code == 201
    order2 = res2.json()

    # Exactly same order returned
    assert order1["id"] == order2["id"]
    assert order1["order_number"] == order2["order_number"]
