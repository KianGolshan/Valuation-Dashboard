from datetime import datetime
from typing import Optional

from sqlalchemy import ForeignKey, String, Text, Float, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ValuationRecord(Base):
    __tablename__ = "valuation_records"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    investment_id: Mapped[int] = mapped_column(ForeignKey("investments.id"), nullable=False)
    valuation_date: Mapped[str] = mapped_column(String(50), nullable=False)
    methodology: Mapped[str] = mapped_column(String(100), nullable=False)
    revenue_multiple: Mapped[float | None] = mapped_column(Float, nullable=True)
    ebitda_multiple: Mapped[float | None] = mapped_column(Float, nullable=True)
    discount_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    implied_enterprise_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    implied_equity_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence_flag: Mapped[str | None] = mapped_column(String(20), nullable=True)  # high, medium, low
    analyst_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # New fields
    price_per_share: Mapped[float | None] = mapped_column(Float, nullable=True)
    security_id: Mapped[int | None] = mapped_column(ForeignKey("securities.id"), nullable=True)
    multiple: Mapped[float | None] = mapped_column(Float, nullable=True)
    financial_metric: Mapped[str | None] = mapped_column(String(100), nullable=True)
    financial_metric_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow, onupdate=datetime.utcnow
    )

    investment: Mapped["Investment"] = relationship("Investment", foreign_keys=[investment_id])
    security: Mapped[Optional["Security"]] = relationship("Security", foreign_keys=[security_id])


from app.investments.models import Investment  # noqa: E402, F401
from app.securities.models import Security  # noqa: E402, F401
