import pytest
from decimal import Decimal
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_canonical_benchmark_payment_and_reports(client: AsyncClient):
    # 1. Log in users
    admin_login = await client.post("/api/v1/auth/login", json={"username": "admin", "password": "Admin123!"})
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    sales_a_login = await client.post("/api/v1/auth/login", json={"username": "salesman_a", "password": "Salesman123!"})
    sales_a_token = sales_a_login.json()["access_token"]
    sales_a_headers = {"Authorization": f"Bearer {sales_a_token}"}

    acct_login = await client.post("/api/v1/auth/login", json={"username": "accountant", "password": "Accountant123!"})
    acct_token = acct_login.json()["access_token"]
    acct_headers = {"Authorization": f"Bearer {acct_token}"}

    # 2. Setup benchmark production & finished stock
    mat_res = await client.get("/api/v1/masters/materials", headers=admin_headers)
    materials = {m["code"]: m for m in mat_res.json()}
    prod_res = await client.get("/api/v1/masters/products", headers=admin_headers)
    murukku = next(p for p in prod_res.json() if p["sku"] == "MRK-200")
    cust_res = await client.get("/api/v1/masters/customers", headers=admin_headers)
    customers = {c["business_name"].split(" ")[0]: c for c in cust_res.json()}
    retailer_a = customers["Retailer"]

    # Flour purchase: 60 kg @ 45
    await client.post(
        "/api/v1/inventory/purchases",
        json={"material_id": materials["MAT-FLOUR-01"]["id"], "quantity": "60.0000", "purchase_rate": "45.0000"},
        headers=admin_headers
    )

    # Production run: 188 output
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

    # 3. Create, approve, and invoice Retailer A order: 150 packets
    order_payload = {
        "customer_id": retailer_a["id"],
        "items": [{"product_id": murukku["id"], "quantity": 150}],
        "idempotency_key": "pay-test-order-001"
    }
    order_res = await client.post("/api/v1/sales/orders", json=order_payload, headers=sales_a_headers)
    assert order_res.status_code == 201
    order_id = order_res.json()["id"]

    await client.patch(f"/api/v1/sales/orders/{order_id}/status", json={"status": "APPROVED"}, headers=admin_headers)

    invoice_res = await client.post(f"/api/v1/sales/orders/{order_id}/invoice", headers=admin_headers)
    assert invoice_res.status_code == 201
    inv_data = invoice_res.json()
    invoice_id = inv_data["id"]
    assert Decimal(str(inv_data["total_amount"])) == Decimal("7875.00")

    # 4. Check initial aged receivables: Retailer A has ₹7,875.00
    rec_res = await client.get("/api/v1/payments/receivables", headers=acct_headers)
    assert rec_res.status_code == 200
    rec_data = rec_res.json()
    assert Decimal(str(rec_data["total_receivables"])) == Decimal("7875.00")
    ret_a_rec = next(c for c in rec_data["customers"] if c["customer_id"] == retailer_a["id"])
    assert Decimal(str(ret_a_rec["current_balance"])) == Decimal("7875.00")
    assert Decimal(str(ret_a_rec["bucket_0_30"])) == Decimal("7875.00")

    # 5. Overpayment guard: attempt to pay ₹9,000 on ₹7,875 invoice
    overpay_res = await client.post(
        "/api/v1/payments",
        json={
            "customer_id": retailer_a["id"],
            "invoice_id": invoice_id,
            "amount": "9000.00",
            "payment_method": "BANK_TRANSFER"
        },
        headers=acct_headers
    )
    assert overpay_res.status_code == 400

    # 6. Canonical benchmark payment: ₹4,000.00
    pay_res = await client.post(
        "/api/v1/payments",
        json={
            "customer_id": retailer_a["id"],
            "invoice_id": invoice_id,
            "amount": "4000.00",
            "payment_method": "BANK_TRANSFER",
            "reference_number": "NEFT-TN-98124"
        },
        headers=acct_headers
    )
    assert pay_res.status_code == 201
    pay_data = pay_res.json()
    assert pay_data["payment_number"].startswith("PAY-")
    assert Decimal(str(pay_data["amount"])) == Decimal("4000.00")
    assert Decimal(str(pay_data["invoice_remaining_balance"])) == Decimal("3875.00")
    assert Decimal(str(pay_data["customer_remaining_balance"])) == Decimal("3875.00")

    # 7. Check receivables after payment: ₹3,875.00 remaining
    rec_after = await client.get("/api/v1/payments/receivables", headers=acct_headers)
    assert rec_after.status_code == 200
    rec_after_data = rec_after.json()
    assert Decimal(str(rec_after_data["total_receivables"])) == Decimal("3875.00")
    ret_a_rec_after = next(c for c in rec_after_data["customers"] if c["customer_id"] == retailer_a["id"])
    assert Decimal(str(ret_a_rec_after["current_balance"])) == Decimal("3875.00")

    # 8. List payments
    list_pay = await client.get("/api/v1/payments", headers=acct_headers)
    assert list_pay.status_code == 200
    assert len(list_pay.json()) == 1

    # 9. Reports: Sales Register (JSON, CSV, Excel)
    sr_res = await client.get("/api/v1/reports/sales-register", headers=acct_headers)
    assert sr_res.status_code == 200
    sr_json = sr_res.json()
    assert sr_json["total_invoices"] == 1
    assert Decimal(str(sr_json["total_sales"])) == Decimal("7875.00")
    assert Decimal(str(sr_json["total_collected"])) == Decimal("4000.00")
    assert Decimal(str(sr_json["total_outstanding"])) == Decimal("3875.00")

    # CSV
    sr_csv = await client.get("/api/v1/reports/sales-register?format=csv", headers=acct_headers)
    assert sr_csv.status_code == 200
    assert "Invoice Number,Invoice Date" in sr_csv.text

    # Excel
    sr_excel = await client.get("/api/v1/reports/sales-register?format=excel", headers=acct_headers)
    assert sr_excel.status_code == 200
    assert len(sr_excel.content) > 1000

    # 10. Reports: GST Outward Summary (JSON, Excel)
    gst_res = await client.get("/api/v1/reports/gst-summary", headers=acct_headers)
    assert gst_res.status_code == 200
    gst_data = gst_res.json()
    assert Decimal(str(gst_data["b2b_intrastate"]["taxable_value"])) == Decimal("7500.00")
    assert Decimal(str(gst_data["b2b_intrastate"]["cgst_amount"])) == Decimal("187.50")
    assert Decimal(str(gst_data["b2b_intrastate"]["sgst_amount"])) == Decimal("187.50")

    gst_excel = await client.get("/api/v1/reports/gst-summary?format=excel", headers=acct_headers)
    assert gst_excel.status_code == 200
    assert len(gst_excel.content) > 1000

    # 11. Reports: Stock Ledger Summary (JSON, Excel)
    stock_rep = await client.get("/api/v1/reports/stock-ledger", headers=acct_headers)
    assert stock_rep.status_code == 200
    assert len(stock_rep.json()["items"]) == 6

    stock_excel = await client.get("/api/v1/reports/stock-ledger?format=excel", headers=acct_headers)
    assert stock_excel.status_code == 200
    assert len(stock_excel.content) > 1000

    # 12. Reports: Production Variance (JSON, Excel)
    var_rep = await client.get("/api/v1/reports/production-variance", headers=admin_headers)
    assert var_rep.status_code == 200
    var_json = var_rep.json()
    assert var_json["total_batches"] == 1
    assert Decimal(str(var_json["batches"][0]["yield_variance_percent"])) == Decimal("-6.00")

    var_excel = await client.get("/api/v1/reports/production-variance?format=excel", headers=admin_headers)
    assert var_excel.status_code == 200
    assert len(var_excel.content) > 1000

    # 13. Reports: Batch Costing
    cost_rep = await client.get("/api/v1/reports/batch-costing", headers=admin_headers)
    assert cost_rep.status_code == 200
    cost_json = cost_rep.json()
    assert cost_json["total_batches"] == 1
    assert Decimal(str(cost_json["batches"][0]["total_cost"])) == Decimal("5855.00")
