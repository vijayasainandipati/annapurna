import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import get_current_user
from app.models.user import User
from app.models.master import Material, Product, Customer, BOM
from app.schemas.master import MaterialResponse, ProductResponse, CustomerResponse, BOMResponse

router = APIRouter(prefix="/masters", tags=["Business Masters"])

@router.get("/materials", response_model=List[MaterialResponse])
async def list_materials(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(Material).where(Material.is_active == True).order_by(Material.code)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/products", response_model=List[ProductResponse])
async def list_products(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(Product).where(Product.is_active == True).order_by(Product.sku)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/customers", response_model=List[CustomerResponse])
async def list_customers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(Customer).where(Customer.is_active == True).order_by(Customer.business_name)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/boms/{product_id}", response_model=BOMResponse)
async def get_product_bom(
    product_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = (
        select(BOM)
        .where(BOM.product_id == product_id, BOM.is_active == True)
        .options(selectinload(BOM.lines))
    )
    result = await db.execute(stmt)
    bom = result.scalar_one_or_none()
    if not bom:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Active BOM not found for product ID '{product_id}'"
        )
    return bom
