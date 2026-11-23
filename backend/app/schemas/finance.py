import uuid
from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict

class PaymentCreate(BaseModel):
    customer_id: uuid.UUID
    invoice_id: Optional[uuid.UUID] = None
    amount: Decimal = Field(..., gt=0, decimal_places=2)
    payment_method: str = Field(default="BANK_TRANSFER")  # CASH, BANK_TRANSFER, UPI, CHEQUE
    reference_number: Optional[str] = None
    payment_date: Optional[date] = None

class PaymentResponse(BaseModel):
    id: uuid.UUID
    payment_number: str
    invoice_id: uuid.UUID
    invoice_number: str
    customer_id: uuid.UUID
    customer_name: str
    amount: Decimal
    payment_method: str
    reference_number: Optional[str] = None
    payment_date: date
    recorded_by_name: str
    created_at: datetime
    invoice_remaining_balance: Decimal
    customer_remaining_balance: Decimal

    model_config = ConfigDict(from_attributes=True)

class CustomerReceivable(BaseModel):
    customer_id: uuid.UUID
    business_name: str
    contact_person: Optional[str] = None
    phone: str
    state: str
    gstin: Optional[str] = None
    credit_limit: Decimal
    current_balance: Decimal
    bucket_0_30: Decimal
    bucket_31_60: Decimal
    bucket_61_90: Decimal
    bucket_90_plus: Decimal
    unpaid_invoices_count: int

    model_config = ConfigDict(from_attributes=True)

class ReceivablesSummaryResponse(BaseModel):
    total_receivables: Decimal
    total_customers_with_dues: int
    customers: List[CustomerReceivable]
