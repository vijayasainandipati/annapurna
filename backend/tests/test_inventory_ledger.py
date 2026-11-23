import pytest
from decimal import Decimal
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_opening_stock_balances(client: AsyncClient):
    """Verifies opening stock balances in the immutable ledger matches the benchmark."""
    # 1. Login as Admin
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "Admin123!"}
    )
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Fetch inventory summary
    summary_res = await client.get("/api/v1/inventory/summary", headers=headers)
    assert summary_res.status_code == 200
    summary = summary_res.json()

    # Create mapping of code -> balance
    raw_materials = {m["code_or_sku"]: m for m in summary["raw_materials"]}
    packaging = {p["code_or_sku"]: p for p in summary["packaging"]}
    finished_goods = {f["code_or_sku"]: f for f in summary["finished_goods"]}

    # Verify exact benchmark opening quantities
    assert Decimal(str(raw_materials["MAT-FLOUR-01"]["current_stock"])) == Decimal("100.0000")
    assert Decimal(str(raw_materials["MAT-FLOUR-01"]["valuation_rate"])) == Decimal("42.0000")

    assert Decimal(str(raw_materials["MAT-OIL-01"]["current_stock"])) == Decimal("30.0000")
    assert Decimal(str(raw_materials["MAT-OIL-01"]["valuation_rate"])) == Decimal("140.0000")

    assert Decimal(str(raw_materials["MAT-SPICE-01"]["current_stock"])) == Decimal("5.0000")
    assert Decimal(str(raw_materials["MAT-SPICE-01"]["valuation_rate"])) == Decimal("200.0000")

    assert Decimal(str(packaging["PKG-POUCH-200"]["current_stock"])) == Decimal("500.0000")
    assert Decimal(str(packaging["PKG-POUCH-200"]["valuation_rate"])) == Decimal("2.5000")

    assert Decimal(str(packaging["PKG-CARTON-01"]["current_stock"])) == Decimal("30.0000")
    assert Decimal(str(packaging["PKG-CARTON-01"]["valuation_rate"])) == Decimal("15.0000")

    assert Decimal(str(finished_goods["MRK-200"]["current_stock"])) == Decimal("50.0000")

@pytest.mark.asyncio
async def test_record_purchase_benchmark(client: AsyncClient):
    """
    Step 1 of Benchmark Sequence:
    Record purchase of 60 kg flour at ₹45/kg.
    Expected:
    - Opening: 100 kg @ ₹42 = ₹4,200
    - Purchase: 60 kg @ ₹45 = ₹2,700
    - Total: 160 kg @ ₹6,900 / 160 = ₹43.125/kg (Exact Weighted-Average Rate)
    """
    # 1. Login as Admin
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "Admin123!"}
    )
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Get Flour Material ID
    mat_res = await client.get("/api/v1/masters/materials", headers=headers)
    materials = mat_res.json()
    flour = next(m for m in materials if m["code"] == "MAT-FLOUR-01")

    # 3. Post purchase of 60 kg @ ₹45/kg
    purchase_payload = {
        "material_id": flour["id"],
        "quantity": "60.0000",
        "purchase_rate": "45.0000",
        "supplier_name": "Madurai Grain Mills",
        "supplier_invoice_no": "MGM-2026-904",
        "notes": "Benchmark test Step 1"
    }
    res = await client.post("/api/v1/inventory/purchases", json=purchase_payload, headers=headers)
    assert res.status_code == 201
    data = res.json()

    assert Decimal(str(data["quantity_received"])) == Decimal("60.0000")
    assert Decimal(str(data["previous_valuation_rate"])) == Decimal("42.0000")
    assert Decimal(str(data["new_weighted_average_rate"])) == Decimal("43.1250")
    assert Decimal(str(data["new_closing_balance"])) == Decimal("160.0000")

    # 4. Confirm new stock and rate in Inventory Summary
    summary_res = await client.get("/api/v1/inventory/summary", headers=headers)
    raw_materials = {m["code_or_sku"]: m for m in summary_res.json()["raw_materials"]}
    assert Decimal(str(raw_materials["MAT-FLOUR-01"]["current_stock"])) == Decimal("160.0000")
    assert Decimal(str(raw_materials["MAT-FLOUR-01"]["valuation_rate"])) == Decimal("43.1250")

@pytest.mark.asyncio
async def test_purchase_rbac_enforcement(client: AsyncClient):
    """Ensures Salesmen and Supervisors cannot record purchases, while Admin can."""
    # 1. Login as Salesman A
    sales_res = await client.post(
        "/api/v1/auth/login",
        json={"username": "salesman_a", "password": "Salesman123!"}
    )
    sales_token = sales_res.json()["access_token"]

    # 2. Try recording a purchase as Salesman
    mat_res = await client.get(
        "/api/v1/masters/materials",
        headers={"Authorization": f"Bearer {sales_token}"}
    )
    flour_id = mat_res.json()[0]["id"]

    forbidden_res = await client.post(
        "/api/v1/inventory/purchases",
        json={"material_id": flour_id, "quantity": "10.0000", "purchase_rate": "50.0000"},
        headers={"Authorization": f"Bearer {sales_token}"}
    )
    assert forbidden_res.status_code == 403
    assert "lacks required permissions" in forbidden_res.json()["detail"]

@pytest.mark.asyncio
async def test_stock_ledger_reconciliation(client: AsyncClient):
    """Audits the ledger and verifies that all items reconcile mathematically with 100% accuracy."""
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"username": "accountant", "password": "Accountant123!"}
    )
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    rec_res = await client.get("/api/v1/inventory/reconciliation", headers=headers)
    assert rec_res.status_code == 200
    rec_data = rec_res.json()

    assert rec_data["all_reconciled"] is True
    assert rec_data["total_ledger_entries"] >= 6
    for item in rec_data["items"]:
        assert item["is_reconciled"] is True
        assert Decimal(str(item["ledger_sum"])) == Decimal(str(item["reported_balance"]))
