import io
import csv
from datetime import datetime, timezone, date
from decimal import Decimal
from typing import Optional, List
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from app.models.sales import Invoice, InvoiceStatusEnum, SalesOrder
from app.models.master import Customer, Product, Material
from app.models.inventory import StockLedger, StockMovementSourceEnum
from app.models.production import ProductionRun
from app.schemas.reports import (
    SalesRegisterReport, SalesRegisterRow,
    GSTSummaryReport, GSTCategorySummary,
    StockLedgerReport, StockLedgerReportRow,
    ProductionVarianceReport, ProductionVarianceReportRow,
    BatchCostingReport, BatchCostingReportRow
)

# Header style: Annapurna Terracotta Theme
HEADER_FILL = PatternFill(start_color="C45C26", end_color="C45C26", fill_type="solid")
HEADER_FONT = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
TOTAL_FILL = PatternFill(start_color="FDF6E9", end_color="FDF6E9", fill_type="solid")
BOLD_FONT = Font(name="Calibri", size=11, bold=True)
THIN_BORDER = Border(
    left=Side(style='thin', color='DDDDDD'),
    right=Side(style='thin', color='DDDDDD'),
    top=Side(style='thin', color='DDDDDD'),
    bottom=Side(style='thin', color='DDDDDD')
)

class ReportService:
    @staticmethod
    async def get_sales_register(
        db: AsyncSession,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> SalesRegisterReport:
        query = (
            select(Invoice, SalesOrder, Customer)
            .join(SalesOrder, Invoice.order_id == SalesOrder.id)
            .join(Customer, Invoice.customer_id == Customer.id)
            .order_by(Invoice.created_at.desc())
        )
        if start_date:
            query = query.where(Invoice.created_at >= datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc))
        if end_date:
            query = query.where(Invoice.created_at <= datetime.combine(end_date, datetime.max.time(), tzinfo=timezone.utc))

        res = await db.execute(query)
        rows = res.all()

        invoice_rows: List[SalesRegisterRow] = []
        tot_taxable = Decimal("0.00")
        tot_cgst = Decimal("0.00")
        tot_sgst = Decimal("0.00")
        tot_igst = Decimal("0.00")
        tot_sales = Decimal("0.00")
        tot_collected = Decimal("0.00")
        tot_outstanding = Decimal("0.00")

        for inv, order, cust in rows:
            bal = inv.total_amount - inv.paid_amount
            tot_taxable += inv.taxable_amount
            tot_cgst += inv.cgst_amount
            tot_sgst += inv.sgst_amount
            tot_igst += inv.igst_amount
            tot_sales += inv.total_amount
            tot_collected += inv.paid_amount
            tot_outstanding += bal

            invoice_rows.append(
                SalesRegisterRow(
                    invoice_number=inv.invoice_number,
                    invoice_date=inv.created_at,
                    order_number=order.order_number,
                    customer_name=cust.business_name,
                    customer_state=inv.customer_state,
                    customer_gstin=inv.customer_gstin,
                    taxable_amount=inv.taxable_amount,
                    cgst_amount=inv.cgst_amount,
                    sgst_amount=inv.sgst_amount,
                    igst_amount=inv.igst_amount,
                    total_amount=inv.total_amount,
                    paid_amount=inv.paid_amount,
                    balance_amount=bal,
                    status=inv.status
                )
            )

        return SalesRegisterReport(
            total_invoices=len(invoice_rows),
            total_taxable=tot_taxable,
            total_cgst=tot_cgst,
            total_sgst=tot_sgst,
            total_igst=tot_igst,
            total_sales=tot_sales,
            total_collected=tot_collected,
            total_outstanding=tot_outstanding,
            invoices=invoice_rows
        )

    @staticmethod
    def export_sales_register_csv(report: SalesRegisterReport) -> str:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "Invoice Number", "Invoice Date", "Order Number", "Customer Name",
            "State", "GSTIN", "Taxable Amount", "CGST", "SGST", "IGST",
            "Total Amount", "Paid Amount", "Balance Due", "Status"
        ])
        for row in report.invoices:
            writer.writerow([
                row.invoice_number,
                row.invoice_date.strftime("%Y-%m-%d %H:%M"),
                row.order_number,
                row.customer_name,
                row.customer_state,
                row.customer_gstin or "URP",
                f"{row.taxable_amount:.2f}",
                f"{row.cgst_amount:.2f}",
                f"{row.sgst_amount:.2f}",
                f"{row.igst_amount:.2f}",
                f"{row.total_amount:.2f}",
                f"{row.paid_amount:.2f}",
                f"{row.balance_amount:.2f}",
                row.status
            ])
        writer.writerow([
            "TOTAL", "", "", f"{report.total_invoices} Invoices",
            "", "",
            f"{report.total_taxable:.2f}",
            f"{report.total_cgst:.2f}",
            f"{report.total_sgst:.2f}",
            f"{report.total_igst:.2f}",
            f"{report.total_sales:.2f}",
            f"{report.total_collected:.2f}",
            f"{report.total_outstanding:.2f}",
            ""
        ])
        return output.getvalue()

    @staticmethod
    def export_sales_register_excel(report: SalesRegisterReport) -> io.BytesIO:
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Sales Register"

        headers = [
            "Invoice Number", "Invoice Date", "Order Number", "Customer Name",
            "State", "GSTIN", "Taxable Amount", "CGST", "SGST", "IGST",
            "Total Amount", "Paid Amount", "Balance Due", "Status"
        ]
        ws.append(headers)

        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.fill = HEADER_FILL
            cell.font = HEADER_FONT
            cell.alignment = Alignment(horizontal="center" if col_idx in [1, 2, 3, 5, 6, 14] else "right")

        for row_idx, r in enumerate(report.invoices, start=2):
            ws.append([
                r.invoice_number,
                r.invoice_date.strftime("%Y-%m-%d"),
                r.order_number,
                r.customer_name,
                r.customer_state,
                r.customer_gstin or "URP",
                float(r.taxable_amount),
                float(r.cgst_amount),
                float(r.sgst_amount),
                float(r.igst_amount),
                float(r.total_amount),
                float(r.paid_amount),
                float(r.balance_amount),
                r.status
            ])
            for col_idx in range(1, len(headers) + 1):
                cell = ws.cell(row=row_idx, column=col_idx)
                cell.border = THIN_BORDER
                if col_idx in [7, 8, 9, 10, 11, 12, 13]:
                    cell.number_format = '#,##0.00'

        # Total row
        total_row_idx = len(report.invoices) + 2
        ws.append([
            "TOTAL", "", "", f"{report.total_invoices} Invoices",
            "", "",
            float(report.total_taxable),
            float(report.total_cgst),
            float(report.total_sgst),
            float(report.total_igst),
            float(report.total_sales),
            float(report.total_collected),
            float(report.total_outstanding),
            ""
        ])
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=total_row_idx, column=col_idx)
            cell.font = BOLD_FONT
            cell.fill = TOTAL_FILL
            cell.border = THIN_BORDER
            if col_idx in [7, 8, 9, 10, 11, 12, 13]:
                cell.number_format = '#,##0.00'

        # Auto-fit column widths
        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

        stream = io.BytesIO()
        wb.save(stream)
        stream.seek(0)
        return stream

    @staticmethod
    async def get_gst_summary(
        db: AsyncSession,
        year: Optional[int] = None,
        month: Optional[int] = None
    ) -> GSTSummaryReport:
        query = select(Invoice).where(Invoice.status != InvoiceStatusEnum.CANCELLED.value)
        res = await db.execute(query)
        invoices = res.scalars().all()

        cats = {
            "b2b_intra": {"taxable": Decimal("0.00"), "cgst": Decimal("0.00"), "sgst": Decimal("0.00"), "igst": Decimal("0.00")},
            "b2b_inter": {"taxable": Decimal("0.00"), "cgst": Decimal("0.00"), "sgst": Decimal("0.00"), "igst": Decimal("0.00")},
            "b2c_intra": {"taxable": Decimal("0.00"), "cgst": Decimal("0.00"), "sgst": Decimal("0.00"), "igst": Decimal("0.00")},
            "b2c_inter": {"taxable": Decimal("0.00"), "cgst": Decimal("0.00"), "sgst": Decimal("0.00"), "igst": Decimal("0.00")},
        }

        for inv in invoices:
            is_b2b = bool(inv.customer_gstin and len(inv.customer_gstin.strip()) == 15)
            is_intra = (inv.customer_state.strip().upper() == "TAMIL NADU")

            if is_b2b and is_intra:
                key = "b2b_intra"
            elif is_b2b and not is_intra:
                key = "b2b_inter"
            elif not is_b2b and is_intra:
                key = "b2c_intra"
            else:
                key = "b2c_inter"

            cats[key]["taxable"] += inv.taxable_amount
            cats[key]["cgst"] += inv.cgst_amount
            cats[key]["sgst"] += inv.sgst_amount
            cats[key]["igst"] += inv.igst_amount

        def make_summary(label: str, data: dict) -> GSTCategorySummary:
            tot_tax = data["cgst"] + data["sgst"] + data["igst"]
            tot_val = data["taxable"] + tot_tax
            return GSTCategorySummary(
                category=label,
                taxable_value=data["taxable"],
                cgst_amount=data["cgst"],
                sgst_amount=data["sgst"],
                igst_amount=data["igst"],
                total_tax=tot_tax,
                total_invoice_value=tot_val
            )

        b2b_intra = make_summary("B2B Intrastate (TN)", cats["b2b_intra"])
        b2b_inter = make_summary("B2B Interstate (Other States)", cats["b2b_inter"])
        b2c_intra = make_summary("B2C Intrastate (TN)", cats["b2c_intra"])
        b2c_inter = make_summary("B2C Interstate (Other States)", cats["b2c_inter"])

        total_taxable = b2b_intra.taxable_value + b2b_inter.taxable_value + b2c_intra.taxable_value + b2c_inter.taxable_value
        total_cgst = b2b_intra.cgst_amount + b2b_inter.cgst_amount + b2c_intra.cgst_amount + b2c_inter.cgst_amount
        total_sgst = b2b_intra.sgst_amount + b2b_inter.sgst_amount + b2c_intra.sgst_amount + b2c_inter.sgst_amount
        total_igst = b2b_intra.igst_amount + b2b_inter.igst_amount + b2c_intra.igst_amount + b2c_inter.igst_amount
        total_tax = total_cgst + total_sgst + total_igst
        total_val = total_taxable + total_tax

        total_cat = GSTCategorySummary(
            category="TOTAL OUTWARD SUPPLIES",
            taxable_value=total_taxable,
            cgst_amount=total_cgst,
            sgst_amount=total_sgst,
            igst_amount=total_igst,
            total_tax=total_tax,
            total_invoice_value=total_val
        )

        period_str = f"{year or date.today().year}-{month or date.today().month:02d}"
        return GSTSummaryReport(
            period=period_str,
            b2b_intrastate=b2b_intra,
            b2b_interstate=b2b_inter,
            b2c_intrastate=b2c_intra,
            b2c_interstate=b2c_inter,
            total=total_cat
        )

    @staticmethod
    def export_gst_summary_excel(report: GSTSummaryReport) -> io.BytesIO:
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "GSTR-1 Outward Summary"

        headers = ["Supply Category", "Taxable Value (₹)", "CGST (₹)", "SGST (₹)", "IGST (₹)", "Total Tax (₹)", "Total Invoice Value (₹)"]
        ws.append(headers)

        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.fill = HEADER_FILL
            cell.font = HEADER_FONT
            cell.alignment = Alignment(horizontal="center" if col_idx == 1 else "right")

        cats = [report.b2b_intrastate, report.b2b_interstate, report.b2c_intrastate, report.b2c_interstate]
        for row_idx, cat in enumerate(cats, start=2):
            ws.append([
                cat.category,
                float(cat.taxable_value),
                float(cat.cgst_amount),
                float(cat.sgst_amount),
                float(cat.igst_amount),
                float(cat.total_tax),
                float(cat.total_invoice_value)
            ])
            for col_idx in range(1, len(headers) + 1):
                cell = ws.cell(row=row_idx, column=col_idx)
                cell.border = THIN_BORDER
                if col_idx > 1:
                    cell.number_format = '#,##0.00'

        # Total
        tot_idx = len(cats) + 2
        ws.append([
            report.total.category,
            float(report.total.taxable_value),
            float(report.total.cgst_amount),
            float(report.total.sgst_amount),
            float(report.total.igst_amount),
            float(report.total.total_tax),
            float(report.total.total_invoice_value)
        ])
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=tot_idx, column=col_idx)
            cell.font = BOLD_FONT
            cell.fill = TOTAL_FILL
            cell.border = THIN_BORDER
            if col_idx > 1:
                cell.number_format = '#,##0.00'

        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 3, 14)

        stream = io.BytesIO()
        wb.save(stream)
        stream.seek(0)
        return stream

    @staticmethod
    async def get_stock_ledger_report(db: AsyncSession) -> StockLedgerReport:
        # Fetch materials and products
        mat_res = await db.execute(select(Material).where(Material.is_active == True))
        materials = mat_res.scalars().all()

        prod_res = await db.execute(select(Product).where(Product.is_active == True))
        products = prod_res.scalars().all()

        report_rows: List[StockLedgerReportRow] = []
        grand_total_valuation = Decimal("0.00")

        # Materials
        for m in materials:
            entries_res = await db.execute(
                select(StockLedger).where(
                    StockLedger.material_id == m.id
                ).order_by(StockLedger.created_at.asc())
            )
            entries = entries_res.scalars().all()

            op = Decimal("0.0000")
            rc = Decimal("0.0000")
            iss = Decimal("0.0000")
            adj = Decimal("0.0000")
            cl = Decimal("0.0000")

            for e in entries:
                if e.source_type == StockMovementSourceEnum.OPENING_STOCK.value:
                    op += e.quantity_delta
                elif e.quantity_delta > 0:
                    rc += e.quantity_delta
                elif e.source_type == StockMovementSourceEnum.STOCK_ADJUSTMENT.value:
                    adj += e.quantity_delta
                else:
                    iss += abs(e.quantity_delta)
                cl += e.quantity_delta

            rate = m.current_valuation_rate
            val = cl * rate
            grand_total_valuation += val

            report_rows.append(
                StockLedgerReportRow(
                    item_type=f"MATERIAL ({m.category})",
                    item_code=m.code,
                    item_name=m.name,
                    unit=m.unit,
                    opening_balance=op,
                    receipts=rc,
                    issues=iss,
                    adjustments=adj,
                    closing_balance=cl,
                    valuation_rate=rate,
                    closing_value=val
                )
            )

        # Products
        for p in products:
            entries_res = await db.execute(
                select(StockLedger).where(
                    StockLedger.product_id == p.id
                ).order_by(StockLedger.created_at.asc())
            )
            entries = entries_res.scalars().all()

            op = Decimal("0.0000")
            rc = Decimal("0.0000")
            iss = Decimal("0.0000")
            adj = Decimal("0.0000")
            cl = Decimal("0.0000")

            for e in entries:
                if e.source_type == StockMovementSourceEnum.OPENING_STOCK.value:
                    op += e.quantity_delta
                elif e.quantity_delta > 0:
                    rc += e.quantity_delta
                elif e.source_type == StockMovementSourceEnum.STOCK_ADJUSTMENT.value:
                    adj += e.quantity_delta
                else:
                    iss += abs(e.quantity_delta)
                cl += e.quantity_delta

            # Finished goods standard unit valuation
            rate = p.base_selling_price * Decimal("0.65")  # approx manufacturing valuation
            val = cl * rate
            grand_total_valuation += val

            report_rows.append(
                StockLedgerReportRow(
                    item_type="PRODUCT (FINISHED GOOD)",
                    item_code=p.sku,
                    item_name=p.name,
                    unit="pkts",
                    opening_balance=op,
                    receipts=rc,
                    issues=iss,
                    adjustments=adj,
                    closing_balance=cl,
                    valuation_rate=rate,
                    closing_value=val
                )
            )

        return StockLedgerReport(
            generated_at=datetime.now(timezone.utc),
            items=report_rows,
            total_valuation_value=grand_total_valuation
        )

    @staticmethod
    def export_stock_ledger_excel(report: StockLedgerReport) -> io.BytesIO:
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Stock Ledger Summary"

        headers = ["Item Category", "Code/SKU", "Item Description", "Unit", "Opening", "Receipts", "Issues", "Adjustments", "Closing Stock", "Valuation Rate (₹)", "Closing Value (₹)"]
        ws.append(headers)

        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.fill = HEADER_FILL
            cell.font = HEADER_FONT
            cell.alignment = Alignment(horizontal="center" if col_idx in [1, 2, 4] else ("left" if col_idx == 3 else "right"))

        for row_idx, r in enumerate(report.items, start=2):
            ws.append([
                r.item_type,
                r.item_code,
                r.item_name,
                r.unit,
                float(r.opening_balance),
                float(r.receipts),
                float(r.issues),
                float(r.adjustments),
                float(r.closing_balance),
                float(r.valuation_rate),
                float(r.closing_value)
            ])
            for col_idx in range(1, len(headers) + 1):
                cell = ws.cell(row=row_idx, column=col_idx)
                cell.border = THIN_BORDER
                if col_idx in [5, 6, 7, 8, 9]:
                    cell.number_format = '#,##0.00'
                elif col_idx in [10, 11]:
                    cell.number_format = '#,##0.0000' if col_idx == 10 else '#,##0.00'

        tot_idx = len(report.items) + 2
        ws.append([
            "TOTAL VALUATION", "", "", "", "", "", "", "", "", "",
            float(report.total_valuation_value)
        ])
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=tot_idx, column=col_idx)
            cell.font = BOLD_FONT
            cell.fill = TOTAL_FILL
            cell.border = THIN_BORDER
            if col_idx == 11:
                cell.number_format = '#,##0.00'

        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

        stream = io.BytesIO()
        wb.save(stream)
        stream.seek(0)
        return stream

    @staticmethod
    async def get_production_variance_report(db: AsyncSession) -> ProductionVarianceReport:
        query = (
            select(ProductionRun, Product)
            .join(Product, ProductionRun.product_id == Product.id)
            .order_by(ProductionRun.created_at.desc())
        )
        res = await db.execute(query)
        rows = res.all()

        variance_rows: List[ProductionVarianceReportRow] = []
        tot_std = Decimal("0.00")
        tot_act = Decimal("0.00")
        tot_yield_pct = Decimal("0.00")

        for run, prod in rows:
            tot_std += run.planned_quantity
            tot_act += Decimal(run.actual_good_output)
            tot_yield_pct += run.yield_variance_percent

            total_pouches = run.actual_good_output + run.damaged_pouches
            pkg_scrap = (Decimal(run.damaged_pouches) / Decimal(total_pouches) * Decimal("100.00")).quantize(Decimal("0.01")) if total_pouches > 0 else Decimal("0.00")

            variance_rows.append(
                ProductionVarianceReportRow(
                    batch_number=run.batch_number,
                    start_time=run.created_at,
                    product_name=prod.name,
                    standard_output_pkts=run.planned_quantity,
                    actual_output_pkts=Decimal(run.actual_good_output),
                    yield_variance_percent=run.yield_variance_percent,
                    damaged_pouches=run.damaged_pouches,
                    packaging_scrap_percent=pkg_scrap,
                    total_cost=run.total_batch_cost,
                    unit_cost=run.cost_per_packet
                )
            )

        avg_yield = (tot_yield_pct / len(rows)) if rows else Decimal("0.00")

        return ProductionVarianceReport(
            total_batches=len(variance_rows),
            total_standard_output_pkts=tot_std,
            total_actual_output_pkts=tot_act,
            average_yield_variance_percent=avg_yield,
            batches=variance_rows
        )

    @staticmethod
    def export_production_variance_excel(report: ProductionVarianceReport) -> io.BytesIO:
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Production Variance"

        headers = ["Batch Number", "Batch Date", "Product", "Std Output (pkts)", "Actual Output (pkts)", "Yield Variance %", "Damaged Pouches", "Pkg Scrap %", "Batch Cost (₹)", "Unit Cost (₹)"]
        ws.append(headers)

        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.fill = HEADER_FILL
            cell.font = HEADER_FONT
            cell.alignment = Alignment(horizontal="center" if col_idx in [1, 2] else "right")

        for row_idx, r in enumerate(report.batches, start=2):
            ws.append([
                r.batch_number,
                r.start_time.strftime("%Y-%m-%d"),
                r.product_name,
                float(r.standard_output_pkts),
                float(r.actual_output_pkts),
                float(r.yield_variance_percent),
                r.damaged_pouches,
                float(r.packaging_scrap_percent),
                float(r.total_cost),
                float(r.unit_cost)
            ])
            for col_idx in range(1, len(headers) + 1):
                cell = ws.cell(row=row_idx, column=col_idx)
                cell.border = THIN_BORDER
                if col_idx in [4, 5, 7]:
                    cell.number_format = '#,##0'
                elif col_idx in [6, 8]:
                    cell.number_format = '0.00"%"'
                elif col_idx in [9, 10]:
                    cell.number_format = '#,##0.00'

        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 3, 13)

        stream = io.BytesIO()
        wb.save(stream)
        stream.seek(0)
        return stream

    @staticmethod
    async def get_batch_costing_report(db: AsyncSession) -> BatchCostingReport:
        query = (
            select(ProductionRun, Product)
            .join(Product, ProductionRun.product_id == Product.id)
            .order_by(ProductionRun.created_at.desc())
        )
        res = await db.execute(query)
        rows = res.all()

        cost_rows: List[BatchCostingReportRow] = []
        for run, prod in rows:
            cost_rows.append(
                BatchCostingReportRow(
                    batch_number=run.batch_number,
                    product_name=prod.name,
                    good_units=Decimal(run.actual_good_output),
                    raw_material_cost=run.material_cost,
                    packaging_cost=run.packaging_cost,
                    labour_cost=run.labour_cost,
                    overhead_cost=run.gas_power_cost + run.other_overhead_cost,
                    total_cost=run.total_batch_cost,
                    cost_per_unit=run.cost_per_packet
                )
            )

        return BatchCostingReport(
            total_batches=len(cost_rows),
            batches=cost_rows
        )
