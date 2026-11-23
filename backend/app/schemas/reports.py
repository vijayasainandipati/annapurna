import uuid
from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, ConfigDict

class SalesRegisterRow(BaseModel):
    invoice_number: str
    invoice_date: datetime
    order_number: str
    customer_name: str
    customer_state: str
    customer_gstin: Optional[str] = None
    taxable_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    total_amount: Decimal
    paid_amount: Decimal
    balance_amount: Decimal
    status: str

    model_config = ConfigDict(from_attributes=True)

class SalesRegisterReport(BaseModel):
    total_invoices: int
    total_taxable: Decimal
    total_cgst: Decimal
    total_sgst: Decimal
    total_igst: Decimal
    total_sales: Decimal
    total_collected: Decimal
    total_outstanding: Decimal
    invoices: List[SalesRegisterRow]

class GSTCategorySummary(BaseModel):
    category: str
    taxable_value: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    total_tax: Decimal
    total_invoice_value: Decimal

class GSTSummaryReport(BaseModel):
    period: str
    b2b_intrastate: GSTCategorySummary
    b2b_interstate: GSTCategorySummary
    b2c_intrastate: GSTCategorySummary
    b2c_interstate: GSTCategorySummary
    total: GSTCategorySummary

class StockLedgerReportRow(BaseModel):
    item_type: str
    item_code: str
    item_name: str
    unit: str
    opening_balance: Decimal
    receipts: Decimal
    issues: Decimal
    adjustments: Decimal
    closing_balance: Decimal
    valuation_rate: Decimal
    closing_value: Decimal

class StockLedgerReport(BaseModel):
    generated_at: datetime
    items: List[StockLedgerReportRow]
    total_valuation_value: Decimal

class ProductionVarianceReportRow(BaseModel):
    batch_number: str
    start_time: datetime
    product_name: str
    standard_output_pkts: Decimal
    actual_output_pkts: Decimal
    yield_variance_percent: Decimal
    damaged_pouches: int
    packaging_scrap_percent: Decimal
    total_cost: Decimal
    unit_cost: Decimal

class ProductionVarianceReport(BaseModel):
    total_batches: int
    total_standard_output_pkts: Decimal
    total_actual_output_pkts: Decimal
    average_yield_variance_percent: Decimal
    batches: List[ProductionVarianceReportRow]

class BatchCostingReportRow(BaseModel):
    batch_number: str
    product_name: str
    good_units: Decimal
    raw_material_cost: Decimal
    packaging_cost: Decimal
    labour_cost: Decimal
    overhead_cost: Decimal
    total_cost: Decimal
    cost_per_unit: Decimal

class BatchCostingReport(BaseModel):
    total_batches: int
    batches: List[BatchCostingReportRow]
