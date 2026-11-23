import uuid
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.models.user import User
from app.models.master import Material, MaterialCategoryEnum, Product, BOM, BOMLine
from app.models.production import ProductionRun, ProductionRunStatusEnum, ProductionIssue
from app.models.inventory import StockLedger, ItemTypeEnum, StockMovementSourceEnum
from app.models.outbox import OutboxEvent, OutboxStatusEnum
from app.services.stock_service import StockService
from app.schemas.production import (
    ProductionRunCreate,
    ProductionRunPost,
    ProductionRunResponse,
    ProductionVarianceItem
)

QUANTITY_PRECISION = Decimal("0.0001")
RATE_PRECISION = Decimal("0.0001")
CURRENCY_PRECISION = Decimal("0.01")
VARIANCE_TOLERANCE_PERCENT = Decimal("3.00")

class ProductionService:
    @staticmethod
    async def create_draft_run(
        db: AsyncSession,
        data: ProductionRunCreate,
        user_id: uuid.UUID
    ) -> ProductionRun:
        """Initializes a new production run in DRAFT status."""
        stmt = select(BOM).where(BOM.id == data.bom_id, BOM.is_active == True).options(selectinload(BOM.lines))
        res = await db.execute(stmt)
        bom = res.scalar_one_or_none()
        if not bom:
            raise HTTPException(status_code=404, detail="Active BOM not found")

        # Generate unique batch number (e.g. BATCH-2026-0001)
        count_stmt = select(func.count(ProductionRun.id))
        count_res = await db.execute(count_stmt)
        seq = count_res.scalar_one() + 1
        batch_no = f"BATCH-2026-{seq:04d}"

        planned_qty = data.planned_quantity or bom.batch_output_units

        run = ProductionRun(
            batch_number=batch_no,
            bom_id=bom.id,
            product_id=bom.product_id,
            planned_quantity=planned_qty,
            status=ProductionRunStatusEnum.DRAFT.value,
            notes=data.notes,
            created_by=user_id
        )
        db.add(run)
        await db.commit()
        await db.refresh(run)
        return run

    @staticmethod
    async def post_production_run(
        db: AsyncSession,
        run_id: uuid.UUID,
        post_data: ProductionRunPost,
        user_id: uuid.UUID
    ) -> ProductionRunResponse:
        """
        ATOMIC PRODUCTION POSTING TRANSACTION:
        1. Validates material and packaging stock availability under lock.
        2. Deducts issued raw materials from stock ledger (PRODUCTION_ISSUE).
        3. Deducts consumed packaging (good pouches + damaged pouches, cartons) from stock ledger (PRODUCTION_ISSUE).
        4. Credits finished goods to stock ledger (PRODUCTION_OUTPUT).
        5. Computes Yield and Material Consumption Variances (flags if > 3%).
        6. Computes Weighted-Average Production Cost & Unit Cost per Packet.
        7. Records audit issues in production_issues.
        8. Transitions production run to POSTED status.
        9. Queues Outbox event PRODUCTION_POSTED.
        All operations commit together or roll back atomically.
        """
        # 1. Fetch Production Run with lock
        stmt = (
            select(ProductionRun)
            .where(ProductionRun.id == run_id)
            .options(
                selectinload(ProductionRun.bom).selectinload(BOM.lines).selectinload(BOMLine.material),
                selectinload(ProductionRun.product),
                selectinload(ProductionRun.creator)
            )
            .with_for_update()
        )
        res = await db.execute(stmt)
        run = res.scalar_one_or_none()
        if not run:
            raise HTTPException(status_code=404, detail="Production run not found")
        if run.status == ProductionRunStatusEnum.POSTED.value:
            raise HTTPException(status_code=400, detail="Production run is already posted")

        bom = run.bom
        product = run.product
        planned_units = Decimal(str(run.planned_quantity))

        # 2. Map BOM lines for planned recipe scaling
        bom_map = {line.material_id: line for line in bom.lines}

        # 3. Process Raw Material Issues & Variances
        material_cost_total = Decimal("0.00")
        variances_list: List[ProductionVarianceItem] = []
        issue_records: List[ProductionIssue] = []

        # Find Packaging materials (Pouch and Carton)
        pouch_mat_stmt = select(Material).where(Material.category == MaterialCategoryEnum.PACKAGING.value, Material.unit == "pieces")
        pouch_res = await db.execute(pouch_mat_stmt)
        packaging_mats = {m.code: m for m in pouch_res.scalars().all()}
        
        pouch_material = packaging_mats.get("PKG-POUCH-200")
        carton_material = packaging_mats.get("PKG-CARTON-01")

        if not pouch_material or not carton_material:
            raise HTTPException(status_code=500, detail="Required packaging materials (PKG-POUCH-200, PKG-CARTON-01) not configured")

        # Map actual issue inputs
        issues_input_map = {item.material_id: item.actual_quantity for item in post_data.material_issues}

        for line in bom.lines:
            mat = line.material
            # Process only raw materials in this loop (packaging is accounted separately via actual output + damage)
            if mat.category != MaterialCategoryEnum.RAW_MATERIAL.value:
                continue

            planned_qty = line.planned_quantity
            # If the material was explicitly provided in actual issues:
            if mat.id in issues_input_map:
                actual_qty = Decimal(str(issues_input_map[mat.id])).quantize(QUANTITY_PRECISION, rounding=ROUND_HALF_UP)
            else:
                actual_qty = planned_qty

            # Check available stock
            current_bal = await StockService.get_item_balance(db, material_id=mat.id)
            if current_bal < actual_qty:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Insufficient stock for material '{mat.name}': Required {actual_qty} {mat.unit}, Available {current_bal} {mat.unit}"
                )

            # Consumption Variance %: ((Actual - Planned) / Planned) * 100
            if planned_qty > Decimal("0.0000"):
                var_pct = (((actual_qty - planned_qty) / planned_qty) * Decimal("100.00")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            else:
                var_pct = Decimal("0.00")

            is_alert = abs(var_pct) > VARIANCE_TOLERANCE_PERCENT
            rate = Decimal(str(mat.current_valuation_rate)).quantize(RATE_PRECISION)
            line_cost = (actual_qty * rate).quantize(CURRENCY_PRECISION, rounding=ROUND_HALF_UP)
            material_cost_total += line_cost

            # Record stock ledger movement (Issue deduction)
            await StockService.record_movement(
                db=db,
                item_type=mat.category,
                quantity_delta=-actual_qty,
                unit=mat.unit,
                valuation_rate=rate,
                source_type=StockMovementSourceEnum.PRODUCTION_ISSUE.value,
                source_document_id=run.id,
                created_by=user_id,
                material_id=mat.id,
                notes=f"Production batch {run.batch_number}: Issued {actual_qty} {mat.unit}"
            )

            # Create ProductionIssue record for audit
            issue_rec = ProductionIssue(
                production_run_id=run.id,
                material_id=mat.id,
                planned_quantity=planned_qty,
                actual_quantity=actual_qty,
                variance_percent=var_pct,
                valuation_rate_snapshot=rate
            )
            issue_records.append(issue_rec)

            variances_list.append(
                ProductionVarianceItem(
                    material_id=mat.id,
                    item_name=mat.name,
                    item_code=mat.code,
                    unit=mat.unit,
                    planned_quantity=planned_qty,
                    actual_quantity=actual_qty,
                    variance_percent=var_pct,
                    is_alert=is_alert,
                    valuation_rate=rate,
                    line_cost=line_cost
                )
            )

        # 4. Packaging Accounting & Consumption
        good_output = post_data.actual_good_output
        damaged_pouches = post_data.damaged_pouches
        total_pouches_consumed = good_output + damaged_pouches
        cartons_used = post_data.cartons_used

        # Check packaging stock availability
        pouch_stock = await StockService.get_item_balance(db, material_id=pouch_material.id)
        if pouch_stock < Decimal(total_pouches_consumed):
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient pouches: Required {total_pouches_consumed}, Available {pouch_stock}"
            )
        carton_stock = await StockService.get_item_balance(db, material_id=carton_material.id)
        if carton_stock < Decimal(cartons_used):
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient cartons: Required {cartons_used}, Available {carton_stock}"
            )

        # Deduct Pouches from stock ledger
        pouch_rate = Decimal(str(pouch_material.current_valuation_rate)).quantize(RATE_PRECISION)
        pouch_cost = (Decimal(total_pouches_consumed) * pouch_rate).quantize(CURRENCY_PRECISION, rounding=ROUND_HALF_UP)
        await StockService.record_movement(
            db=db,
            item_type=pouch_material.category,
            quantity_delta=-Decimal(total_pouches_consumed),
            unit=pouch_material.unit,
            valuation_rate=pouch_rate,
            source_type=StockMovementSourceEnum.PRODUCTION_ISSUE.value,
            source_document_id=run.id,
            created_by=user_id,
            material_id=pouch_material.id,
            notes=f"Production batch {run.batch_number}: Pouches consumed ({good_output} good + {damaged_pouches} damaged)"
        )

        # Deduct Cartons from stock ledger
        carton_rate = Decimal(str(carton_material.current_valuation_rate)).quantize(RATE_PRECISION)
        carton_cost = (Decimal(cartons_used) * carton_rate).quantize(CURRENCY_PRECISION, rounding=ROUND_HALF_UP)
        await StockService.record_movement(
            db=db,
            item_type=carton_material.category,
            quantity_delta=-Decimal(cartons_used),
            unit=carton_material.unit,
            valuation_rate=carton_rate,
            source_type=StockMovementSourceEnum.PRODUCTION_ISSUE.value,
            source_document_id=run.id,
            created_by=user_id,
            material_id=carton_material.id,
            notes=f"Production batch {run.batch_number}: Cartons consumed ({cartons_used} pcs)"
        )

        packaging_cost_total = (pouch_cost + carton_cost).quantize(CURRENCY_PRECISION, rounding=ROUND_HALF_UP)

        # Packaging Loose Exception (each carton holds 20 packets)
        carton_capacity = cartons_used * 20
        loose_packets = max(0, good_output - carton_capacity)

        # 5. Overheads & Total Production Cost
        labour = Decimal(str(post_data.labour_cost)).quantize(CURRENCY_PRECISION)
        gas_power = Decimal(str(post_data.gas_power_cost)).quantize(CURRENCY_PRECISION)
        other_overheads = Decimal(str(post_data.other_overhead_cost)).quantize(CURRENCY_PRECISION)

        total_batch_cost = (material_cost_total + packaging_cost_total + labour + gas_power + other_overheads).quantize(
            CURRENCY_PRECISION, rounding=ROUND_HALF_UP
        )

        if good_output > 0:
            cost_per_packet = (total_batch_cost / Decimal(good_output)).quantize(CURRENCY_PRECISION, rounding=ROUND_HALF_UP)
        else:
            cost_per_packet = Decimal("0.00")

        # 6. Yield Variance %: ((Actual Good Output - Planned Output) / Planned Output) * 100
        yield_var = (((Decimal(good_output) - planned_units) / planned_units) * Decimal("100.00")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        is_yield_alert = abs(yield_var) > VARIANCE_TOLERANCE_PERCENT

        # 7. Credit Finished Goods in Stock Ledger
        await StockService.record_movement(
            db=db,
            item_type=ItemTypeEnum.FINISHED_GOOD.value,
            quantity_delta=Decimal(good_output),
            unit="packets",
            valuation_rate=cost_per_packet,
            source_type=StockMovementSourceEnum.PRODUCTION_OUTPUT.value,
            source_document_id=run.id,
            created_by=user_id,
            product_id=product.id,
            notes=f"Production batch {run.batch_number}: Good output {good_output} packets @ ₹{cost_per_packet}/pkt"
        )

        # 8. Update Production Run Record
        now_utc = datetime.now(timezone.utc)
        run.actual_good_output = good_output
        run.yield_variance_percent = yield_var
        run.damaged_pouches = damaged_pouches
        run.cartons_used = cartons_used
        run.loose_packets_exception = loose_packets
        run.material_cost = material_cost_total
        run.packaging_cost = packaging_cost_total
        run.labour_cost = labour
        run.gas_power_cost = gas_power
        run.other_overhead_cost = other_overheads
        run.total_batch_cost = total_batch_cost
        run.cost_per_packet = cost_per_packet
        run.status = ProductionRunStatusEnum.POSTED.value
        run.posted_at = now_utc
        if post_data.notes:
            run.notes = f"{run.notes or ''} | {post_data.notes}"

        for rec in issue_records:
            db.add(rec)

        # 9. Queue Realtime Outbox Event
        outbox_event = OutboxEvent(
            event_type="PRODUCTION_POSTED",
            channel="production",
            payload={
                "run_id": str(run.id),
                "batch_number": run.batch_number,
                "product_name": product.name,
                "good_output": good_output,
                "cost_per_packet": float(cost_per_packet),
                "total_batch_cost": float(total_batch_cost),
                "yield_variance_percent": float(yield_var),
                "is_yield_alert": is_yield_alert
            },
            status=OutboxStatusEnum.PENDING.value
        )
        db.add(outbox_event)

        # Atomic commit
        await db.commit()
        await db.refresh(run)

        # Fetch creator username
        creator_stmt = select(User).where(User.id == run.created_by)
        creator_res = await db.execute(creator_stmt)
        creator_user = creator_res.scalar_one()

        return ProductionRunResponse(
            id=run.id,
            batch_number=run.batch_number,
            bom_id=run.bom_id,
            product_id=run.product_id,
            product_name=product.name,
            product_sku=product.sku,
            planned_quantity=run.planned_quantity,
            actual_good_output=run.actual_good_output,
            yield_variance_percent=run.yield_variance_percent,
            is_yield_alert=is_yield_alert,
            damaged_pouches=run.damaged_pouches,
            total_pouches_consumed=total_pouches_consumed,
            cartons_used=run.cartons_used,
            loose_packets_exception=run.loose_packets_exception,
            material_cost=run.material_cost,
            packaging_cost=run.packaging_cost,
            labour_cost=run.labour_cost,
            gas_power_cost=run.gas_power_cost,
            other_overhead_cost=run.other_overhead_cost,
            total_batch_cost=run.total_batch_cost,
            cost_per_packet=run.cost_per_packet,
            status=run.status,
            posted_at=run.posted_at,
            created_at=run.created_at,
            created_by_name=creator_user.full_name,
            variances=variances_list
        )

    @staticmethod
    async def list_runs(db: AsyncSession, limit: int = 50, offset: int = 0) -> List[ProductionRunResponse]:
        """Lists historical production runs with full details."""
        stmt = (
            select(ProductionRun)
            .options(
                selectinload(ProductionRun.product),
                selectinload(ProductionRun.creator),
                selectinload(ProductionRun.issues).selectinload(ProductionIssue.material)
            )
            .order_by(ProductionRun.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        res = await db.execute(stmt)
        runs = res.scalars().all()

        results: List[ProductionRunResponse] = []
        for r in runs:
            variances: List[ProductionVarianceItem] = []
            for issue in r.issues:
                is_alert = abs(issue.variance_percent) > VARIANCE_TOLERANCE_PERCENT
                line_cost = (issue.actual_quantity * issue.valuation_rate_snapshot).quantize(CURRENCY_PRECISION, rounding=ROUND_HALF_UP)
                variances.append(
                    ProductionVarianceItem(
                        material_id=issue.material_id,
                        item_name=issue.material.name,
                        item_code=issue.material.code,
                        unit=issue.material.unit,
                        planned_quantity=issue.planned_quantity,
                        actual_quantity=issue.actual_quantity,
                        variance_percent=issue.variance_percent,
                        is_alert=is_alert,
                        valuation_rate=issue.valuation_rate_snapshot,
                        line_cost=line_cost
                    )
                )

            is_yield_alert = abs(r.yield_variance_percent) > VARIANCE_TOLERANCE_PERCENT
            total_pouches = r.actual_good_output + r.damaged_pouches
            results.append(
                ProductionRunResponse(
                    id=r.id,
                    batch_number=r.batch_number,
                    bom_id=r.bom_id,
                    product_id=r.product_id,
                    product_name=r.product.name,
                    product_sku=r.product.sku,
                    planned_quantity=r.planned_quantity,
                    actual_good_output=r.actual_good_output,
                    yield_variance_percent=r.yield_variance_percent,
                    is_yield_alert=is_yield_alert,
                    damaged_pouches=r.damaged_pouches,
                    total_pouches_consumed=total_pouches,
                    cartons_used=r.cartons_used,
                    loose_packets_exception=r.loose_packets_exception,
                    material_cost=r.material_cost,
                    packaging_cost=r.packaging_cost,
                    labour_cost=r.labour_cost,
                    gas_power_cost=r.gas_power_cost,
                    other_overhead_cost=r.other_overhead_cost,
                    total_batch_cost=r.total_batch_cost,
                    cost_per_packet=r.cost_per_packet,
                    status=r.status,
                    posted_at=r.posted_at,
                    created_at=r.created_at,
                    created_by_name=r.creator.full_name,
                    variances=variances
                )
            )
        return results
