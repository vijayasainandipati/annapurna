import uuid
from datetime import datetime, timezone, date
from decimal import Decimal
from typing import List, Optional
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.models.finance import Payment, PaymentMethodEnum
from app.models.sales import Invoice, InvoiceStatusEnum
from app.models.master import Customer
from app.models.user import User
from app.models.outbox import OutboxEvent
from app.schemas.finance import PaymentCreate, PaymentResponse, CustomerReceivable, ReceivablesSummaryResponse

class PaymentService:
    @staticmethod
    async def record_payment(
        db: AsyncSession,
        user: User,
        payment_in: PaymentCreate
    ) -> PaymentResponse:
        # Verify customer exists
        cust_res = await db.execute(select(Customer).where(Customer.id == payment_in.customer_id))
        customer = cust_res.scalar_one_or_none()
        if not customer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Customer not found"
            )

        # Target invoice
        target_invoice: Optional[Invoice] = None
        if payment_in.invoice_id:
            inv_res = await db.execute(
                select(Invoice).where(
                    and_(
                        Invoice.id == payment_in.invoice_id,
                        Invoice.customer_id == payment_in.customer_id
                    )
                )
            )
            target_invoice = inv_res.scalar_one_or_none()
            if not target_invoice:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Specified invoice not found for this customer"
                )
        else:
            # Auto-assign to oldest unpaid invoice (FIFO)
            inv_res = await db.execute(
                select(Invoice)
                .where(
                    and_(
                        Invoice.customer_id == payment_in.customer_id,
                        Invoice.status.in_([InvoiceStatusEnum.ISSUED.value, InvoiceStatusEnum.PARTIALLY_PAID.value]),
                        Invoice.total_amount > Invoice.paid_amount
                    )
                )
                .order_by(Invoice.created_at.asc())
            )
            target_invoice = inv_res.scalars().first()
            if not target_invoice:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Customer has no outstanding unpaid invoices to allocate payment"
                )

        # Calculate outstanding balance on invoice
        outstanding = target_invoice.total_amount - target_invoice.paid_amount
        if payment_in.amount > outstanding:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Payment amount ₹{payment_in.amount} exceeds invoice outstanding balance ₹{outstanding}"
            )

        # Generate sequential payment number: PAY-2026-XXXX
        today = date.today()
        year = today.year
        count_query = await db.execute(
            select(func.count(Payment.id)).where(Payment.payment_number.like(f"PAY-{year}-%"))
        )
        pay_count = count_query.scalar() or 0
        payment_number = f"PAY-{year}-{(pay_count + 1):04d}"

        # Create Payment
        payment = Payment(
            payment_number=payment_number,
            invoice_id=target_invoice.id,
            customer_id=customer.id,
            amount=payment_in.amount,
            payment_method=payment_in.payment_method,
            reference_number=payment_in.reference_number,
            payment_date=payment_in.payment_date or today,
            recorded_by=user.id
        )
        db.add(payment)

        # Update invoice paid_amount and status
        target_invoice.paid_amount += payment_in.amount
        if target_invoice.paid_amount >= target_invoice.total_amount:
            target_invoice.status = InvoiceStatusEnum.PAID.value
        else:
            target_invoice.status = InvoiceStatusEnum.PARTIALLY_PAID.value

        inv_rem_balance = target_invoice.total_amount - target_invoice.paid_amount

        # Calculate remaining total customer balance across all invoices
        await db.flush()
        cust_invs = await db.execute(
            select(Invoice).where(
                and_(
                    Invoice.customer_id == customer.id,
                    Invoice.status.in_([InvoiceStatusEnum.ISSUED.value, InvoiceStatusEnum.PARTIALLY_PAID.value])
                )
            )
        )
        all_cust_invoices = cust_invs.scalars().all()
        customer_remaining_balance = sum(
            (inv.total_amount - inv.paid_amount) for inv in all_cust_invoices
        )

        # Create transactional outbox event
        outbox = OutboxEvent(
            event_type="PAYMENT_RECEIVED",
            channel="finance",
            payload={
                "payment_id": str(payment.id),
                "payment_number": payment.payment_number,
                "customer_name": customer.business_name,
                "amount": float(payment.amount),
                "invoice_number": target_invoice.invoice_number,
                "invoice_remaining_balance": float(inv_rem_balance),
                "customer_remaining_balance": float(customer_remaining_balance)
            }
        )
        db.add(outbox)
        await db.commit()
        await db.refresh(payment)

        return PaymentResponse(
            id=payment.id,
            payment_number=payment.payment_number,
            invoice_id=target_invoice.id,
            invoice_number=target_invoice.invoice_number,
            customer_id=customer.id,
            customer_name=customer.business_name,
            amount=payment.amount,
            payment_method=payment.payment_method,
            reference_number=payment.reference_number,
            payment_date=payment.payment_date,
            recorded_by_name=user.full_name,
            created_at=payment.created_at,
            invoice_remaining_balance=inv_rem_balance,
            customer_remaining_balance=customer_remaining_balance
        )

    @staticmethod
    async def get_receivables_summary(db: AsyncSession) -> ReceivablesSummaryResponse:
        # Load all active customers
        cust_res = await db.execute(
            select(Customer).where(Customer.is_active == True).order_by(Customer.business_name.asc())
        )
        customers = cust_res.scalars().all()

        today = date.today()
        customer_receivables: List[CustomerReceivable] = []
        overall_total_receivables = Decimal("0.00")
        customers_with_dues_count = 0

        for cust in customers:
            # Query all open invoices
            inv_res = await db.execute(
                select(Invoice).where(
                    and_(
                        Invoice.customer_id == cust.id,
                        Invoice.status.in_([InvoiceStatusEnum.ISSUED.value, InvoiceStatusEnum.PARTIALLY_PAID.value]),
                        Invoice.total_amount > Invoice.paid_amount
                    )
                ).order_by(Invoice.created_at.asc())
            )
            invoices = inv_res.scalars().all()

            cust_balance = Decimal("0.00")
            b_0_30 = Decimal("0.00")
            b_31_60 = Decimal("0.00")
            b_61_90 = Decimal("0.00")
            b_90_plus = Decimal("0.00")

            for inv in invoices:
                due = inv.total_amount - inv.paid_amount
                cust_balance += due
                days = (today - inv.created_at.date()).days

                if days <= 30:
                    b_0_30 += due
                elif days <= 60:
                    b_31_60 += due
                elif days <= 90:
                    b_61_90 += due
                else:
                    b_90_plus += due

            if cust_balance > Decimal("0.00"):
                customers_with_dues_count += 1
                overall_total_receivables += cust_balance

            customer_receivables.append(
                CustomerReceivable(
                    customer_id=cust.id,
                    business_name=cust.business_name,
                    contact_person=cust.contact_person,
                    phone=cust.phone,
                    state=cust.state,
                    gstin=cust.gstin,
                    credit_limit=cust.credit_limit,
                    current_balance=cust_balance,
                    bucket_0_30=b_0_30,
                    bucket_31_60=b_31_60,
                    bucket_61_90=b_61_90,
                    bucket_90_plus=b_90_plus,
                    unpaid_invoices_count=len(invoices)
                )
            )

        return ReceivablesSummaryResponse(
            total_receivables=overall_total_receivables,
            total_customers_with_dues=customers_with_dues_count,
            customers=customer_receivables
        )

    @staticmethod
    async def list_payments(db: AsyncSession, limit: int = 100) -> List[PaymentResponse]:
        query = (
            select(Payment, Invoice, Customer, User)
            .join(Invoice, Payment.invoice_id == Invoice.id)
            .join(Customer, Payment.customer_id == Customer.id)
            .join(User, Payment.recorded_by == User.id)
            .order_by(Payment.created_at.desc())
            .limit(limit)
        )
        res = await db.execute(query)
        rows = res.all()

        result = []
        for payment, invoice, customer, user in rows:
            inv_rem = invoice.total_amount - invoice.paid_amount
            result.append(
                PaymentResponse(
                    id=payment.id,
                    payment_number=payment.payment_number,
                    invoice_id=invoice.id,
                    invoice_number=invoice.invoice_number,
                    customer_id=customer.id,
                    customer_name=customer.business_name,
                    amount=payment.amount,
                    payment_method=payment.payment_method,
                    reference_number=payment.reference_number,
                    payment_date=payment.payment_date,
                    recorded_by_name=user.full_name,
                    created_at=payment.created_at,
                    invoice_remaining_balance=inv_rem,
                    customer_remaining_balance=Decimal("0.00")  # Summary level
                )
            )
        return result
