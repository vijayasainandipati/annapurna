import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.permissions import get_current_user, require_roles
from app.models.user import User, RoleEnum
from app.models.sales import SalesOrder, Invoice, SalesOrderItem
from app.services.sales_service import SalesService
from app.services.invoice_service import InvoiceService
from app.schemas.sales import (
    OrderCreate,
    OrderResponse,
    OrderStatusUpdate,
    OrderStockPrecheckResponse,
    InvoiceResponse,
    DispatchCreate,
    DispatchResponse
)

router = APIRouter(prefix="/sales", tags=["Sales Orders, Invoicing & Dispatch"])

@router.post(
    "/orders",
    response_model=OrderResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles([RoleEnum.SALESMAN.value, RoleEnum.ADMIN.value, RoleEnum.OWNER.value]))]
)
async def create_sales_order(
    data: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Creates a new Sales Order.
    Accepts an offline idempotency_key to prevent duplicate order submissions.
    """
    return await SalesService.create_order(db, data, current_user.id)

@router.get("/orders", response_model=List[OrderResponse])
async def list_sales_orders(
    status: Optional[str] = Query(None, description="Filter by status: PENDING, APPROVED, INVOICED, DISPATCHED"),
    customer_id: Optional[uuid.UUID] = Query(None, description="Filter by customer UUID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lists orders. Salesmen see only their own orders unless Admin or Owner."""
    stmt = (
        select(SalesOrder)
        .options(
            selectinload(SalesOrder.customer),
            selectinload(SalesOrder.salesman),
            selectinload(SalesOrder.items).selectinload(SalesOrderItem.product)
        )
        .order_by(SalesOrder.created_at.desc())
    )

    if current_user.role == RoleEnum.SALESMAN.value:
        stmt = stmt.where(SalesOrder.salesman_id == current_user.id)
    if status:
        stmt = stmt.where(SalesOrder.status == status)
    if customer_id:
        stmt = stmt.where(SalesOrder.customer_id == customer_id)

    res = await db.execute(stmt)
    orders = res.scalars().all()
    return [SalesService._build_order_response(o) for o in orders]

@router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order_details(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = (
        select(SalesOrder)
        .where(SalesOrder.id == order_id)
        .options(
            selectinload(SalesOrder.customer),
            selectinload(SalesOrder.salesman),
            selectinload(SalesOrder.items).selectinload(SalesOrderItem.product)
        )
    )
    res = await db.execute(stmt)
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return SalesService._build_order_response(order)

@router.get("/orders/{order_id}/stock-check", response_model=OrderStockPrecheckResponse)
async def check_order_stock_availability(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Evaluates live inventory availability against requested order items, flagging any shortages."""
    return await SalesService.get_stock_precheck(db, order_id)

@router.patch(
    "/orders/{order_id}/status",
    response_model=OrderResponse,
    dependencies=[Depends(require_roles([RoleEnum.ADMIN.value, RoleEnum.OWNER.value]))]
)
async def update_order_status(
    order_id: uuid.UUID,
    data: OrderStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Approves or rejects an incoming sales order with recorded audit trail."""
    return await SalesService.update_status(db, order_id, data.status, data.rejection_reason)

@router.post(
    "/orders/{order_id}/invoice",
    response_model=InvoiceResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles([RoleEnum.ADMIN.value, RoleEnum.OWNER.value]))]
)
async def generate_invoice(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Generates an official GST Tax Invoice with financial-year sequential numbering."""
    return await SalesService.generate_invoice_for_order(db, order_id, current_user.id)

@router.get("/invoices/{invoice_id}/pdf")
async def download_invoice_pdf(
    invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Generates and downloads the print-ready GST Tax Invoice PDF via ReportLab."""
    stmt = (
        select(Invoice)
        .where(Invoice.id == invoice_id)
        .options(
            selectinload(Invoice.order).selectinload(SalesOrder.items).selectinload(SalesOrderItem.product),
            selectinload(Invoice.customer)
        )
    )
    res = await db.execute(stmt)
    invoice = res.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    pdf_bytes = InvoiceService.build_pdf_invoice(
        invoice=invoice,
        order=invoice.order,
        customer=invoice.customer,
        items=invoice.order.items
    )

    filename = f"Invoice_{invoice.invoice_number.replace('/', '_')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.post(
    "/orders/{order_id}/dispatch",
    response_model=DispatchResponse,
    dependencies=[Depends(require_roles([RoleEnum.ADMIN.value, RoleEnum.OWNER.value]))]
)
async def dispatch_sales_order(
    order_id: uuid.UUID,
    data: DispatchCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Executes dispatch under stock lock.
    Deducts finished goods inventory and creates formal warehouse dispatch document.
    """
    return await SalesService.dispatch_order(
        db=db,
        order_id=order_id,
        invoice_id=data.invoice_id,
        user_id=current_user.id,
        partial_quantity=data.partial_quantity
    )
