import uuid
from typing import List
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import get_current_user, require_roles
from app.models.user import User, RoleEnum
from app.schemas.finance import PaymentCreate, PaymentResponse, ReceivablesSummaryResponse
from app.services.payment_service import PaymentService

router = APIRouter(prefix="/payments", tags=["Finance & Payments"])

@router.post("", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def record_payment(
    payment_in: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RoleEnum.ADMIN, RoleEnum.ACCOUNTANT, RoleEnum.OWNER]))
):
    """
    Record payment from customer and allocate to invoice (explicit or FIFO).
    """
    return await PaymentService.record_payment(db, current_user, payment_in)

@router.get("", response_model=List[PaymentResponse])
async def list_payments(
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RoleEnum.ADMIN, RoleEnum.ACCOUNTANT, RoleEnum.OWNER, RoleEnum.SALESMAN]))
):
    """
    List historical payment receipts.
    """
    return await PaymentService.list_payments(db, limit)

@router.get("/receivables", response_model=ReceivablesSummaryResponse)
async def get_receivables_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RoleEnum.ADMIN, RoleEnum.ACCOUNTANT, RoleEnum.OWNER, RoleEnum.SALESMAN]))
):
    """
    Get customer aged receivables (0-30, 31-60, 61-90, 90+ days) and outstanding balances.
    """
    return await PaymentService.get_receivables_summary(db)
