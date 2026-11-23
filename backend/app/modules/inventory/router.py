import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import get_current_user, require_roles
from app.models.user import User, RoleEnum
from app.services.stock_service import StockService
from app.schemas.inventory import (
    StockSummaryResponse,
    StockLedgerResponse,
    PurchaseReceiptCreate,
    PurchaseReceiptResponse,
    StockAdjustmentCreate,
    ReconciliationResponse
)

router = APIRouter(prefix="/inventory", tags=["Inventory & Stock Ledger"])

@router.get("/summary", response_model=StockSummaryResponse)
async def get_inventory_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns grouped inventory balances (Raw Materials, Packaging, Finished Goods) and total valuation."""
    return await StockService.get_stock_summary(db)

@router.get("/ledger", response_model=List[StockLedgerResponse])
async def get_stock_ledger(
    material_id: Optional[uuid.UUID] = Query(None, description="Filter by Material UUID"),
    product_id: Optional[uuid.UUID] = Query(None, description="Filter by Product UUID"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns chronologically ordered, immutable stock ledger movements."""
    return await StockService.get_ledger_history(
        db,
        material_id=material_id,
        product_id=product_id,
        limit=limit,
        offset=offset
    )

@router.post(
    "/purchases",
    response_model=PurchaseReceiptResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles([RoleEnum.ADMIN.value, RoleEnum.OWNER.value]))]
)
async def record_material_purchase(
    purchase: PurchaseReceiptCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Records a purchase receipt, recalculates the material's Weighted-Average Rate (WAR),
    and records an immutable entry in the stock ledger.
    Restricted to Factory Admin and Owner.
    """
    return await StockService.record_purchase(
        db=db,
        material_id=purchase.material_id,
        quantity=purchase.quantity,
        purchase_rate=purchase.purchase_rate,
        user_id=current_user.id,
        supplier_name=purchase.supplier_name,
        supplier_invoice_no=purchase.supplier_invoice_no,
        notes=purchase.notes
    )

@router.post(
    "/adjustments",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles([RoleEnum.ADMIN.value, RoleEnum.OWNER.value]))]
)
async def record_stock_adjustment(
    adj: StockAdjustmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Records an authorized inventory adjustment with an audit trail."""
    movement = await StockService.record_adjustment(
        db=db,
        item_type=adj.item_type,
        quantity_delta=adj.quantity_delta,
        reason=adj.reason,
        user_id=current_user.id,
        material_id=adj.material_id,
        product_id=adj.product_id
    )
    return {
        "status": "success",
        "movement_id": movement.id,
        "quantity_delta": movement.quantity_delta,
        "source_type": movement.source_type,
        "notes": movement.notes
    }

@router.get(
    "/reconciliation",
    response_model=ReconciliationResponse,
    dependencies=[Depends(require_roles([RoleEnum.ADMIN.value, RoleEnum.OWNER.value, RoleEnum.ACCOUNTANT.value]))]
)
async def reconcile_inventory(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Audits and reconciles every item's ledger transaction sum against reported balance."""
    return await StockService.reconcile_stock(db)
