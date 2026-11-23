import io
import uuid
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime
from typing import List, Tuple
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

from app.models.sales import Invoice, InvoiceStatusEnum, SalesOrder, SalesOrderItem
from app.models.master import Customer, Product
from app.models.user import User

SELLER_NAME = "Annapurna Foods Pvt. Ltd."
SELLER_ADDRESS = "Plot 12, SIDCO Industrial Estate, Kappalur, Madurai, Tamil Nadu 625008"
SELLER_GSTIN = "33AAACA1111A1Z1"
SELLER_STATE = "Tamil Nadu"
SELLER_STATE_CODE = "33"

class InvoiceService:
    @staticmethod
    async def generate_invoice_number(db: AsyncSession) -> str:
        """Generates sequential financial-year invoice number (e.g. INV-2026-27/0001)."""
        stmt = select(func.count(Invoice.id))
        res = await db.execute(stmt)
        count = res.scalar_one() + 1
        return f"INV-2026-27/{count:04d}"

    @staticmethod
    def calculate_gst_breakup(
        taxable_value: Decimal,
        gst_rate_percent: Decimal,
        customer_state: str
    ) -> Tuple[Decimal, Decimal, Decimal]:
        """
        Calculates CGST/SGST or IGST depending on customer state:
        - Intra-state (Tamil Nadu): 2.5% CGST + 2.5% SGST
        - Inter-state (e.g. Karnataka): 5.0% IGST
        """
        taxable = Decimal(str(taxable_value))
        rate = Decimal(str(gst_rate_percent))
        is_intra = (customer_state.strip().lower() == SELLER_STATE.lower())

        if is_intra:
            half_rate = (rate / Decimal("2.0")).quantize(Decimal("0.001"))
            cgst = ((taxable * half_rate) / Decimal("100.0")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            sgst = ((taxable * half_rate) / Decimal("100.0")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            igst = Decimal("0.00")
        else:
            cgst = Decimal("0.00")
            sgst = Decimal("0.00")
            igst = ((taxable * rate) / Decimal("100.0")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        return cgst, sgst, igst

    @staticmethod
    def build_pdf_invoice(invoice: Invoice, order: SalesOrder, customer: Customer, items: List[SalesOrderItem]) -> bytes:
        """Renders an authentic, print-ready GST Tax Invoice as a PDF byte stream using ReportLab."""
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=36,
            rightMargin=36,
            topMargin=36,
            bottomMargin=36
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            "TitleStyle",
            parent=styles["Heading1"],
            fontSize=16,
            leading=20,
            textColor=colors.HexColor("#C45C26"), # Deep Turmeric
            alignment=1
        )
        subtitle_style = ParagraphStyle(
            "SubTitleStyle",
            parent=styles["Normal"],
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#2C2A26"),
            alignment=1
        )
        section_heading = ParagraphStyle(
            "SectionHeading",
            parent=styles["Heading2"],
            fontSize=10,
            leading=13,
            textColor=colors.HexColor("#6B4F3A"),
            fontName="Helvetica-Bold"
        )
        body_style = ParagraphStyle(
            "Body",
            parent=styles["Normal"],
            fontSize=8,
            leading=11,
            textColor=colors.HexColor("#2C2A26")
        )
        bold_body = ParagraphStyle(
            "BoldBody",
            parent=body_style,
            fontName="Helvetica-Bold"
        )

        story = []

        # 1. Header Banner
        story.append(Paragraph("TAX INVOICE", title_style))
        story.append(Paragraph(f"<b>{SELLER_NAME}</b> | {SELLER_ADDRESS}", subtitle_style))
        story.append(Paragraph(f"GSTIN: <b>{SELLER_GSTIN}</b> | State: {SELLER_STATE} (Code: {SELLER_STATE_CODE})", subtitle_style))
        story.append(Spacer(1, 12))
        story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#E07A3D"), spaceAfter=10))

        # 2. Invoice & Customer Meta Grid
        is_intra = (customer.state.strip().lower() == SELLER_STATE.lower())
        tax_type_label = "INTRA-STATE (CGST + SGST)" if is_intra else "INTER-STATE (IGST)"

        buyer_text = f"""
        <b>Bill To (Customer Details):</b><br/>
        <b>{customer.business_name}</b><br/>
        Contact: {customer.contact_person or 'N/A'}<br/>
        Phone: {customer.phone}<br/>
        State: <b>{customer.state}</b><br/>
        GSTIN: <b>{customer.gstin or 'URP (Unregistered)'}</b>
        """

        invoice_meta_text = f"""
        <b>Invoice Number:</b> <font color="#C45C26"><b>{invoice.invoice_number}</b></font><br/>
        <b>Invoice Date:</b> {invoice.created_at.strftime('%d-%b-%Y')}<br/>
        <b>Order Reference:</b> {order.order_number}<br/>
        <b>Supply Type:</b> {tax_type_label}<br/>
        <b>Payment Status:</b> <b>{invoice.status}</b>
        """

        meta_table = Table(
            [
                [Paragraph(buyer_text, body_style), Paragraph(invoice_meta_text, body_style)]
            ],
            colWidths=[270, 250]
        )
        meta_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FDF6E9")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E8D9C5")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ]))
        story.append(meta_table)
        story.append(Spacer(1, 14))

        # 3. Line Items Table
        headers = ["S.N", "Item Description", "HSN", "Qty", "Rate (₹)", "Taxable (₹)", "CGST (₹)", "SGST (₹)", "IGST (₹)", "Total (₹)"]
        rows = [headers]

        for idx, it in enumerate(items, 1):
            prod = it.product
            cgst_i, sgst_i, igst_i = InvoiceService.calculate_gst_breakup(it.taxable_amount, prod.gst_rate_percent, customer.state)
            rows.append([
                str(idx),
                f"{prod.name} ({prod.sku})",
                prod.hsn_code,
                str(it.quantity),
                f"{it.unit_price:.2f}",
                f"{it.taxable_amount:.2f}",
                f"{cgst_i:.2f}" if cgst_i > 0 else "-",
                f"{sgst_i:.2f}" if sgst_i > 0 else "-",
                f"{igst_i:.2f}" if igst_i > 0 else "-",
                f"{it.line_total:.2f}"
            ])

        # Col Widths total = 522 pt
        col_w = [25, 127, 45, 35, 45, 55, 45, 45, 45, 55]
        item_table = Table(rows, colWidths=col_w)
        item_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E07A3D")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("ALIGN", (2, 0), (2, -1), "CENTER"),
            ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E8D9C5")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FFFBF5")]),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(item_table)
        story.append(Spacer(1, 10))

        # 4. Tax Summary & Totals Block
        summary_rows = [
            ["Total Taxable Value:", f"₹ {invoice.taxable_amount:.2f}"],
        ]
        if is_intra:
            summary_rows.append(["CGST @ 2.5%:", f"₹ {invoice.cgst_amount:.2f}"])
            summary_rows.append(["SGST @ 2.5%:", f"₹ {invoice.sgst_amount:.2f}"])
        else:
            summary_rows.append(["IGST @ 5.0%:", f"₹ {invoice.igst_amount:.2f}"])

        summary_rows.append(["Invoice Total (INR):", f"₹ {invoice.total_amount:.2f}"])
        summary_rows.append(["Amount Paid:", f"₹ {invoice.paid_amount:.2f}"])
        outstanding = invoice.total_amount - invoice.paid_amount
        summary_rows.append(["Balance Due:", f"₹ {outstanding:.2f}"])

        sum_table = Table(summary_rows, colWidths=[140, 100])
        sum_table.setStyle(TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("FONTNAME", (0, -3), (-1, -3), "Helvetica-Bold"),
            ("BACKGROUND", (0, -3), (-1, -3), colors.HexColor("#FDF6E9")),
            ("LINEBELOW", (0, -3), (-1, -3), 1, colors.HexColor("#C45C26")),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))

        # Place summary on the right side
        container_table = Table(
            [[Paragraph("<b>Declaration:</b> We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.", body_style), sum_table]],
            colWidths=[280, 242]
        )
        container_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(container_table)
        story.append(Spacer(1, 20))

        # 5. Signatory Footer
        footer_data = [
            [Paragraph("Prepared By: System Generated", body_style), Paragraph("For <b>Annapurna Foods Pvt. Ltd.</b><br/><br/><br/><b>Authorised Signatory</b>", ParagraphStyle("RAlign", parent=body_style, alignment=2))]
        ]
        footer_table = Table(footer_data, colWidths=[260, 262])
        story.append(footer_table)

        doc.build(story)
        pdf_bytes = buffer.getvalue()
        buffer.close()
        return pdf_bytes
