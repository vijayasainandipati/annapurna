import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, ConfigDict

class MaterialResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    category: str
    unit: str
    current_valuation_rate: Decimal
    minimum_threshold: Decimal
    is_active: bool
    created_at: datetime

class BOMLineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    material_id: uuid.UUID
    planned_quantity: Decimal
    unit: str
    material: MaterialResponse

class BOMResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID
    version: str
    batch_output_units: Decimal
    is_active: bool
    lines: List[BOMLineResponse] = []

class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sku: str
    name: str
    pack_size_grams: int
    hsn_code: str
    gst_rate_percent: Decimal
    base_selling_price: Decimal
    minimum_threshold: int
    is_active: bool
    created_at: datetime

class CustomerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_name: str
    contact_person: Optional[str] = None
    phone: str
    email: Optional[str] = None
    address: Optional[str] = None
    state: str
    gstin: Optional[str] = None
    credit_limit: Decimal
    is_active: bool
    created_at: datetime
