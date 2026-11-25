import uuid
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, List, Dict
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.models.user import User
from app.models.master import Customer, Product
from app.models.sales import (
    SalesOrder,
    SalesOrderStatusEnum,
    SalesOrderItem,
    Invoice,
    InvoiceStatusEnum,
    Dispatch
)
from app.models.inventory import StockLedger, ItemTypeEnum, StockMovementSourceEnum
from app.models.outbox import OutboxEvent, OutboxStatusEnum
from app.services.stock_service import StockService
from app.services.invoice_service import InvoiceService
from app.schemas.sales import (
    OrderCreate,
    OrderResponse,
    OrderItemResponse,
    OrderStockPrecheckResponse,
    OrderStockPrecheckItem,
    InvoiceResponse,
    InvoiceItemDetail,
    DispatchResponse
)

CURRENCY_PRECISION = Decimal("0.01")

class SalesService:
    @staticmethod
    async def create_order(db: AsyncSession, data: OrderCreate, salesman_id: uuid.UUID) -> OrderResponse:
        """
        Creates a new Sales Order.
        Supports offline idempotency_key to prevent duplicate submissions upon reconnection.
        """
        # 1. Check idempotency key if present
        if data.idempotency_key:
            stmt = (
                select(SalesOrder)
                .where(SalesOrder.idempotency_key == data.idempotency_key)
                .options(
                    selectinload(SalesOrder.customer),
                    selectinload(SalesOrder.salesman),
                    selectinload(SalesOrder.invoices),
                    selectinload(SalesOrder.items).selectinload(SalesOrderItem.product)
                )
            )
            res = await db.execute(stmt)
            existing = res.scalar_one_or_none()
            if existing:
                return SalesService._build_order_response(existing)

        # 2. Fetch Customer
        cust_stmt = select(Customer).where(Customer.id == data.customer_id, Customer.is_active == True)
        cust_res = await db.execute(cust_stmt)
        customer = cust_res.scalar_one_or_none()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found or inactive")

        # 3. Generate sequential order number (e.g. SO-2026-0001)
        count_stmt = select(func.count(SalesOrder.id))
        count_res = await db.execute(count_stmt)
        count = count_res.scalar_one() + 1
        order_number = f"SO-2026-{count:04d}"

        # 4. Fetch Products and calculate line items
        prod_ids = [it.product_id for it in data.items]
        prod_stmt = select(Product).where(Product.id.in_(prod_ids), Product.is_active == True)
        prod_res = await db.execute(prod_stmt)
        products_map = {p.id: p for p in prod_res.scalars().all()}

        total_taxable = Decimal("0.00")
        total_tax = Decimal("0.00")
        total_order = Decimal("0.00")
        order_items: List[SalesOrderItem] = []

        for item_input in data.items:
            prod = products_map.get(item_input.product_id)
            if not prod:
                raise HTTPException(status_code=404, detail=f"Product '{item_input.product_id}' not found")

            qty = item_input.quantity
            unit_price = Decimal(str(prod.base_selling_price)).quantize(CURRENCY_PRECISION)
            taxable = (Decimal(qty) * unit_price).quantize(CURRENCY_PRECISION, rounding=ROUND_HALF_UP)
            
            cgst, sgst, igst = InvoiceService.calculate_gst_breakup(taxable, prod.gst_rate_percent, customer.state)
            item_tax = (cgst + sgst + igst).quantize(CURRENCY_PRECISION, rounding=ROUND_HALF_UP)
            line_total = taxable + item_tax

            total_taxable += taxable
            total_tax += item_tax
            total_order += line_total

            order_items.append(
                SalesOrderItem(
                    product_id=prod.id,
                    quantity=qty,
                    unit_price=unit_price,
                    taxable_amount=taxable,
                    tax_amount=item_tax,
                    line_total=line_total
                )
            )

        # 5. Create Order
        order = SalesOrder(
            order_number=order_number,
            customer_id=customer.id,
            salesman_id=salesman_id,
            status=SalesOrderStatusEnum.PENDING.value,
            idempotency_key=data.idempotency_key,
            total_taxable_amount=total_taxable,
            total_tax_amount=total_tax,
            total_order_amount=total_order,
            notes=data.notes,
            items=order_items
        )
        db.add(order)

        # 6. Queue Outbox Event
        outbox_event = OutboxEvent(
            event_type="ORDER_CREATED",
            channel="role:admin",
            payload={
                "order_number": order_number,
                "customer_name": customer.business_name,
                "total_amount": float(total_order),
                "item_count": len(order_items)
            },
            status=OutboxStatusEnum.PENDING.value
        )
        db.add(outbox_event)

        await db.commit()
        await db.refresh(order)

        # Reload with relationships
        stmt_reload = (
            select(SalesOrder)
            .where(SalesOrder.id == order.id)
            .options(
                selectinload(SalesOrder.customer),
                selectinload(SalesOrder.salesman),
                selectinload(SalesOrder.invoices),
                selectinload(SalesOrder.items).selectinload(SalesOrderItem.product)
            )
        )
        reloaded = (await db.execute(stmt_reload)).scalar_one()
        return SalesService._build_order_response(reloaded)

    @staticmethod
    async def get_stock_precheck(db: AsyncSession, order_id: uuid.UUID) -> OrderStockPrecheckResponse:
        """Evaluates live finished goods availability against requested order items."""
        stmt = (
            select(SalesOrder)
            .where(SalesOrder.id == order_id)
            .options(
                selectinload(SalesOrder.items).selectinload(SalesOrderItem.product)
            )
        )
        res = await db.execute(stmt)
        order = res.scalar_one_or_none()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        precheck_items: List[OrderStockPrecheckItem] = []
        can_fulfill_all = True
        total_req = 0
        total_avail = Decimal("0.00")

        for item in order.items:
            prod = item.product
            avail = await StockService.get_item_balance(db, product_id=prod.id)
            projected = avail - Decimal(item.quantity)
            shortage = max(0, item.quantity - int(avail))
            has_shortage = shortage > 0
            if has_shortage:
                can_fulfill_all = False

            total_req += item.quantity
            total_avail += avail

            precheck_items.append(
                OrderStockPrecheckItem(
                    product_id=prod.id,
                    product_name=prod.name,
                    product_sku=prod.sku,
                    requested_quantity=item.quantity,
                    available_stock=avail,
                    projected_stock=projected,
                    has_shortage=has_shortage,
                    shortage_quantity=shortage
                )
            )

        return OrderStockPrecheckResponse(
            order_id=order.id,
            order_number=order.order_number,
            items=precheck_items,
            can_fulfill_completely=can_fulfill_all,
            total_requested=total_req,
            total_available=total_avail
        )

    @staticmethod
    async def update_status(db: AsyncSession, order_id: uuid.UUID, new_status: str, rejection_reason: Optional[str] = None) -> OrderResponse:
        """Approves, rejects, or edits an order with recorded audit reason."""
        stmt = (
            select(SalesOrder)
            .where(SalesOrder.id == order_id)
            .options(
                selectinload(SalesOrder.customer),
                selectinload(SalesOrder.salesman),
                selectinload(SalesOrder.invoices),
                selectinload(SalesOrder.items).selectinload(SalesOrderItem.product)
            )
        )
        res = await db.execute(stmt)
        order = res.scalar_one_or_none()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        order.status = new_status
        if rejection_reason:
            order.rejection_reason = rejection_reason

        outbox_event = OutboxEvent(
            event_type="ORDER_STATUS_CHANGED",
            channel=f"user:{order.salesman_id}",
            payload={
                "order_id": str(order.id),
                "order_number": order.order_number,
                "status": new_status,
                "rejection_reason": rejection_reason
            },
            status=OutboxStatusEnum.PENDING.value
        )
        db.add(outbox_event)

        await db.commit()
        await db.refresh(order)
        return SalesService._build_order_response(order)

    @staticmethod
    async def generate_invoice_for_order(db: AsyncSession, order_id: uuid.UUID, user_id: uuid.UUID) -> InvoiceResponse:
        """Generates a GST Invoice for an approved sales order with exact tax breakdown."""
        stmt = (
            select(SalesOrder)
            .where(SalesOrder.id == order_id)
            .options(
                selectinload(SalesOrder.customer),
                selectinload(SalesOrder.items).selectinload(SalesOrderItem.product)
            )
        )
        res = await db.execute(stmt)
        order = res.scalar_one_or_none()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        customer = order.customer
        inv_no = await InvoiceService.generate_invoice_number(db)

        # Tax calculations
        cgst_total = Decimal("0.00")
        sgst_total = Decimal("0.00")
        igst_total = Decimal("0.00")
        taxable_total = Decimal("0.00")

        item_details: List[InvoiceItemDetail] = []
        for it in order.items:
            prod = it.product
            cgst_i, sgst_i, igst_i = InvoiceService.calculate_gst_breakup(it.taxable_amount, prod.gst_rate_percent, customer.state)
            cgst_total += cgst_i
            sgst_total += sgst_i
            igst_total += igst_i
            taxable_total += it.taxable_amount

            item_details.append(
                InvoiceItemDetail(
                    product_name=prod.name,
                    sku=prod.sku,
                    hsn_code=prod.hsn_code,
                    quantity=it.quantity,
                    unit_price=it.unit_price,
                    taxable_amount=it.taxable_amount,
                    gst_rate=prod.gst_rate_percent,
                    tax_amount=cgst_i + sgst_i + igst_i,
                    total_amount=it.line_total
                )
            )

        invoice_total = (taxable_total + cgst_total + sgst_total + igst_total).quantize(CURRENCY_PRECISION, rounding=ROUND_HALF_UP)

        invoice = Invoice(
            invoice_number=inv_no,
            order_id=order.id,
            customer_id=customer.id,
            customer_state=customer.state,
            customer_gstin=customer.gstin,
            taxable_amount=taxable_total,
            cgst_amount=cgst_total,
            sgst_amount=sgst_total,
            igst_amount=igst_total,
            total_amount=invoice_total,
            paid_amount=Decimal("0.00"),
            status=InvoiceStatusEnum.ISSUED.value
        )
        db.add(invoice)

        order.status = SalesOrderStatusEnum.INVOICED.value

        outbox_event = OutboxEvent(
            event_type="INVOICE_CREATED",
            channel="role:admin",
            payload={
                "invoice_number": inv_no,
                "order_number": order.order_number,
                "total_amount": float(invoice_total),
                "customer_name": customer.business_name
            },
            status=OutboxStatusEnum.PENDING.value
        )
        db.add(outbox_event)

        await db.commit()
        await db.refresh(invoice)

        is_interstate = (customer.state.strip().lower() != "tamil nadu")
        return InvoiceResponse(
            id=invoice.id,
            invoice_number=invoice.invoice_number,
            order_id=order.id,
            customer_id=customer.id,
            customer_name=customer.business_name,
            customer_state=customer.state,
            customer_gstin=customer.gstin,
            taxable_amount=invoice.taxable_amount,
            cgst_amount=invoice.cgst_amount,
            sgst_amount=invoice.sgst_amount,
            igst_amount=invoice.igst_amount,
            total_amount=invoice.total_amount,
            paid_amount=invoice.paid_amount,
            outstanding_amount=invoice.total_amount - invoice.paid_amount,
            status=invoice.status,
            is_interstate=is_interstate,
            created_at=invoice.created_at,
            items=item_details
        )

    @staticmethod
    async def dispatch_order(
        db: AsyncSession,
        order_id: uuid.UUID,
        invoice_id: uuid.UUID,
        user_id: uuid.UUID,
        partial_quantity: Optional[int] = None
    ) -> DispatchResponse:
        """
        Executes dispatch under stock lock.
        Validates finished goods stock availability and updates stock ledger.
        """
        # Fetch order with lock
        stmt = (
            select(SalesOrder)
            .where(SalesOrder.id == order_id)
            .options(
                selectinload(SalesOrder.items).selectinload(SalesOrderItem.product),
                selectinload(SalesOrder.customer)
            )
            .with_for_update()
        )
        res = await db.execute(stmt)
        order = res.scalar_one_or_none()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        # Fetch invoice
        inv_stmt = select(Invoice).where(Invoice.id == invoice_id)
        inv_res = await db.execute(inv_stmt)
        invoice = inv_res.scalar_one_or_none()
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")

        # Process each product dispatch
        total_dispatched = 0
        remaining_stock_sample = Decimal("0.00")

        for item in order.items:
            prod = item.product
            req_qty = partial_quantity if partial_quantity else item.quantity

            # Check stock under lock
            avail_stock = await StockService.get_item_balance(db, product_id=prod.id)
            if avail_stock < Decimal(req_qty):
                shortage = req_qty - int(avail_stock)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot dispatch: Insufficient finished goods for '{prod.name}'. Requested: {req_qty}, Available: {avail_stock}, Shortage: {shortage} packets."
                )

            # Deduct finished goods from Stock Ledger
            await StockService.record_movement(
                db=db,
                item_type=ItemTypeEnum.FINISHED_GOOD.value,
                quantity_delta=-Decimal(req_qty),
                unit="packets",
                valuation_rate=prod.base_selling_price,
                source_type=StockMovementSourceEnum.SALES_DISPATCH.value,
                source_document_id=invoice.id,
                created_by=user_id,
                product_id=prod.id,
                notes=f"Dispatch for Invoice #{invoice.invoice_number} (Order #{order.order_number})"
            )

            total_dispatched += req_qty
            remaining_stock_sample = avail_stock - Decimal(req_qty)

        # Generate Dispatch Number (DSP-2026-XXXX)
        count_stmt = select(func.count(Dispatch.id))
        count = (await db.execute(count_stmt)).scalar_one() + 1
        dsp_no = f"DSP-2026-{count:04d}"

        dispatch = Dispatch(
            dispatch_number=dsp_no,
            order_id=order.id,
            invoice_id=invoice.id,
            dispatched_by=user_id
        )
        db.add(dispatch)

        order.status = SalesOrderStatusEnum.DISPATCHED.value

        outbox_event = OutboxEvent(
            event_type="DISPATCH_COMPLETED",
            channel="role:admin",
            payload={
                "dispatch_number": dsp_no,
                "invoice_number": invoice.invoice_number,
                "dispatched_quantity": total_dispatched,
                "customer_name": order.customer.business_name
            },
            status=OutboxStatusEnum.PENDING.value
        )
        db.add(outbox_event)

        await db.commit()
        await db.refresh(dispatch)

        # Fetch dispatcher name
        disp_user = (await db.execute(select(User).where(User.id == user_id))).scalar_one()

        return DispatchResponse(
            id=dispatch.id,
            dispatch_number=dispatch.dispatch_number,
            order_id=order.id,
            invoice_id=invoice.id,
            dispatched_quantity=total_dispatched,
            remaining_finished_stock=remaining_stock_sample,
            dispatched_at=dispatch.dispatched_at,
            dispatched_by_name=disp_user.full_name
        )

    @staticmethod
    def _build_order_response(order: SalesOrder) -> OrderResponse:
        items = [
            OrderItemResponse(
                id=it.id,
                product_id=it.product_id,
                product_name=it.product.name,
                product_sku=it.product.sku,
                quantity=it.quantity,
                unit_price=it.unit_price,
                taxable_amount=it.taxable_amount,
                tax_amount=it.tax_amount,
                line_total=it.line_total
            )
            for it in order.items
        ]
        active_inv = next(
            (inv for inv in (order.invoices or []) if inv.status != InvoiceStatusEnum.CANCELLED.value),
            None
        )
        return OrderResponse(
            id=order.id,
            order_number=order.order_number,
            customer_id=order.customer_id,
            customer_name=order.customer.business_name,
            customer_state=order.customer.state,
            customer_gstin=order.customer.gstin,
            salesman_id=order.salesman_id,
            salesman_name=order.salesman.full_name,
            status=order.status,
            idempotency_key=order.idempotency_key,
            total_taxable_amount=order.total_taxable_amount,
            total_tax_amount=order.total_tax_amount,
            total_order_amount=order.total_order_amount,
            rejection_reason=order.rejection_reason,
            notes=order.notes,
            invoice_id=active_inv.id if active_inv else None,
            invoice_number=active_inv.invoice_number if active_inv else None,
            created_at=order.created_at,
            updated_at=order.updated_at,
            items=items
        )
