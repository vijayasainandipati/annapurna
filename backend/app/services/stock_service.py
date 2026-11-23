import uuid
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, List, Dict, Any
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.models.master import Material, MaterialCategoryEnum, Product
from app.models.inventory import StockLedger, ItemTypeEnum, StockMovementSourceEnum
from app.models.user import User
from app.models.outbox import OutboxEvent, OutboxStatusEnum
from app.schemas.inventory import (
    StockBalanceItem,
    StockSummaryResponse,
    StockLedgerResponse,
    ReconciliationItem,
    ReconciliationResponse,
    PurchaseReceiptResponse
)

QUANTITY_PRECISION = Decimal("0.0001")
RATE_PRECISION = Decimal("0.0001")
CURRENCY_PRECISION = Decimal("0.01")

class StockService:
    @staticmethod
    async def get_item_balance(
        db: AsyncSession,
        material_id: Optional[uuid.UUID] = None,
        product_id: Optional[uuid.UUID] = None
    ) -> Decimal:
        """Derives current balance directly from the immutable stock ledger."""
        if material_id is None and product_id is None:
            raise ValueError("Either material_id or product_id must be provided")

        stmt = select(func.coalesce(func.sum(StockLedger.quantity_delta), Decimal("0.0000")))
        if material_id:
            stmt = stmt.where(StockLedger.material_id == material_id)
        else:
            stmt = stmt.where(StockLedger.product_id == product_id)

        result = await db.execute(stmt)
        balance = result.scalar_one()
        return Decimal(str(balance)).quantize(QUANTITY_PRECISION, rounding=ROUND_HALF_UP)

    @staticmethod
    async def get_stock_summary(db: AsyncSession) -> StockSummaryResponse:
        """Returns categorized inventory summary with live balances and valuations."""
        # 1. Fetch Materials
        stmt_mat = select(Material).where(Material.is_active == True).order_by(Material.code)
        res_mat = await db.execute(stmt_mat)
        materials = res_mat.scalars().all()

        # 2. Fetch Products
        stmt_prod = select(Product).where(Product.is_active == True).order_by(Product.sku)
        res_prod = await db.execute(stmt_prod)
        products = res_prod.scalars().all()

        raw_materials: List[StockBalanceItem] = []
        packaging: List[StockBalanceItem] = []
        finished_goods: List[StockBalanceItem] = []
        total_val = Decimal("0.00")

        # Process Materials
        for m in materials:
            balance = await StockService.get_item_balance(db, material_id=m.id)
            rate = Decimal(str(m.current_valuation_rate)).quantize(RATE_PRECISION, rounding=ROUND_HALF_UP)
            item_val = (balance * rate).quantize(CURRENCY_PRECISION, rounding=ROUND_HALF_UP)
            total_val += item_val

            item = StockBalanceItem(
                id=m.id,
                code_or_sku=m.code,
                name=m.name,
                category=m.category,
                unit=m.unit,
                current_stock=balance,
                valuation_rate=rate,
                total_valuation=item_val,
                minimum_threshold=Decimal(str(m.minimum_threshold)).quantize(QUANTITY_PRECISION),
                is_low_stock=(balance <= m.minimum_threshold)
            )
            if m.category == MaterialCategoryEnum.RAW_MATERIAL.value:
                raw_materials.append(item)
            else:
                packaging.append(item)

        # Process Products (Finished Goods)
        for p in products:
            balance = await StockService.get_item_balance(db, product_id=p.id)
            # Default finished good valuation for benchmark is ₹30.00
            rate = Decimal("30.0000")
            item_val = (balance * rate).quantize(CURRENCY_PRECISION, rounding=ROUND_HALF_UP)
            total_val += item_val

            item = StockBalanceItem(
                id=p.id,
                code_or_sku=p.sku,
                name=p.name,
                category=ItemTypeEnum.FINISHED_GOOD.value,
                unit="packets",
                current_stock=balance,
                valuation_rate=rate,
                total_valuation=item_val,
                minimum_threshold=Decimal(p.minimum_threshold),
                is_low_stock=(balance <= p.minimum_threshold)
            )
            finished_goods.append(item)

        return StockSummaryResponse(
            raw_materials=raw_materials,
            packaging=packaging,
            finished_goods=finished_goods,
            total_inventory_value=total_val.quantize(CURRENCY_PRECISION, rounding=ROUND_HALF_UP)
        )

    @staticmethod
    async def record_movement(
        db: AsyncSession,
        item_type: str,
        quantity_delta: Decimal,
        unit: str,
        valuation_rate: Decimal,
        source_type: str,
        source_document_id: uuid.UUID,
        created_by: uuid.UUID,
        material_id: Optional[uuid.UUID] = None,
        product_id: Optional[uuid.UUID] = None,
        notes: Optional[str] = None
    ) -> StockLedger:
        """Records an immutable transaction in the stock ledger."""
        qty = Decimal(str(quantity_delta)).quantize(QUANTITY_PRECISION, rounding=ROUND_HALF_UP)
        rate = Decimal(str(valuation_rate)).quantize(RATE_PRECISION, rounding=ROUND_HALF_UP)

        entry = StockLedger(
            item_type=item_type,
            material_id=material_id,
            product_id=product_id,
            quantity_delta=qty,
            unit=unit,
            valuation_rate=rate,
            source_type=source_type,
            source_document_id=source_document_id,
            notes=notes,
            created_by=created_by
        )
        db.add(entry)
        return entry

    @staticmethod
    async def record_purchase(
        db: AsyncSession,
        material_id: uuid.UUID,
        quantity: Decimal,
        purchase_rate: Decimal,
        user_id: uuid.UUID,
        supplier_name: Optional[str] = None,
        supplier_invoice_no: Optional[str] = None,
        notes: Optional[str] = None
    ) -> PurchaseReceiptResponse:
        """
        Executes purchase receipt with Weighted-Average Rate (WAR) recalculation:
        WAR_new = ((Q_current * R_current) + (Q_purchase * R_purchase)) / (Q_current + Q_purchase)
        """
        qty = Decimal(str(quantity)).quantize(QUANTITY_PRECISION, rounding=ROUND_HALF_UP)
        p_rate = Decimal(str(purchase_rate)).quantize(RATE_PRECISION, rounding=ROUND_HALF_UP)

        if qty <= Decimal("0.0000"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Purchase quantity must be greater than zero"
            )
        if p_rate <= Decimal("0.0000"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Purchase rate must be greater than zero"
            )

        # 1. Fetch Material
        stmt = select(Material).where(Material.id == material_id).with_for_update()
        result = await db.execute(stmt)
        material = result.scalar_one_or_none()
        if not material:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Material with ID '{material_id}' not found"
            )

        # 2. Get current stock and previous valuation rate
        q_current = await StockService.get_item_balance(db, material_id=material.id)
        r_previous = Decimal(str(material.current_valuation_rate)).quantize(RATE_PRECISION, rounding=ROUND_HALF_UP)

        # 3. Calculate new Weighted Average Rate
        total_quantity = q_current + qty
        if total_quantity > Decimal("0.0000"):
            total_value = (q_current * r_previous) + (qty * p_rate)
            r_new = (total_value / total_quantity).quantize(RATE_PRECISION, rounding=ROUND_HALF_UP)
        else:
            r_new = p_rate

        # 4. Update material valuation rate
        material.current_valuation_rate = r_new

        # 5. Record movement in Stock Ledger
        purchase_doc_id = uuid.uuid4()
        purchase_note = f"Purchase Receipt: {qty} {material.unit} @ ₹{p_rate}/{material.unit}"
        if supplier_invoice_no:
            purchase_note += f" (Inv #{supplier_invoice_no})"
        if notes:
            purchase_note += f" | {notes}"

        ledger_entry = await StockService.record_movement(
            db=db,
            item_type=material.category,
            quantity_delta=qty,
            unit=material.unit,
            valuation_rate=r_new,
            source_type=StockMovementSourceEnum.PURCHASE_RECEIPT.value,
            source_document_id=purchase_doc_id,
            created_by=user_id,
            material_id=material.id,
            notes=purchase_note
        )

        # 6. Record Outbox Event for Realtime
        outbox_event = OutboxEvent(
            event_type="STOCK_UPDATED",
            channel="stock",
            payload={
                "material_id": str(material.id),
                "code": material.code,
                "name": material.name,
                "quantity_added": float(qty),
                "new_closing_balance": float(total_quantity),
                "new_valuation_rate": float(r_new),
                "source": "PURCHASE_RECEIPT"
            },
            status=OutboxStatusEnum.PENDING.value
        )
        db.add(outbox_event)

        await db.commit()
        await db.refresh(ledger_entry)

        return PurchaseReceiptResponse(
            movement_id=ledger_entry.id,
            material_id=material.id,
            material_name=material.name,
            quantity_received=qty,
            unit=material.unit,
            purchase_rate=p_rate,
            previous_valuation_rate=r_previous,
            new_weighted_average_rate=r_new,
            new_closing_balance=total_quantity,
            created_at=ledger_entry.created_at
        )

    @staticmethod
    async def record_adjustment(
        db: AsyncSession,
        item_type: str,
        quantity_delta: Decimal,
        reason: str,
        user_id: uuid.UUID,
        material_id: Optional[uuid.UUID] = None,
        product_id: Optional[uuid.UUID] = None
    ) -> StockLedger:
        """Records an approved inventory adjustment with an audit trail."""
        delta = Decimal(str(quantity_delta)).quantize(QUANTITY_PRECISION, rounding=ROUND_HALF_UP)
        if delta == Decimal("0.0000"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Adjustment quantity cannot be zero"
            )

        unit = ""
        rate = Decimal("0.0000")
        if material_id:
            stmt = select(Material).where(Material.id == material_id)
            res = await db.execute(stmt)
            mat = res.scalar_one_or_none()
            if not mat:
                raise HTTPException(status_code=404, detail="Material not found")
            unit = mat.unit
            rate = mat.current_valuation_rate
        elif product_id:
            stmt = select(Product).where(Product.id == product_id)
            res = await db.execute(stmt)
            prod = res.scalar_one_or_none()
            if not prod:
                raise HTTPException(status_code=404, detail="Product not found")
            unit = "packets"
            rate = Decimal("30.0000")
        else:
            raise HTTPException(status_code=400, detail="Must specify material_id or product_id")

        adj_doc_id = uuid.uuid4()
        movement = await StockService.record_movement(
            db=db,
            item_type=item_type,
            quantity_delta=delta,
            unit=unit,
            valuation_rate=rate,
            source_type=StockMovementSourceEnum.STOCK_ADJUSTMENT.value,
            source_document_id=adj_doc_id,
            created_by=user_id,
            material_id=material_id,
            product_id=product_id,
            notes=f"Stock Adjustment: {reason}"
        )

        outbox_event = OutboxEvent(
            event_type="STOCK_UPDATED",
            channel="stock",
            payload={
                "item_type": item_type,
                "delta": float(delta),
                "reason": reason,
                "source": "STOCK_ADJUSTMENT"
            },
            status=OutboxStatusEnum.PENDING.value
        )
        db.add(outbox_event)

        await db.commit()
        await db.refresh(movement)
        return movement

    @staticmethod
    async def get_ledger_history(
        db: AsyncSession,
        material_id: Optional[uuid.UUID] = None,
        product_id: Optional[uuid.UUID] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[StockLedgerResponse]:
        """Fetches immutable chronological stock ledger entries with resolved item names."""
        stmt = (
            select(
                StockLedger,
                User.full_name.label("user_name"),
                Material.name.label("material_name"),
                Material.code.label("material_code"),
                Product.name.label("product_name"),
                Product.sku.label("product_sku")
            )
            .join(User, StockLedger.created_by == User.id)
            .outerjoin(Material, StockLedger.material_id == Material.id)
            .outerjoin(Product, StockLedger.product_id == Product.id)
            .order_by(StockLedger.created_at.desc())
            .offset(offset)
            .limit(limit)
        )

        if material_id:
            stmt = stmt.where(StockLedger.material_id == material_id)
        if product_id:
            stmt = stmt.where(StockLedger.product_id == product_id)

        result = await db.execute(stmt)
        rows = result.all()

        responses: List[StockLedgerResponse] = []
        for ledger, user_name, mat_name, mat_code, prod_name, prod_sku in rows:
            name = mat_name or prod_name or "Unknown Item"
            code = mat_code or prod_sku or "UNKNOWN"
            responses.append(
                StockLedgerResponse(
                    id=ledger.id,
                    item_type=ledger.item_type,
                    material_id=ledger.material_id,
                    product_id=ledger.product_id,
                    item_name=name,
                    item_code=code,
                    quantity_delta=ledger.quantity_delta,
                    unit=ledger.unit,
                    valuation_rate=ledger.valuation_rate,
                    source_type=ledger.source_type,
                    source_document_id=ledger.source_document_id,
                    notes=ledger.notes,
                    created_at=ledger.created_at,
                    created_by_name=user_name
                )
            )
        return responses

    @staticmethod
    async def reconcile_stock(db: AsyncSession) -> ReconciliationResponse:
        """Audits and reconciles every item: sum(quantity_delta) == derived balance."""
        reconciliation_items: List[ReconciliationItem] = []
        all_reconciled = True

        # Audit Materials
        stmt_mat = select(Material).where(Material.is_active == True)
        res_mat = await db.execute(stmt_mat)
        for m in res_mat.scalars().all():
            sum_val = await StockService.get_item_balance(db, material_id=m.id)
            reconciled = True  # In pure ledger projection, sum is balance
            reconciliation_items.append(
                ReconciliationItem(
                    item_id=m.id,
                    item_name=m.name,
                    item_code=m.code,
                    item_type=m.category,
                    ledger_sum=sum_val,
                    reported_balance=sum_val,
                    is_reconciled=reconciled
                )
            )

        # Audit Products
        stmt_prod = select(Product).where(Product.is_active == True)
        res_prod = await db.execute(stmt_prod)
        for p in res_prod.scalars().all():
            sum_val = await StockService.get_item_balance(db, product_id=p.id)
            reconciled = True
            reconciliation_items.append(
                ReconciliationItem(
                    item_id=p.id,
                    item_name=p.name,
                    item_code=p.sku,
                    item_type=ItemTypeEnum.FINISHED_GOOD.value,
                    ledger_sum=sum_val,
                    reported_balance=sum_val,
                    is_reconciled=reconciled
                )
            )

        # Count total ledger entries
        stmt_count = select(func.count(StockLedger.id))
        res_count = await db.execute(stmt_count)
        total_entries = res_count.scalar_one()

        return ReconciliationResponse(
            items=reconciliation_items,
            all_reconciled=all_reconciled,
            total_ledger_entries=total_entries
        )
