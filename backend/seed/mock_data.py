import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy import select, func

from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.models.master import Material, MaterialCategoryEnum, Product, BOM, BOMLine, Customer
from app.models.inventory import StockLedger, ItemTypeEnum, StockMovementSourceEnum
from app.models.production import ProductionRun, ProductionRunStatusEnum, ProductionIssue
from app.models.sales import (
    SalesOrder,
    SalesOrderStatusEnum,
    SalesOrderItem,
    Invoice,
    InvoiceStatusEnum,
    Dispatch,
)
from app.models.finance import Payment, PaymentMethodEnum
from app.models.outbox import OutboxEvent, OutboxStatusEnum
from app.services.invoice_service import InvoiceService
from seed.seed_data import run_seed

QTY_PREC = Decimal("0.0001")
RATE_PREC = Decimal("0.0001")
CURR_PREC = Decimal("0.01")


async def _get_balance(session, material_id=None, product_id=None) -> Decimal:
    stmt = select(func.coalesce(func.sum(StockLedger.quantity_delta), Decimal("0.0000")))
    if material_id:
        stmt = stmt.where(StockLedger.material_id == material_id)
    else:
        stmt = stmt.where(StockLedger.product_id == product_id)
    bal = (await session.execute(stmt)).scalar_one()
    return Decimal(str(bal)).quantize(QTY_PREC, rounding=ROUND_HALF_UP)


async def run_mock_seed(session_maker=None):
    """
    Populates a complete, mathematically reconciled 45-day manufacturing history
    on top of the canonical baseline seed (`run_seed`).
    All stock balances, WAR rates, GST splits, invoice balances, receivables aging buckets,
    and production variances remain 100% consistent across PostgreSQL ledgers.
    """
    await run_seed(session_maker)
    print("\n🏭 Layering rich Annapurna South Indian Snack Factory mock operations...")

    maker = session_maker or AsyncSessionLocal
    now = datetime.now(timezone.utc)

    async with maker() as session:
        # Load seeded baseline users, materials, products, customers
        users = {u.username: u for u in (await session.execute(select(User))).scalars().all()}
        materials = {m.code: m for m in (await session.execute(select(Material))).scalars().all()}
        products = {p.sku: p for p in (await session.execute(select(Product))).scalars().all()}
        customers_list = (await session.execute(select(Customer))).scalars().all()
        customers = {c.business_name: c for c in customers_list}

        admin_user = users["admin"]
        supervisor_user = users["supervisor"]
        salesman_a = users["salesman_a"]
        salesman_b = users["salesman_b"]
        accountant_user = users["accountant"]

        # Backdate initial opening stock entries to T - 45 days so timelines look authentic
        t_open = now - timedelta(days=45)
        opening_entries = (await session.execute(select(StockLedger))).scalars().all()
        for entry in opening_entries:
            entry.created_at = t_open

        # Enhance baseline customer details with realistic TN / KA addresses
        ret_a = customers["Retailer A (Chennai Grocers)"]
        ret_a.email = "procurement@chennaigrocers.in"
        ret_a.address = "44, Ranganathan Street, T. Nagar, Chennai, Tamil Nadu 600017"

        dist_b = customers["Distributor B (Bengaluru Snacks)"]
        dist_b.email = "orders@bengalurusnacks.in"
        dist_b.address = "18/2, Chickpet Main Road, Bengaluru, Karnataka 560053"

        # ------------------------------------------------------------------
        # 1. Additional Raw Materials (South Indian Snacks Portfolio)
        # ------------------------------------------------------------------
        extra_materials_spec = [
            ("MAT-BESAN-01", "Besan Gram Flour Grade A", MaterialCategoryEnum.RAW_MATERIAL.value, "kg", Decimal("78.0000"), Decimal("25.0000")),
            ("MAT-PEANUT-01", "Roasted Peanuts Split", MaterialCategoryEnum.RAW_MATERIAL.value, "kg", Decimal("125.0000"), Decimal("15.0000")),
            ("MAT-CASHEW-01", "Broken Cashews W320", MaterialCategoryEnum.RAW_MATERIAL.value, "kg", Decimal("680.0000"), Decimal("8.0000")),
            ("MAT-CURRY-01", "Dehydrated Curry Leaves & Asafoetida", MaterialCategoryEnum.RAW_MATERIAL.value, "kg", Decimal("340.0000"), Decimal("2.0000")),
        ]
        for code, name, cat, unit, rate, thresh in extra_materials_spec:
            mat = Material(
                code=code,
                name=name,
                category=cat,
                unit=unit,
                current_valuation_rate=rate,
                minimum_threshold=thresh,
                is_active=True,
                created_at=t_open,
            )
            session.add(mat)
            materials[code] = mat
        await session.flush()

        # Opening stock ledger entries for the new materials
        open_extra_doc_id = uuid.uuid4()
        extra_open_stock = [
            ("MAT-BESAN-01", Decimal("120.0000"), "Opening stock: Besan Flour 120 kg @ ₹78"),
            ("MAT-PEANUT-01", Decimal("40.0000"), "Opening stock: Roasted Peanuts 40 kg @ ₹125"),
            ("MAT-CASHEW-01", Decimal("12.0000"), "Opening stock: Cashews W320 12 kg @ ₹680"),
            ("MAT-CURRY-01", Decimal("6.0000"), "Opening stock: Curry Leaves & Hing 6 kg @ ₹340"),
        ]
        for code, qty, note in extra_open_stock:
            mat = materials[code]
            session.add(StockLedger(
                item_type=mat.category,
                material_id=mat.id,
                quantity_delta=qty,
                unit=mat.unit,
                valuation_rate=mat.current_valuation_rate,
                source_type=StockMovementSourceEnum.OPENING_STOCK.value,
                source_document_id=open_extra_doc_id,
                notes=note,
                created_at=t_open,
                created_by=admin_user.id,
            ))

        # ------------------------------------------------------------------
        # 2. Additional Products & Active BOMs (All 200g pack format)
        # ------------------------------------------------------------------
        extra_products_spec = [
            {
                "sku": "MIX-200",
                "name": "Madras Special Mixture 200g",
                "hsn": "210690",
                "price": Decimal("60.00"),
                "thresh": 80,
                "opening_pkts": Decimal("60.0000"),
                "opening_rate": Decimal("39.0000"),
                "bom_lines": [
                    ("MAT-BESAN-01", Decimal("28.0000"), "kg"),
                    ("MAT-PEANUT-01", Decimal("8.0000"), "kg"),
                    ("MAT-CASHEW-01", Decimal("3.0000"), "kg"),
                    ("MAT-OIL-01", Decimal("11.0000"), "L"),
                    ("MAT-CURRY-01", Decimal("1.0000"), "kg"),
                    ("PKG-POUCH-200", Decimal("200.0000"), "pieces"),
                    ("PKG-CARTON-01", Decimal("10.0000"), "pieces"),
                ],
            },
            {
                "sku": "RBN-200",
                "name": "Ribbon Pakoda 200g",
                "hsn": "190590",
                "price": Decimal("55.00"),
                "thresh": 60,
                "opening_pkts": Decimal("40.0000"),
                "opening_rate": Decimal("35.0000"),
                "bom_lines": [
                    ("MAT-FLOUR-01", Decimal("24.0000"), "kg"),
                    ("MAT-BESAN-01", Decimal("16.0000"), "kg"),
                    ("MAT-OIL-01", Decimal("10.0000"), "L"),
                    ("MAT-SPICE-01", Decimal("1.4000"), "kg"),
                    ("PKG-POUCH-200", Decimal("200.0000"), "pieces"),
                    ("PKG-CARTON-01", Decimal("10.0000"), "pieces"),
                ],
            },
            {
                "sku": "KRS-200",
                "name": "Pepper Kara Sev 200g",
                "hsn": "190590",
                "price": Decimal("52.00"),
                "thresh": 60,
                "opening_pkts": Decimal("30.0000"),
                "opening_rate": Decimal("33.0000"),
                "bom_lines": [
                    ("MAT-BESAN-01", Decimal("34.0000"), "kg"),
                    ("MAT-FLOUR-01", Decimal("6.0000"), "kg"),
                    ("MAT-OIL-01", Decimal("9.5000"), "L"),
                    ("MAT-SPICE-01", Decimal("1.5000"), "kg"),
                    ("PKG-POUCH-200", Decimal("200.0000"), "pieces"),
                    ("PKG-CARTON-01", Decimal("10.0000"), "pieces"),
                ],
            },
            {
                "sku": "THT-200",
                "name": "Garlic Thattai 200g",
                "hsn": "190590",
                "price": Decimal("48.00"),
                "thresh": 50,
                "opening_pkts": Decimal("20.0000"),
                "opening_rate": Decimal("31.0000"),
                "bom_lines": [
                    ("MAT-FLOUR-01", Decimal("36.0000"), "kg"),
                    ("MAT-OIL-01", Decimal("8.5000"), "L"),
                    ("MAT-CURRY-01", Decimal("0.8000"), "kg"),
                    ("MAT-SPICE-01", Decimal("1.2000"), "kg"),
                    ("PKG-POUCH-200", Decimal("200.0000"), "pieces"),
                    ("PKG-CARTON-01", Decimal("10.0000"), "pieces"),
                ],
            },
        ]

        boms_by_sku = {}
        mrk_bom = (await session.execute(select(BOM).where(BOM.product_id == products["MRK-200"].id))).scalar_one()
        boms_by_sku["MRK-200"] = mrk_bom

        for spec in extra_products_spec:
            prod = Product(
                sku=spec["sku"],
                name=spec["name"],
                pack_size_grams=200,
                hsn_code=spec["hsn"],
                gst_rate_percent=Decimal("5.00"),
                base_selling_price=spec["price"],
                minimum_threshold=spec["thresh"],
                is_active=True,
                created_at=t_open,
            )
            session.add(prod)
            await session.flush()
            products[spec["sku"]] = prod

            bom = BOM(
                product_id=prod.id,
                version="v1.0",
                batch_output_units=Decimal("200.0000"),
                is_active=True,
                created_at=t_open,
            )
            session.add(bom)
            await session.flush()
            boms_by_sku[spec["sku"]] = bom

            for mat_code, p_qty, unit in spec["bom_lines"]:
                session.add(BOMLine(
                    bom_id=bom.id,
                    material_id=materials[mat_code].id,
                    planned_quantity=p_qty,
                    unit=unit,
                ))

            session.add(StockLedger(
                item_type=ItemTypeEnum.FINISHED_GOOD.value,
                product_id=prod.id,
                quantity_delta=spec["opening_pkts"],
                unit="packets",
                valuation_rate=spec["opening_rate"],
                source_type=StockMovementSourceEnum.OPENING_STOCK.value,
                source_document_id=open_extra_doc_id,
                notes=f"Opening stock: {spec['name']} {int(spec['opening_pkts'])} pkts @ ₹{spec['opening_rate']}",
                created_at=t_open,
                created_by=admin_user.id,
            ))

        # ------------------------------------------------------------------
        # 3. Additional Distributors & Supermarkets (Multi-State)
        # ------------------------------------------------------------------
        extra_customers_spec = [
            (
                "Sri Meenakshi Supermarkets Pvt Ltd",
                "M. Sundararajan",
                "9443122334",
                "buyer@meenakshisupermarket.com",
                "210, West Masi Street, Madurai, Tamil Nadu 625001",
                "Tamil Nadu",
                "33AABCS1429B1Z8",
                Decimal("250000.00"),
            ),
            (
                "Kovai Nilgiri Foods & Agencies",
                "S. Balasubramanian",
                "9842211445",
                "accounts@kovainilgiri.in",
                "89, Avinashi Road, Peelamedu, Coimbatore, Tamil Nadu 641004",
                "Tamil Nadu",
                "33AADCK7712M1Z2",
                Decimal("180000.00"),
            ),
            (
                "Namma Mysuru Wholesale Mart",
                "H. R. Raghuveer",
                "9900188776",
                "orders@mysuruwholesale.in",
                "15, Devaraja Market Road, Mysuru, Karnataka 570001",
                "Karnataka",
                "29AAACN8834F1Z4",
                Decimal("150000.00"),
            ),
            (
                "Malabar Heritage Grocers",
                "K. Unnikrishnan",
                "9847055667",
                "supply@malabarheritage.in",
                "32/114, Broadway Market, Ernakulam, Kochi, Kerala 682031",
                "Kerala",
                "32AABCM5519L1Z9",
                Decimal("120000.00"),
            ),
            (
                "Trichy Annai Departmental Stores",
                "R. Thirumalai",
                "9443988112",
                "purchase@annaidept.in",
                "72, Chathiram Bus Stand Road, Tiruchirappalli, Tamil Nadu 620002",
                "Tamil Nadu",
                "33AAECT9021K1Z6",
                Decimal("90000.00"),
            ),
            (
                "Hyderabad Deccan Snacks House",
                "P. Srinivasulu",
                "9849044332",
                "procurement@deccansnacks.in",
                "5-4-182, Begum Bazar, Hyderabad, Telangana 500012",
                "Telangana",
                "36AAACH3192P1Z3",
                Decimal("220000.00"),
            ),
        ]
        for b_name, contact, phone, email, addr, state, gstin, cred in extra_customers_spec:
            c = Customer(
                business_name=b_name,
                contact_person=contact,
                phone=phone,
                email=email,
                address=addr,
                state=state,
                gstin=gstin,
                credit_limit=cred,
                is_active=True,
                created_at=t_open,
            )
            session.add(c)
            customers[b_name] = c
        await session.flush()

        # ------------------------------------------------------------------
        # 4. Inward Purchase Receipts with Exact WAR Recalculation
        # ------------------------------------------------------------------
        async def apply_purchase(code: str, qty: Decimal, rate: Decimal, supplier: str, inv_no: str, days_ago: int):
            mat = materials[code]
            ts = now - timedelta(days=days_ago)
            q_curr = await _get_balance(session, material_id=mat.id)
            r_prev = Decimal(str(mat.current_valuation_rate)).quantize(RATE_PREC)
            tot_q = q_curr + qty
            r_new = (((q_curr * r_prev) + (qty * rate)) / tot_q).quantize(RATE_PREC, rounding=ROUND_HALF_UP)
            mat.current_valuation_rate = r_new
            doc_id = uuid.uuid4()
            session.add(StockLedger(
                item_type=mat.category,
                material_id=mat.id,
                quantity_delta=qty,
                unit=mat.unit,
                valuation_rate=r_new,
                source_type=StockMovementSourceEnum.PURCHASE_RECEIPT.value,
                source_document_id=doc_id,
                notes=f"Purchase Receipt: {qty} {mat.unit} @ ₹{rate}/{mat.unit} (Inv #{inv_no} | {supplier})",
                created_at=ts,
                created_by=admin_user.id,
            ))
            await session.flush()

        await apply_purchase("MAT-FLOUR-01", Decimal("160.0000"), Decimal("45.0000"), "Madurai Cauvery Rice Mills", "MCRM-26-412", 41)
        await apply_purchase("MAT-OIL-01", Decimal("80.0000"), Decimal("144.0000"), "Virudhunagar Chekku Oil Traders", "VCOT-26-108", 39)
        await apply_purchase("MAT-BESAN-01", Decimal("100.0000"), Decimal("81.0000"), "Theni Pulse & Flour Co.", "TPFC-26-229", 36)
        await apply_purchase("MAT-SPICE-01", Decimal("12.0000"), Decimal("205.0000"), "Bodinayakanur Masala House", "BMH-26-087", 32)
        await apply_purchase("PKG-POUCH-200", Decimal("2000.0000"), Decimal("2.4500"), "Sivakasi Flexible Prints", "SFP-26-711", 30)
        await apply_purchase("PKG-CARTON-01", Decimal("100.0000"), Decimal("15.5000"), "Kappalur Corrugated Packs", "KCP-26-504", 29)
        await apply_purchase("MAT-PEANUT-01", Decimal("25.0000"), Decimal("130.0000"), "Pollachi Groundnut Corp", "PGC-26-193", 20)
        await apply_purchase("MAT-FLOUR-01", Decimal("100.0000"), Decimal("44.0000"), "Madurai Cauvery Rice Mills", "MCRM-26-519", 11)
        await apply_purchase("MAT-OIL-01", Decimal("60.0000"), Decimal("142.5000"), "Virudhunagar Chekku Oil Traders", "VCOT-26-245", 6)

        # ------------------------------------------------------------------
        # 5. Historical Production Batches (6 POSTED + 2 DRAFT)
        # ------------------------------------------------------------------
        pouch_mat = materials["PKG-POUCH-200"]
        carton_mat = materials["PKG-CARTON-01"]
        batch_counter = 0

        async def post_batch(
            sku: str,
            planned_qty: Decimal,
            good_out: int,
            damaged: int,
            cartons: int,
            actual_raw: dict,
            labour: Decimal,
            gas: Decimal,
            days_ago: int,
            notes: str,
        ):
            nonlocal batch_counter
            batch_counter += 1
            batch_no = f"BATCH-2026-{batch_counter:04d}"
            ts_create = now - timedelta(days=days_ago, hours=4)
            ts_post = now - timedelta(days=days_ago)
            prod = products[sku]
            bom = boms_by_sku[sku]

            bom_lines_res = (await session.execute(select(BOMLine).where(BOMLine.bom_id == bom.id))).scalars().all()
            mat_by_id = {m.id: m for m in materials.values()}

            run = ProductionRun(
                batch_number=batch_no,
                bom_id=bom.id,
                product_id=prod.id,
                planned_quantity=planned_qty,
                status=ProductionRunStatusEnum.POSTED.value,
                notes=notes,
                created_at=ts_create,
                posted_at=ts_post,
                created_by=supervisor_user.id,
            )
            session.add(run)
            await session.flush()

            mat_cost_total = Decimal("0.00")
            for bl in bom_lines_res:
                m = mat_by_id[bl.material_id]
                if m.category != MaterialCategoryEnum.RAW_MATERIAL.value:
                    continue
                act_q = Decimal(str(actual_raw.get(m.code, bl.planned_quantity))).quantize(QTY_PREC)
                plan_q = Decimal(str(bl.planned_quantity)).quantize(QTY_PREC)
                var_pct = (((act_q - plan_q) / plan_q) * Decimal("100.00")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                rate = Decimal(str(m.current_valuation_rate)).quantize(RATE_PREC)
                mat_cost_total += (act_q * rate).quantize(CURR_PREC, rounding=ROUND_HALF_UP)

                session.add(StockLedger(
                    item_type=m.category,
                    material_id=m.id,
                    quantity_delta=-act_q,
                    unit=m.unit,
                    valuation_rate=rate,
                    source_type=StockMovementSourceEnum.PRODUCTION_ISSUE.value,
                    source_document_id=run.id,
                    notes=f"Production batch {batch_no}: Issued {act_q} {m.unit}",
                    created_at=ts_post,
                    created_by=supervisor_user.id,
                ))
                session.add(ProductionIssue(
                    production_run_id=run.id,
                    material_id=m.id,
                    planned_quantity=plan_q,
                    actual_quantity=act_q,
                    variance_percent=var_pct,
                    valuation_rate_snapshot=rate,
                ))

            total_pouches = good_out + damaged
            pouch_rate = Decimal(str(pouch_mat.current_valuation_rate)).quantize(RATE_PREC)
            carton_rate = Decimal(str(carton_mat.current_valuation_rate)).quantize(RATE_PREC)
            pouch_cost = (Decimal(total_pouches) * pouch_rate).quantize(CURR_PREC, rounding=ROUND_HALF_UP)
            carton_cost = (Decimal(cartons) * carton_rate).quantize(CURR_PREC, rounding=ROUND_HALF_UP)
            pkg_cost_total = (pouch_cost + carton_cost).quantize(CURR_PREC, rounding=ROUND_HALF_UP)

            session.add(StockLedger(
                item_type=pouch_mat.category,
                material_id=pouch_mat.id,
                quantity_delta=-Decimal(total_pouches),
                unit=pouch_mat.unit,
                valuation_rate=pouch_rate,
                source_type=StockMovementSourceEnum.PRODUCTION_ISSUE.value,
                source_document_id=run.id,
                notes=f"Production batch {batch_no}: Pouches consumed ({good_out} good + {damaged} damaged)",
                created_at=ts_post,
                created_by=supervisor_user.id,
            ))
            session.add(StockLedger(
                item_type=carton_mat.category,
                material_id=carton_mat.id,
                quantity_delta=-Decimal(cartons),
                unit=carton_mat.unit,
                valuation_rate=carton_rate,
                source_type=StockMovementSourceEnum.PRODUCTION_ISSUE.value,
                source_document_id=run.id,
                notes=f"Production batch {batch_no}: Cartons consumed ({cartons} pcs)",
                created_at=ts_post,
                created_by=supervisor_user.id,
            ))

            total_cost = (mat_cost_total + pkg_cost_total + labour + gas).quantize(CURR_PREC, rounding=ROUND_HALF_UP)
            cost_pkt = (total_cost / Decimal(good_out)).quantize(CURR_PREC, rounding=ROUND_HALF_UP)
            yield_var = (((Decimal(good_out) - planned_qty) / planned_qty) * Decimal("100.00")).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )

            run.actual_good_output = good_out
            run.yield_variance_percent = yield_var
            run.damaged_pouches = damaged
            run.cartons_used = cartons
            run.loose_packets_exception = max(0, good_out - cartons * 20)
            run.material_cost = mat_cost_total
            run.packaging_cost = pkg_cost_total
            run.labour_cost = labour
            run.gas_power_cost = gas
            run.other_overhead_cost = Decimal("0.00")
            run.total_batch_cost = total_cost
            run.cost_per_packet = cost_pkt

            session.add(StockLedger(
                item_type=ItemTypeEnum.FINISHED_GOOD.value,
                product_id=prod.id,
                quantity_delta=Decimal(good_out),
                unit="packets",
                valuation_rate=cost_pkt,
                source_type=StockMovementSourceEnum.PRODUCTION_OUTPUT.value,
                source_document_id=run.id,
                notes=f"Production batch {batch_no}: Good output {good_out} packets @ ₹{cost_pkt}/pkt",
                created_at=ts_post,
                created_by=supervisor_user.id,
            ))
            await session.flush()
            return run

        await post_batch(
            "MRK-200", Decimal("200.0000"), 188, 6, 9,
            {"MAT-FLOUR-01": "40.0000", "MAT-OIL-01": "10.5000", "MAT-SPICE-01": "1.2000"},
            Decimal("1200.00"), Decimal("600.00"), 35,
            "Murukku morning shift batch — sealing heat spike caused 6 burst pouches & higher oil absorption",
        )
        await post_batch(
            "MIX-200", Decimal("200.0000"), 196, 4, 9,
            {"MAT-BESAN-01": "28.5000", "MAT-PEANUT-01": "8.0000", "MAT-CASHEW-01": "3.1000", "MAT-OIL-01": "11.2000", "MAT-CURRY-01": "1.0000"},
            Decimal("1350.00"), Decimal("650.00"), 28,
            "Madras Mixture export-grade batch #1",
        )
        await post_batch(
            "RBN-200", Decimal("200.0000"), 202, 3, 10,
            {"MAT-FLOUR-01": "24.0000", "MAT-BESAN-01": "16.0000", "MAT-OIL-01": "10.0000", "MAT-SPICE-01": "1.4000"},
            Decimal("1200.00"), Decimal("600.00"), 21,
            "Ribbon Pakoda Diwali & regular stock replenishment — optimal yield",
        )
        await post_batch(
            "KRS-200", Decimal("200.0000"), 194, 5, 9,
            {"MAT-BESAN-01": "34.5000", "MAT-FLOUR-01": "6.0000", "MAT-OIL-01": "9.4000", "MAT-SPICE-01": "1.5000"},
            Decimal("1150.00"), Decimal("580.00"), 14,
            "Pepper Kara Sev extruder run #4",
        )
        await post_batch(
            "MIX-200", Decimal("200.0000"), 190, 6, 9,
            {"MAT-BESAN-01": "28.0000", "MAT-PEANUT-01": "8.2000", "MAT-CASHEW-01": "3.1000", "MAT-OIL-01": "11.5000", "MAT-CURRY-01": "1.0500"},
            Decimal("1350.00"), Decimal("660.00"), 8,
            "Madras Mixture run #2 — oil variance flagged (+4.55%)",
        )
        await post_batch(
            "THT-200", Decimal("200.0000"), 198, 2, 9,
            {"MAT-FLOUR-01": "36.0000", "MAT-OIL-01": "8.5000", "MAT-CURRY-01": "0.8000", "MAT-SPICE-01": "1.2000"},
            Decimal("1100.00"), Decimal("550.00"), 4,
            "Garlic Thattai crisp fry batch — low scrap",
        )

        # 2 Scheduled DRAFT Runs for live floor execution
        for idx, (sku, note) in enumerate([
            ("MRK-200", "Morning Shift Line A — Madurai & Chennai replenishment"),
            ("RBN-200", "Afternoon Shift Line B — Ribbon Pakoda scheduled batch"),
        ], start=1):
            batch_counter += 1
            session.add(ProductionRun(
                batch_number=f"BATCH-2026-{batch_counter:04d}",
                bom_id=boms_by_sku[sku].id,
                product_id=products[sku].id,
                planned_quantity=Decimal("200.0000"),
                status=ProductionRunStatusEnum.DRAFT.value,
                notes=note,
                created_at=now - timedelta(hours=3 - idx),
                created_by=supervisor_user.id,
            ))

        # ------------------------------------------------------------------
        # 6. Sales Orders, Invoices, Dispatches & Payments
        # ------------------------------------------------------------------
        order_counter = 0
        inv_counter = 0
        dsp_counter = 0
        pay_counter = 0

        async def create_order_workflow(
            cust_name: str,
            salesman: User,
            line_specs: list,  # [(sku, qty)]
            target_status: str,  # PENDING, APPROVED, INVOICED, DISPATCHED
            days_ago: int,
            notes: str,
            payment_specs: list = None,  # [(amount, method, ref, days_ago_paid)]
        ):
            nonlocal order_counter, inv_counter, dsp_counter, pay_counter
            order_counter += 1
            order_no = f"SO-2026-{order_counter:04d}"
            cust = customers[cust_name]
            ts_order = now - timedelta(days=days_ago)

            tot_taxable = Decimal("0.00")
            tot_cgst = Decimal("0.00")
            tot_sgst = Decimal("0.00")
            tot_igst = Decimal("0.00")
            order_items = []

            for sku, qty in line_specs:
                prod = products[sku]
                unit_p = Decimal(str(prod.base_selling_price)).quantize(CURR_PREC)
                taxable = (Decimal(qty) * unit_p).quantize(CURR_PREC, rounding=ROUND_HALF_UP)
                cgst_i, sgst_i, igst_i = InvoiceService.calculate_gst_breakup(taxable, prod.gst_rate_percent, cust.state)
                item_tax = (cgst_i + sgst_i + igst_i).quantize(CURR_PREC, rounding=ROUND_HALF_UP)

                tot_taxable += taxable
                tot_cgst += cgst_i
                tot_sgst += sgst_i
                tot_igst += igst_i

                order_items.append(SalesOrderItem(
                    product_id=prod.id,
                    quantity=qty,
                    unit_price=unit_p,
                    taxable_amount=taxable,
                    tax_amount=item_tax,
                    line_total=taxable + item_tax,
                ))

            tot_tax = (tot_cgst + tot_sgst + tot_igst).quantize(CURR_PREC)
            tot_order = (tot_taxable + tot_tax).quantize(CURR_PREC)

            order = SalesOrder(
                order_number=order_no,
                customer_id=cust.id,
                salesman_id=salesman.id,
                status=target_status,
                idempotency_key=f"mock-seed-{order_no.lower()}",
                total_taxable_amount=tot_taxable,
                total_tax_amount=tot_tax,
                total_order_amount=tot_order,
                notes=notes,
                created_at=ts_order,
                updated_at=ts_order,
                items=order_items,
            )
            session.add(order)
            await session.flush()

            if target_status in (SalesOrderStatusEnum.INVOICED.value, SalesOrderStatusEnum.DISPATCHED.value):
                inv_counter += 1
                inv_no = f"INV-2026-27/{inv_counter:04d}"
                ts_inv = ts_order + timedelta(hours=6)
                paid_total = sum((p[0] for p in (payment_specs or [])), Decimal("0.00"))
                if paid_total >= tot_order:
                    inv_status = InvoiceStatusEnum.PAID.value
                elif paid_total > Decimal("0.00"):
                    inv_status = InvoiceStatusEnum.PARTIALLY_PAID.value
                else:
                    inv_status = InvoiceStatusEnum.ISSUED.value

                invoice = Invoice(
                    invoice_number=inv_no,
                    order_id=order.id,
                    customer_id=cust.id,
                    customer_state=cust.state,
                    customer_gstin=cust.gstin,
                    taxable_amount=tot_taxable,
                    cgst_amount=tot_cgst,
                    sgst_amount=tot_sgst,
                    igst_amount=tot_igst,
                    total_amount=tot_order,
                    paid_amount=paid_total,
                    status=inv_status,
                    created_at=ts_inv,
                )
                session.add(invoice)
                await session.flush()

                if target_status == SalesOrderStatusEnum.DISPATCHED.value:
                    dsp_counter += 1
                    dsp_no = f"DSP-2026-{dsp_counter:04d}"
                    ts_dsp = ts_order + timedelta(days=1)
                    session.add(Dispatch(
                        dispatch_number=dsp_no,
                        order_id=order.id,
                        invoice_id=invoice.id,
                        dispatched_by=admin_user.id,
                        dispatched_at=ts_dsp,
                    ))
                    for sku, qty in line_specs:
                        prod = products[sku]
                        session.add(StockLedger(
                            item_type=ItemTypeEnum.FINISHED_GOOD.value,
                            product_id=prod.id,
                            quantity_delta=-Decimal(qty),
                            unit="packets",
                            valuation_rate=prod.base_selling_price,
                            source_type=StockMovementSourceEnum.SALES_DISPATCH.value,
                            source_document_id=invoice.id,
                            notes=f"Dispatch for Invoice #{inv_no} (Order #{order_no})",
                            created_at=ts_dsp,
                            created_by=admin_user.id,
                        ))

                for pay_amt, method, ref, pay_days_ago in (payment_specs or []):
                    pay_counter += 1
                    ts_pay = now - timedelta(days=pay_days_ago)
                    session.add(Payment(
                        payment_number=f"PAY-2026-{pay_counter:04d}",
                        invoice_id=invoice.id,
                        customer_id=cust.id,
                        amount=pay_amt,
                        payment_method=method,
                        reference_number=ref,
                        payment_date=ts_pay.date(),
                        recorded_by=accountant_user.id,
                        created_at=ts_pay,
                    ))

        # 4 DISPATCHED Orders (including 36-day aging bucket & multi-state GST)
        await create_order_workflow(
            "Kovai Nilgiri Foods & Agencies",
            salesman_a,
            [("MRK-200", 120), ("RBN-200", 100)],
            SalesOrderStatusEnum.DISPATCHED.value,
            38,
            "Coimbatore wholesale supply — TN-38 route truck",
            payment_specs=[(Decimal("8000.00"), PaymentMethodEnum.BANK_TRANSFER.value, "NEFT-KVB-44109", 25)],
        )
        await create_order_workflow(
            "Sri Meenakshi Supermarkets Pvt Ltd",
            salesman_a,
            [("MIX-200", 160), ("KRS-200", 80)],
            SalesOrderStatusEnum.DISPATCHED.value,
            24,
            "Madurai festival retail display stock",
            payment_specs=[(Decimal("14448.00"), PaymentMethodEnum.BANK_TRANSFER.value, "RTGS-IOB-78211", 15)],
        )
        await create_order_workflow(
            "Distributor B (Bengaluru Snacks)",
            salesman_b,
            [("MIX-200", 150), ("RBN-200", 80)],
            SalesOrderStatusEnum.DISPATCHED.value,
            14,
            "Bengaluru Chikpet hub delivery — interstate 5% IGST",
            payment_specs=[(Decimal("7500.00"), PaymentMethodEnum.UPI.value, "UPI-43198022174", 6)],
        )
        await create_order_workflow(
            "Malabar Heritage Grocers",
            salesman_b,
            [("THT-200", 140), ("KRS-200", 60)],
            SalesOrderStatusEnum.DISPATCHED.value,
            7,
            "Kochi Broadway store consignment via Palakkad highway",
            payment_specs=[(Decimal("5000.00"), PaymentMethodEnum.CHEQUE.value, "CHQ-FED-009412", 2)],
        )

        # 2 INVOICED Orders (1 ready to dispatch, 1 triggering Shortage Guardrail on Garlic Thattai)
        await create_order_workflow(
            "Retailer A (Chennai Grocers)",
            salesman_a,
            [("MRK-200", 80), ("MIX-200", 60)],
            SalesOrderStatusEnum.INVOICED.value,
            3,
            "T. Nagar retail replenishment — vehicle slot confirmed",
        )
        await create_order_workflow(
            "Hyderabad Deccan Snacks House",
            salesman_b,
            [("THT-200", 120)],  # Available is 78 pkts -> Shortage of 42 pkts!
            SalesOrderStatusEnum.INVOICED.value,
            2,
            "Begum Bazar bulk indent — awaiting next Thattai batch before dispatch",
        )

        # 2 APPROVED Orders (awaiting GST Tax Invoice generation)
        await create_order_workflow(
            "Trichy Annai Departmental Stores",
            salesman_a,
            [("KRS-200", 60), ("RBN-200", 40)],
            SalesOrderStatusEnum.APPROVED.value,
            1,
            "Approved for morning billing desk",
        )
        await create_order_workflow(
            "Namma Mysuru Wholesale Mart",
            salesman_b,
            [("MIX-200", 70)],
            SalesOrderStatusEnum.APPROVED.value,
            1,
            "Approved Interstate KA indent",
        )

        # 3 PENDING Orders (fresh in Admin Order Inbox)
        await create_order_workflow(
            "Sri Meenakshi Supermarkets Pvt Ltd",
            salesman_a,
            [("MRK-200", 60), ("THT-200", 50)],
            SalesOrderStatusEnum.PENDING.value,
            0,
            "Urgent store branch restock booked via Salesman PWA",
        )
        await create_order_workflow(
            "Malabar Heritage Grocers",
            salesman_b,
            [("MIX-200", 80)],
            SalesOrderStatusEnum.PENDING.value,
            0,
            "Weekend Onam counter booking — Kochi",
        )
        await create_order_workflow(
            "Retailer A (Chennai Grocers)",
            salesman_a,
            [("RBN-200", 50), ("KRS-200", 40)],
            SalesOrderStatusEnum.PENDING.value,
            0,
            "Fast-moving evening snacks indent",
        )

        # ------------------------------------------------------------------
        # 7. Real Committed Outbox Event Log Entries (PostgreSQL backed)
        # ------------------------------------------------------------------
        outbox_entries = [
            (
                "PRODUCTION_POSTED",
                "production",
                {"batch_number": "BATCH-2026-0006", "product_name": "Garlic Thattai 200g", "good_output": 198, "yield_variance_percent": -1.00},
                now - timedelta(days=4),
            ),
            (
                "STOCK_UPDATED",
                "stock",
                {"code": "MAT-OIL-01", "name": "Refined Cooking Oil", "quantity_added": 60.0, "source": "PURCHASE_RECEIPT"},
                now - timedelta(days=6),
            ),
            (
                "PAYMENT_RECEIVED",
                "finance",
                {"payment_number": "PAY-2026-0004", "customer_name": "Malabar Heritage Grocers", "amount": 5000.0},
                now - timedelta(days=2),
            ),
            (
                "DISPATCH_COMPLETED",
                "role:admin",
                {"dispatch_number": "DSP-2026-0004", "customer_name": "Malabar Heritage Grocers", "dispatched_quantity": 200},
                now - timedelta(days=5),
            ),
            (
                "ORDER_CREATED",
                "role:admin",
                {"order_number": "SO-2026-0009", "customer_name": "Sri Meenakshi Supermarkets Pvt Ltd", "total_amount": 5670.0},
                now - timedelta(hours=4),
            ),
            (
                "ORDER_CREATED",
                "role:admin",
                {"order_number": "SO-2026-0011", "customer_name": "Retailer A (Chennai Grocers)", "total_amount": 5071.5},
                now - timedelta(minutes=35),
            ),
        ]
        for ev_type, ch, payload, ts in outbox_entries:
            session.add(OutboxEvent(
                event_type=ev_type,
                channel=ch,
                payload=payload,
                status=OutboxStatusEnum.PUBLISHED.value,
                created_at=ts,
                published_at=ts + timedelta(seconds=2),
            ))

        await session.commit()
        print("✅ Seeded 9 materials, 5 South Indian snack products with BOMs, and 8 multi-state customers.")
        print("✅ Seeded 9 inward purchase receipts with Weighted-Average Rate updates.")
        print("✅ Seeded 8 production runs (6 POSTED + 2 DRAFT) with BOM issues & variance alerts.")
        print("✅ Seeded 11 sales orders (4 DISPATCHED, 2 INVOICED, 2 APPROVED, 3 PENDING), 6 invoices, 4 payments.")
        print("🎉 Annapurna realistic manufacturing ERP mock dataset ready!")


if __name__ == "__main__":
    asyncio.run(run_mock_seed())
