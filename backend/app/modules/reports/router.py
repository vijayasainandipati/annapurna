import io
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import get_current_user, require_roles
from app.models.user import User, RoleEnum
from app.schemas.reports import (
    SalesRegisterReport, GSTSummaryReport,
    StockLedgerReport, ProductionVarianceReport, BatchCostingReport
)
from app.services.report_service import ReportService

router = APIRouter(prefix="/reports", tags=["Reports & Analytics"])

@router.get("/sales-register")
async def get_sales_register(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    format: str = Query(default="json", pattern="^(json|csv|excel)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RoleEnum.ADMIN, RoleEnum.ACCOUNTANT, RoleEnum.OWNER]))
):
    report = await ReportService.get_sales_register(db, start_date, end_date)
    if format == "csv":
        csv_data = ReportService.export_sales_register_csv(report)
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="sales_register.csv"'}
        )
    elif format == "excel":
        excel_stream = ReportService.export_sales_register_excel(report)
        return StreamingResponse(
            excel_stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="sales_register.xlsx"'}
        )
    return report

@router.get("/gst-summary")
async def get_gst_summary(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    format: str = Query(default="json", pattern="^(json|excel)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RoleEnum.ADMIN, RoleEnum.ACCOUNTANT, RoleEnum.OWNER]))
):
    report = await ReportService.get_gst_summary(db, year, month)
    if format == "excel":
        excel_stream = ReportService.export_gst_summary_excel(report)
        return StreamingResponse(
            excel_stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="gstr1_summary_{report.period}.xlsx"'}
        )
    return report

@router.get("/stock-ledger")
async def get_stock_ledger_report(
    format: str = Query(default="json", pattern="^(json|excel)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RoleEnum.ADMIN, RoleEnum.ACCOUNTANT, RoleEnum.OWNER, RoleEnum.PRODUCTION_SUPERVISOR]))
):
    report = await ReportService.get_stock_ledger_report(db)
    if format == "excel":
        excel_stream = ReportService.export_stock_ledger_excel(report)
        return StreamingResponse(
            excel_stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="stock_ledger_summary.xlsx"'}
        )
    return report

@router.get("/production-variance")
async def get_production_variance_report(
    format: str = Query(default="json", pattern="^(json|excel)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RoleEnum.ADMIN, RoleEnum.OWNER, RoleEnum.PRODUCTION_SUPERVISOR]))
):
    report = await ReportService.get_production_variance_report(db)
    if format == "excel":
        excel_stream = ReportService.export_production_variance_excel(report)
        return StreamingResponse(
            excel_stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="production_variance.xlsx"'}
        )
    return report

@router.get("/batch-costing")
async def get_batch_costing_report(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RoleEnum.ADMIN, RoleEnum.ACCOUNTANT, RoleEnum.OWNER]))
):
    return await ReportService.get_batch_costing_report(db)
