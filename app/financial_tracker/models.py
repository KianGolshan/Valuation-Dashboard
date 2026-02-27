from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class InvestmentReportingSettings(Base):
    __tablename__ = "investment_reporting_settings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    investment_id: Mapped[int] = mapped_column(
        ForeignKey("investments.id"), nullable=False, unique=True
    )
    reporting_frequency: Mapped[str] = mapped_column(
        String(20), nullable=False, default="quarterly"
    )  # "quarterly" | "monthly"
    fiscal_year_end_month: Mapped[int] = mapped_column(
        Integer, nullable=False, default=12
    )  # 1–12
    track_audited_annual: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    lookback_years: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow, onupdate=datetime.utcnow
    )


class FinancialPeriodRecord(Base):
    __tablename__ = "financial_period_records"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    investment_id: Mapped[int] = mapped_column(
        ForeignKey("investments.id"), nullable=False
    )
    fiscal_year: Mapped[int] = mapped_column(Integer, nullable=False)
    period_label: Mapped[str] = mapped_column(String(20), nullable=False)
    # Values: "Q1"|"Q2"|"Q3"|"Q4"|"FY"|"FY_Audited"|"Jan"|"Feb"|...|"Dec"
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )  # "received"|"pending"|"expected"|"flagged"
    auto_detected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    received_date: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    statement_ids: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow, onupdate=datetime.utcnow
    )

    __table_args__ = (
        UniqueConstraint("investment_id", "fiscal_year", "period_label"),
    )


from app.investments.models import Investment  # noqa: E402, F401
