from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, Float, Integer, Boolean, Date, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ParseJob(Base):
    __tablename__ = "parse_jobs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    total_chunks: Mapped[int] = mapped_column(Integer, default=0)
    completed_chunks: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow, onupdate=datetime.utcnow
    )

    document: Mapped["Document"] = relationship("Document")


class FinancialStatement(Base):
    __tablename__ = "financial_statements"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), nullable=False)
    statement_type: Mapped[str] = mapped_column(String(50), nullable=False)
    period: Mapped[str] = mapped_column(String(100), nullable=False)
    period_end_date: Mapped[str | None] = mapped_column(String(50), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    source_pages: Mapped[str | None] = mapped_column(String(200), nullable=True)
    raw_response: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Review workflow
    review_status: Mapped[str] = mapped_column(String(20), default="pending")
    reviewer_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)

    # Investment mapping
    investment_id: Mapped[int | None] = mapped_column(ForeignKey("investments.id"), nullable=True)
    reporting_date: Mapped[str | None] = mapped_column(String(50), nullable=True)
    fiscal_period_label: Mapped[str | None] = mapped_column(String(100), nullable=True)

    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow, onupdate=datetime.utcnow
    )

    line_items: Mapped[list["LineItem"]] = relationship(
        "LineItem", back_populates="statement", cascade="all, delete-orphan",
        order_by="LineItem.sort_order"
    )
    investment: Mapped["Investment | None"] = relationship(
        "Investment", foreign_keys=[investment_id]
    )


class LineItem(Base):
    __tablename__ = "line_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    statement_id: Mapped[int] = mapped_column(ForeignKey("financial_statements.id"), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_total: Mapped[bool] = mapped_column(Boolean, default=False)
    indent_level: Mapped[int] = mapped_column(Integer, default=0)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    # Edit tracking
    edited_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    edited_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_user_modified: Mapped[bool] = mapped_column(Boolean, default=False)
    # Normalization
    canonical_label: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Provenance / extraction traceability
    source_page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_bbox: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON [x0,y0,x1,y1]
    extraction_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    original_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    extracted_text_snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_modified_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_modified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    statement: Mapped["FinancialStatement"] = relationship(
        "FinancialStatement", back_populates="line_items"
    )

    @property
    def display_label(self) -> str:
        return self.edited_label if self.edited_label is not None else self.label

    @property
    def display_value(self) -> float | None:
        return self.edited_value if self.edited_value is not None else self.value


class EditLog(Base):
    """Audit trail for line item edits."""
    __tablename__ = "edit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    line_item_id: Mapped[int] = mapped_column(ForeignKey("line_items.id"), nullable=False)
    field: Mapped[str] = mapped_column(String(50), nullable=False)
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    user: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)


from app.documents.models import Document  # noqa: E402, F401
from app.investments.models import Investment  # noqa: E402, F401
