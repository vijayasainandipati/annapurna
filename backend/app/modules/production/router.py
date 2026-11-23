import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.permissions import get_current_user, require_roles
from app.models.user import User, RoleEnum
from app.models.production import ProductionRun
from app.services.production_service import ProductionService
from app.schemas.production import (
    ProductionRunCreate,
    ProductionRunPost,
    ProductionRunResponse
)

router = APIRouter(prefix="/production", tags=["Production & Batch Costing"])

@router.get("/runs", response_model=List[ProductionRunResponse])
async def list_production_runs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lists historical and active production runs."""
    return await ProductionService.list_runs(db)

@router.post(
    "/runs",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles([RoleEnum.PRODUCTION_SUPERVISOR.value, RoleEnum.ADMIN.value, RoleEnum.OWNER.value]))]
)
async def create_production_run(
    data: ProductionRunCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Initializes a new production batch in DRAFT status."""
    run = await ProductionService.create_draft_run(db, data, current_user.id)
    return {
        "status": "success",
        "run_id": run.id,
        "batch_number": run.batch_number,
        "planned_quantity": run.planned_quantity,
        "run_status": run.status
    }

@router.post(
    "/runs/{run_id}/post",
    response_model=ProductionRunResponse,
    dependencies=[Depends(require_roles([RoleEnum.PRODUCTION_SUPERVISOR.value, RoleEnum.ADMIN.value, RoleEnum.OWNER.value]))]
)
async def post_production_run(
    run_id: uuid.UUID,
    data: ProductionRunPost,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    ATOMIC POSTING:
    Consumes raw materials and packaging, credits finished goods,
    records variances and weighted-average batch cost, and transitions run to POSTED.
    """
    return await ProductionService.post_production_run(
        db=db,
        run_id=run_id,
        post_data=data,
        user_id=current_user.id
    )
