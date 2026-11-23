import asyncio
import uuid
from decimal import Decimal
from datetime import datetime, timezone
from sqlalchemy import select, delete
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.user import User, RoleEnum
from app.models.master import Material, MaterialCategoryEnum, Product, BOM, BOMLine, Customer
from app.models.inventory import StockLedger, ItemTypeEnum, StockMovementSourceEnum
from app.models.production import ProductionRun, ProductionIssue
from app.models.sales import SalesOrder, SalesOrderItem, Invoice, Dispatch
from app.models.finance import Payment
from app.models.outbox import OutboxEvent

async def run_seed():
    print("🌱 Starting Annapurna canonical seed process...")
    async with AsyncSessionLocal() as session:
        # Clear transactional tables first to ensure clean idempotency
        await session.execute(delete(Payment))
        await session.execute(delete(Dispatch))
        await session.execute(delete(Invoice))
        await session.execute(delete(SalesOrderItem))
        await session.execute(delete(SalesOrder))
        await session.execute(delete(ProductionIssue))
        await session.execute(delete(ProductionRun))
        await session.execute(delete(StockLedger))
        await session.execute(delete(BOMLine))
        await session.execute(delete(BOM))
        await session.execute(delete(Product))
        await session.execute(delete(Material))
        await session.execute(delete(Customer))
        await session.execute(delete(OutboxEvent))
        await session.execute(delete(User))
        await session.commit()
        print("🧹 Existing records cleaned for repeatable benchmark state.")

        # 1. Seed Users
        users_data = [
            ("admin", "admin@annapurna.internal", "Admin123!", "Kalyanasundaram (Factory Admin)", "9840100001", RoleEnum.ADMIN.value),
            ("salesman_a", "sales_a@annapurna.internal", "Salesman123!", "Senthil Kumar (Salesman A)", "9840100002", RoleEnum.SALESMAN.value),
            ("salesman_b", "sales_b@annapurna.internal", "Salesman123!", "Venkatesh Rao (Salesman B)", "9840100003", RoleEnum.SALESMAN.value),
            ("supervisor", "production@annapurna.internal", "Supervisor123!", "Muthuvel (Production Supervisor)", "9840100004", RoleEnum.PRODUCTION_SUPERVISOR.value),
            ("owner", "owner@annapurna.internal", "Owner123!", "Annapurna Sundaram (Owner)", "9840100005", RoleEnum.OWNER.value),
            ("accountant", "accountant@annapurna.internal", "Accountant123!", "Ramanathan (Accountant/Auditor)", "9840100006", RoleEnum.ACCOUNTANT.value),
        ]
        created_users = {}
        for username, email, pwd, name, phone, role in users_data:
            user = User(
                username=username,
                email=email,
                hashed_password=hash_password(pwd),
                full_name=name,
                phone=phone,
                role=role,
                is_active=True
            )
            session.add(user)
            created_users[username] = user
        await session.flush()
        print(f"✅ Seeded {len(created_users)} users across all required roles.")

        # 2. Seed Customers
        customers_data = [
            ("Retailer A (Chennai Grocers)", "A. Raman", "9841234567", "Tamil Nadu", "33AAAAA0000A1Z5", Decimal("100000.00")),
            ("Distributor B (Bengaluru Snacks)", "B. Krishna", "9881234567", "Karnataka", "29BBBBB0000B1Z5", Decimal("200000.00")),
        ]
        created_customers = {}
        for b_name, contact, phone, state, gstin, cred in customers_data:
            cust = Customer(
                business_name=b_name,
                contact_person=contact,
                phone=phone,
                state=state,
                gstin=gstin,
                credit_limit=cred,
                is_active=True
            )
            session.add(cust)
            created_customers[b_name] = cust
        await session.flush()
        print(f"✅ Seeded {len(created_customers)} benchmark customers (Tamil Nadu & Karnataka).")

        # 3. Seed Materials
        materials_data = [
            ("MAT-FLOUR-01", "Rice Flour Grade A", MaterialCategoryEnum.RAW_MATERIAL.value, "kg", Decimal("42.0000"), Decimal("20.0000")),
            ("MAT-OIL-01", "Refined Cooking Oil", MaterialCategoryEnum.RAW_MATERIAL.value, "L", Decimal("140.0000"), Decimal("10.0000")),
            ("MAT-SPICE-01", "Salt and Spice Master Mix", MaterialCategoryEnum.RAW_MATERIAL.value, "kg", Decimal("200.0000"), Decimal("2.0000")),
            ("PKG-POUCH-200", "Murukku 200g Printed Pouch", MaterialCategoryEnum.PACKAGING.value, "pieces", Decimal("2.5000"), Decimal("100.0000")),
            ("PKG-CARTON-01", "Corrugated Carton Box (20 pkts)", MaterialCategoryEnum.PACKAGING.value, "pieces", Decimal("15.0000"), Decimal("10.0000")),
        ]
        created_materials = {}
        for code, name, cat, unit, rate, threshold in materials_data:
            mat = Material(
                code=code,
                name=name,
                category=cat,
                unit=unit,
                current_valuation_rate=rate,
                minimum_threshold=threshold,
                is_active=True
            )
            session.add(mat)
            created_materials[code] = mat
        await session.flush()
        print(f"✅ Seeded {len(created_materials)} materials (Flour, Oil, Spices, Pouches, Cartons).")

        # 4. Seed Product (Murukku 200g)
        product = Product(
            sku="MRK-200",
            name="Murukku 200g",
            pack_size_grams=200,
            hsn_code="190590",
            gst_rate_percent=Decimal("5.00"),
            base_selling_price=Decimal("50.00"),
            minimum_threshold=50,
            is_active=True
        )
        session.add(product)
        await session.flush()
        print("✅ Seeded product MRK-200 (Murukku 200g, HSN 190590, Base ₹50.00).")

        # 5. Seed BOM for MRK-200 (Standard 1 batch = 200 packets)
        bom = BOM(
            product_id=product.id,
            version="v1.0",
            batch_output_units=Decimal("200.0000"),
            is_active=True
        )
        session.add(bom)
        await session.flush()

        bom_lines_data = [
            (created_materials["MAT-FLOUR-01"].id, Decimal("40.0000"), "kg"),
            (created_materials["MAT-OIL-01"].id, Decimal("10.0000"), "L"),
            (created_materials["MAT-SPICE-01"].id, Decimal("1.2000"), "kg"),
            (created_materials["PKG-POUCH-200"].id, Decimal("200.0000"), "pieces"),
            (created_materials["PKG-CARTON-01"].id, Decimal("10.0000"), "pieces"),
        ]
        for mat_id, planned_qty, unit in bom_lines_data:
            b_line = BOMLine(
                bom_id=bom.id,
                material_id=mat_id,
                planned_quantity=planned_qty,
                unit=unit
            )
            session.add(b_line)
        await session.flush()
        print("✅ Seeded BOM v1.0 for Murukku 200g (Batch output 200 pkts).")

        # 6. Seed Opening Stock in Stock Ledger
        system_admin_id = created_users["admin"].id
        opening_doc_id = uuid.uuid4()
        
        opening_stock_entries = [
            # Raw Materials
            (ItemTypeEnum.RAW_MATERIAL.value, created_materials["MAT-FLOUR-01"].id, None, Decimal("100.0000"), "kg", Decimal("42.0000"), "Opening stock: Flour 100 kg @ ₹42"),
            (ItemTypeEnum.RAW_MATERIAL.value, created_materials["MAT-OIL-01"].id, None, Decimal("30.0000"), "L", Decimal("140.0000"), "Opening stock: Oil 30 L @ ₹140"),
            (ItemTypeEnum.RAW_MATERIAL.value, created_materials["MAT-SPICE-01"].id, None, Decimal("5.0000"), "kg", Decimal("200.0000"), "Opening stock: Spice Mix 5 kg @ ₹200"),
            # Packaging Materials
            (ItemTypeEnum.PACKAGING.value, created_materials["PKG-POUCH-200"].id, None, Decimal("500.0000"), "pieces", Decimal("2.5000"), "Opening stock: 200g Pouches 500 pcs @ ₹2.50"),
            (ItemTypeEnum.PACKAGING.value, created_materials["PKG-CARTON-01"].id, None, Decimal("30.0000"), "pieces", Decimal("15.0000"), "Opening stock: Cartons 30 pcs @ ₹15"),
            # Finished Goods
            (ItemTypeEnum.FINISHED_GOOD.value, None, product.id, Decimal("50.0000"), "packets", Decimal("30.0000"), "Opening stock: Finished Murukku 50 pkts @ ₹30"),
        ]

        for item_type, mat_id, prod_id, qty, unit, rate, notes in opening_stock_entries:
            ledger_entry = StockLedger(
                item_type=item_type,
                material_id=mat_id,
                product_id=prod_id,
                quantity_delta=qty,
                unit=unit,
                valuation_rate=rate,
                source_type=StockMovementSourceEnum.OPENING_STOCK.value,
                source_document_id=opening_doc_id,
                notes=notes,
                created_by=system_admin_id
            )
            session.add(ledger_entry)
        
        await session.commit()
        print("✅ Seeded opening stock movements into immutable stock ledger:")
        print("   - Flour: 100 kg")
        print("   - Oil: 30 L")
        print("   - Spice mix: 5 kg")
        print("   - Pouches: 500 pcs")
        print("   - Cartons: 30 pcs")
        print("   - Finished Murukku: 50 packets")
        print("🎉 Canonical benchmark seed complete!")

if __name__ == "__main__":
    asyncio.run(run_seed())
