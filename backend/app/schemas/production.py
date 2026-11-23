import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field

class MaterialIssueInput(BaseModel):
    material_id: uuid.UUID
    actual_quantity: Decimal = Field(..., gt=0, description="Actual quantity of material consumed")

class ProductionRunCreate(BaseModel):
    bom_id: uuid.UUID
    planned_quantity: Optional[Decimal] = Field(None, gt=0, description="Planned output packets (defaults to BOM output)")
    notes: Optional[str] = None

class ProductionRunPost(BaseModel):
    actual_good_output: int = Field(..., ge=0, description="Actual good output packets produced")
    damaged_pouches: int = Field(0, ge=0, description="Damaged or wasted pouches")
    cartons_used: int = Field(0, ge=0, description="Corrugated cartons used for packing")
    material_issues: List[MaterialIssueInput] = Field(..., description="Actual issues for raw materials")
    labour_cost: Decimal = Field(Decimal("0.00"), ge=0, description="Direct labour cost in INR")
    gas_power_cost: Decimal = Field(Decimal("0.00"), ge=0, description="Power and fuel/gas cost in INR")
    other_overhead_cost: Decimal = Field(Decimal("0.00"), ge=0, description="Other allocated overheads")
    notes: Optional[str] = None

class ProductionVarianceItem(BaseModel):
    material_id: Optional[uuid.UUID] = None
    item_name: str
    item_code: str
    unit: str
    planned_quantity: Decimal
    actual_quantity: Decimal
    variance_percent: Decimal
    is_alert: bool
    valuation_rate: Decimal
    line_cost: Decimal

class ProductionRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    batch_number: str
    bom_id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    product_sku: str
    planned_quantity: Decimal
    actual_good_output: int
    yield_variance_percent: Decimal
    is_yield_alert: bool
    
    # Packaging accounting
    damaged_pouches: int
    total_pouches_consumed: int
    cartons_used: int
    loose_packets_exception: int
    
    # Costing breakdown
    material_cost: Decimal
    packaging_cost: Decimal
    labour_cost: Decimal
    gas_power_cost: Decimal
    other_overhead_cost: Decimal
    total_batch_cost: Decimal
    cost_per_packet: Decimal
    
    status: str
    posted_at: Optional[datetime] = None
    created_at: datetime
    created_by_name: str
    
    variances: List[ProductionVarianceItem] = []
