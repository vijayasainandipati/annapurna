import pytest
from decimal import Decimal
from httpx import AsyncClient
from seed.seed_data import run_seed

@pytest.mark.asyncio
async def test_canonical_benchmark_production_run(client: AsyncClient):
    """
    Executes the exact canonical benchmark production workflow:
    1. Purchase 60 kg flour @ ₹45/kg (WAR becomes ₹43.125/kg, total 160 kg).
    2. Start 1 Murukku batch (planned: 200 pkts).
    3. Issue: 40 kg flour, 10.5 L oil (+5% variance), 1.2 kg spice mix.
    4. Record: 188 good packets (-6% yield variance), 6 damaged pouches, 9 cartons used.
    5. Add ₹1,200 labour, ₹600 gas/power.
    6. Post run atomically.
    7. Verify exact expected stock balances and costing.
    """
    # 1. Login as Admin
    admin_login = await client.post("/api/v1/auth/login", json={"username": "admin", "password": "Admin123!"})
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Step 1: Flour purchase
    mat_res = await client.get("/api/v1/masters/materials", headers=admin_headers)
    materials = {m["code"]: m for m in mat_res.json()}
    flour_id = materials["MAT-FLOUR-01"]["id"]
    oil_id = materials["MAT-OIL-01"]["id"]
    spice_id = materials["MAT-SPICE-01"]["id"]

    purchase_res = await client.post(
        "/api/v1/inventory/purchases",
        json={"material_id": flour_id, "quantity": "60.0000", "purchase_rate": "45.0000"},
        headers=admin_headers
    )
    assert purchase_res.status_code == 201
    assert Decimal(str(purchase_res.json()["new_weighted_average_rate"])) == Decimal("43.1250")

    # Step 2: Login as Production Supervisor
    sup_login = await client.post("/api/v1/auth/login", json={"username": "supervisor", "password": "Supervisor123!"})
    sup_token = sup_login.json()["access_token"]
    sup_headers = {"Authorization": f"Bearer {sup_token}"}

    # Get Murukku Product & BOM
    prod_res = await client.get("/api/v1/masters/products", headers=sup_headers)
    murukku = next(p for p in prod_res.json() if p["sku"] == "MRK-200")
    bom_res = await client.get(f"/api/v1/masters/boms/{murukku['id']}", headers=sup_headers)
    bom = bom_res.json()

    # Create Draft Production Run
    create_run_res = await client.post(
        "/api/v1/production/runs",
        json={"bom_id": bom["id"], "planned_quantity": "200.0000", "notes": "Benchmark Batch #1"},
        headers=sup_headers
    )
    assert create_run_res.status_code == 201
    run_id = create_run_res.json()["run_id"]

    # Step 3-6: Post Production Run
    post_payload = {
        "actual_good_output": 188,
        "damaged_pouches": 6,
        "cartons_used": 9,
        "material_issues": [
            {"material_id": flour_id, "actual_quantity": "40.0000"},
            {"material_id": oil_id, "actual_quantity": "10.5000"},
            {"material_id": spice_id, "actual_quantity": "1.2000"},
        ],
        "labour_cost": "1200.00",
        "gas_power_cost": "600.00",
        "other_overhead_cost": "0.00",
        "notes": "Completed benchmark batch with 6 burst pouches"
    }

    post_res = await client.post(f"/api/v1/production/runs/{run_id}/post", json=post_payload, headers=sup_headers)
    assert post_res.status_code == 200, f"Posting failed: {post_res.text}"
    run_data = post_res.json()

    # Verify Variances
    assert run_data["status"] == "POSTED"
    assert run_data["actual_good_output"] == 188
    assert Decimal(str(run_data["yield_variance_percent"])) == Decimal("-6.00")
    assert run_data["is_yield_alert"] is True

    # Verify Material Variances
    variances = {v["item_code"]: v for v in run_data["variances"]}
    assert Decimal(str(variances["MAT-FLOUR-01"]["variance_percent"])) == Decimal("0.00")
    assert variances["MAT-FLOUR-01"]["is_alert"] is False

    assert Decimal(str(variances["MAT-OIL-01"]["variance_percent"])) == Decimal("5.00")
    assert variances["MAT-OIL-01"]["is_alert"] is True  # Oil excess consumption flagged!

    assert Decimal(str(variances["MAT-SPICE-01"]["variance_percent"])) == Decimal("0.00")
    assert variances["MAT-SPICE-01"]["is_alert"] is False

    # Verify Packaging Accounting
    assert run_data["damaged_pouches"] == 6
    assert run_data["total_pouches_consumed"] == 194
    assert run_data["cartons_used"] == 9
    assert run_data["loose_packets_exception"] == 8  # 188 - (9 * 20) = 8 packets

    # Verify Costing
    # Material: 40 * 43.125 = 1,725 + 10.5 * 140 = 1,470 + 1.2 * 200 = 240 -> Total: 3,435
    assert Decimal(str(run_data["material_cost"])) == Decimal("3435.00")
    # Packaging: 194 * 2.50 = 485 + 9 * 15 = 135 -> Total: 620
    assert Decimal(str(run_data["packaging_cost"])) == Decimal("620.00")
    assert Decimal(str(run_data["labour_cost"])) == Decimal("1200.00")
    assert Decimal(str(run_data["gas_power_cost"])) == Decimal("600.00")
    # Total Batch Cost = 3,435 + 620 + 1,200 + 600 = 5,855.00
    assert Decimal(str(run_data["total_batch_cost"])) == Decimal("5855.00")
    # Cost per packet = 5,855 / 188 = ₹31.14
    assert Decimal(str(run_data["cost_per_packet"])) == Decimal("31.14")

    # Step 7: Verify Exact Closing Stock Balances
    summary_res = await client.get("/api/v1/inventory/summary", headers=admin_headers)
    summary = summary_res.json()
    raw = {m["code_or_sku"]: m for m in summary["raw_materials"]}
    pkg = {p["code_or_sku"]: p for p in summary["packaging"]}
    fg = {f["code_or_sku"]: f for f in summary["finished_goods"]}

    assert Decimal(str(raw["MAT-FLOUR-01"]["current_stock"])) == Decimal("120.0000")  # 160 - 40 = 120 kg
    assert Decimal(str(raw["MAT-OIL-01"]["current_stock"])) == Decimal("19.5000")    # 30 - 10.5 = 19.5 L
    assert Decimal(str(raw["MAT-SPICE-01"]["current_stock"])) == Decimal("3.8000")    # 5 - 1.2 = 3.8 kg
    assert Decimal(str(pkg["PKG-POUCH-200"]["current_stock"])) == Decimal("306.0000") # 500 - 194 = 306 pcs
    assert Decimal(str(pkg["PKG-CARTON-01"]["current_stock"])) == Decimal("21.0000")  # 30 - 9 = 21 pcs
    assert Decimal(str(fg["MRK-200"]["current_stock"])) == Decimal("238.0000")        # 50 + 188 = 238 packets

@pytest.mark.asyncio
async def test_atomic_rollback_on_insufficient_stock(client: AsyncClient):
    """
    Ensures that if any material stock check fails during posting,
    the entire transaction is rolled back and NO partial movements are posted.
    """
    admin_login = await client.post("/api/v1/auth/login", json={"username": "admin", "password": "Admin123!"})
    token = admin_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    prod_res = await client.get("/api/v1/masters/products", headers=headers)
    murukku = prod_res.json()[0]
    bom_res = await client.get(f"/api/v1/masters/boms/{murukku['id']}", headers=headers)
    bom = bom_res.json()

    create_run = await client.post(
        "/api/v1/production/runs",
        json={"bom_id": bom["id"], "planned_quantity": "200.0000"},
        headers=headers
    )
    run_id = create_run.json()["run_id"]

    mat_res = await client.get("/api/v1/masters/materials", headers=headers)
    materials = {m["code"]: m for m in mat_res.json()}

    # Attempt to issue 5000 kg of flour (far exceeds available stock)
    fail_payload = {
        "actual_good_output": 200,
        "damaged_pouches": 0,
        "cartons_used": 10,
        "material_issues": [
            {"material_id": materials["MAT-FLOUR-01"]["id"], "actual_quantity": "5000.0000"},
            {"material_id": materials["MAT-OIL-01"]["id"], "actual_quantity": "10.0000"},
            {"material_id": materials["MAT-SPICE-01"]["id"], "actual_quantity": "1.2000"},
        ],
        "labour_cost": "0.00",
        "gas_power_cost": "0.00",
        "other_overhead_cost": "0.00"
    }

    res = await client.post(f"/api/v1/production/runs/{run_id}/post", json=fail_payload, headers=headers)
    assert res.status_code == 400
    assert "Insufficient stock" in res.json()["detail"]

    # Verify that ledger is unchanged and contains NO movements for this run_id
    ledger_res = await client.get("/api/v1/inventory/ledger", headers=headers)
    movements_for_failed_run = [m for m in ledger_res.json() if m["source_document_id"] == run_id]
    assert len(movements_for_failed_run) == 0

@pytest.mark.asyncio
async def test_production_rbac_enforcement(client: AsyncClient):
    """Salesmen cannot create or post production runs."""
    sales_login = await client.post("/api/v1/auth/login", json={"username": "salesman_a", "password": "Salesman123!"})
    sales_token = sales_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {sales_token}"}

    prod_res = await client.get("/api/v1/masters/products", headers=headers)
    murukku = prod_res.json()[0]
    bom_res = await client.get(f"/api/v1/masters/boms/{murukku['id']}", headers=headers)
    bom = bom_res.json()

    res = await client.post(
        "/api/v1/production/runs",
        json={"bom_id": bom["id"]},
        headers=headers
    )
    assert res.status_code == 403
    assert "lacks required permissions" in res.json()["detail"]
