import uuid
from enum import Enum
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import String, DateTime, Integer, Numeric, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

class ProductionRunStatusEnum(str, Enum):
    DRAFT = "DRAFT"
    POSTED = "POSTED"
    CANCELLED = "CANCELLED"

class ProductionRun(Base):
    __tablename__ = "production_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    bom_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("boms.id"), nullable=False, index=True)
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True)
    planned_quantity: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    actual_good_output: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    yield_variance_percent: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=Decimal("0.00"), nullable=False)
    
    # Packaging accounting
    damaged_pouches: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cartons_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    loose_packets_exception: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # Costs
    material_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    packaging_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    labour_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    gas_power_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    other_overhead_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    total_batch_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    cost_per_packet: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    
    status: Mapped[str] = mapped_column(String(30), default=ProductionRunStatusEnum.DRAFT.value, nullable=False, index=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    posted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    bom = relationship("BOM")
    product = relationship("Product")
    creator = relationship("User")
    issues: Mapped[list["ProductionIssue"]] = relationship("ProductionIssue", back_populates="production_run", cascade="all, delete-orphan")

class ProductionIssue(Base):
    __tablename__ = "production_issues"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    production_run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("production_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    material_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("materials.id"), nullable=False, index=True)
    planned_quantity: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    actual_quantity: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    variance_percent: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=Decimal("0.00"), nullable=False)
    valuation_rate_snapshot: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)

    production_run: Mapped["ProductionRun"] = relationship("ProductionRun", back_populates="issues")
    material = relationship("Material")
