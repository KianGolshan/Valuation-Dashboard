from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class InvestmentProfile(Base):
    __tablename__ = "investment_profiles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    investment_id: Mapped[int] = mapped_column(
        ForeignKey("investments.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    sector: Mapped[str | None] = mapped_column(String(100))
    sub_sector: Mapped[str | None] = mapped_column(String(100))
    stage: Mapped[str | None] = mapped_column(String(50))
    geography: Mapped[str | None] = mapped_column(String(100))
    primary_metric: Mapped[str | None] = mapped_column(String(50))
    last_updated: Mapped[datetime] = mapped_column(
        default=datetime.utcnow, onupdate=datetime.utcnow
    )

    investment: Mapped["Investment"] = relationship("Investment", backref="profile")


class CompSet(Base):
    __tablename__ = "comp_sets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    investment_id: Mapped[int] = mapped_column(
        ForeignKey("investments.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(default=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    investment: Mapped["Investment"] = relationship("Investment")
    companies: Mapped[list["CompSetCompany"]] = relationship(
        "CompSetCompany", back_populates="comp_set", cascade="all, delete-orphan"
    )


class CompSetCompany(Base):
    __tablename__ = "comp_set_companies"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    comp_set_id: Mapped[int] = mapped_column(
        ForeignKey("comp_sets.id", ondelete="CASCADE"), nullable=False
    )
    ticker: Mapped[str] = mapped_column(String(20), nullable=False)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    rationale: Mapped[str | None] = mapped_column(Text)
    include_in_median: Mapped[bool] = mapped_column(default=True)
    added_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    comp_set: Mapped["CompSet"] = relationship("CompSet", back_populates="companies")

    __table_args__ = (
        UniqueConstraint("comp_set_id", "ticker", name="uq_comp_set_ticker"),
    )


class FmpCache(Base):
    __tablename__ = "fmp_cache"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    cache_key: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    response_json: Mapped[str] = mapped_column(Text, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)


# Avoid circular import — resolved at runtime by SQLAlchemy
from app.investments.models import Investment  # noqa: E402, F401
