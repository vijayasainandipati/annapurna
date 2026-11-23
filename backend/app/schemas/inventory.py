import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field

class PurchaseReceiptCreate(BaseModel):
    material_id: uuid.UUID
    quantity: Decimal = Field(..., gt=0, description="Quantity of material received (must be positive)")
    purchase_rate: Decimal = Field(..., gt=0, description="Purchase rate per unit before tax")
    supplier_name: Optional[str] = None
    supplier_invoice_no: Optional[str] = None
    notes: Optional[str] = None

class PurchaseReceiptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    movement_id: uuid.UUID
    material_id: uuid.UUID
    material_name: str
    quantity_received: Decimal
    unit: str
    purchase_rate: Decimal
    previous_valuation_rate: Decimal
    new_weighted_average_rate: Decimal
    new_closing_balance: Decimal
    created_at: datetime

class StockAdjustmentCreate(BaseModel):
    item_type: str  # RAW_MATERIAL, PACKAGING, FINISHED_GOOD
    material_id: Optional[uuid.UUID] = None
    product_id: Optional[uuid.UUID] = None
    quantity_delta: Decimal = Field(..., description="Positive for stock increase, negative for decrease")
    reason: str = Field(..., min_length=3, description="Audit reason for adjustment")

class StockBalanceItem(BaseModel):
    id: uuid.UUID
    code_or_sku: str
    name: str
    category: str  # RAW_MATERIAL, PACKAGING, FINISHED_GOOD
    unit: str
    current_stock: Decimal
    valuation_rate: Decimal
    total_valuation: Decimal
    minimum_threshold: Decimal
    is_low_stock: bool

class StockSummaryResponse(BaseModel):
    raw_materials: List[StockBalanceItem]
    packaging: List[StockBalanceItem]
    finished_goods: List[StockBalanceItem]
    total_inventory_value: Decimal

class StockLedgerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    item_type: str
    material_id: Optional[uuid.UUID] = None
    product_id: Optional[uuid.UUID] = None
    item_name: str
    item_code: str
    quantity_delta: Decimal
    unit: str
    valuation_rate: Decimal
    source_type: str
    source_document_id: uuid.UUID
    notes: Optional[str] = None
    created_at: datetime
    created_by_name: str

class ReconciliationItem(BaseModel):
    item_id: uuid.UUID
    item_name: str
    item_code: str
    item_type: str
    ledger_sum: Decimal
    reported_balance: Decimal
    is_reconciled: bool

class ReconciliationResponse(BaseModel):
    items: List[ReconciliationItem]
    all_reconciled: bool
    total_ledger_entries: int
