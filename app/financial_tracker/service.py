"""Financial tracker service — manages period receipt tracking per investment."""

import json
import re
from datetime import datetime

from sqlalchemy.orm import Session

from app.financial_tracker.models import FinancialPeriodRecord, InvestmentReportingSettings
from app.financial_parsing.models import FinancialStatement

MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

MONTH_NAME_MAP = {m.lower(): m for m in MONTHS}
MONTH_NAME_FULL_MAP = {
    "january": "Jan", "february": "Feb", "march": "Mar", "april": "Apr",
    "may": "May", "june": "Jun", "july": "Jul", "august": "Aug",
    "september": "Sep", "october": "Oct", "november": "Nov", "december": "Dec",
}


def _parse_period_label(raw: str) -> tuple[int, str] | None:
    """Parse a fiscal_period_label string into (fiscal_year, period_label).

    Handles formats like:
      "Q1 2025", "Q1 FY25", "Q1FY2025"
      "FY2025", "FY 2025", "FY25"
      "January 2025", "Jan-25", "Jan 2025"
    Returns None if unparseable.
    """
    if not raw:
        return None
    s = raw.strip()

    # Q1–Q4 with year: "Q1 2025", "Q1 FY25", "Q1FY2025", "Q1-2025"
    m = re.match(
        r"(Q[1-4])\s*(?:FY)?\s*[-]?\s*(\d{2,4})",
        s,
        re.IGNORECASE,
    )
    if m:
        quarter = m.group(1).upper()
        yr = _parse_year(m.group(2))
        if yr:
            return (yr, quarter)

    # FY Audited: "FY2025 Audited", "Audited FY2025", "FY25 Audited Annual"
    m = re.search(
        r"(?:audited|annual).*FY\s*(\d{2,4})|FY\s*(\d{2,4}).*(?:audited|annual)",
        s,
        re.IGNORECASE,
    )
    if m:
        raw_yr = m.group(1) or m.group(2)
        yr = _parse_year(raw_yr)
        if yr:
            return (yr, "FY_Audited")

    # FY only: "FY2025", "FY 2025", "FY25"
    m = re.match(r"FY\s*[-]?\s*(\d{2,4})$", s, re.IGNORECASE)
    if m:
        yr = _parse_year(m.group(1))
        if yr:
            return (yr, "FY")

    # Monthly: "January 2025", "Jan 2025", "Jan-25"
    m = re.match(
        r"(January|February|March|April|May|June|July|August|September|October|November|December"
        r"|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
        r"\s*[-]?\s*(\d{2,4})",
        s,
        re.IGNORECASE,
    )
    if m:
        mon_raw = m.group(1).lower()
        mon_label = MONTH_NAME_FULL_MAP.get(mon_raw) or MONTH_NAME_MAP.get(mon_raw)
        yr = _parse_year(m.group(2))
        if mon_label and yr:
            return (yr, mon_label)

    return None


def _parse_year(yr_str: str) -> int | None:
    try:
        yr = int(yr_str)
        if yr < 100:
            yr += 2000
        if 2000 <= yr <= 2100:
            return yr
    except ValueError:
        pass
    return None


def _expected_periods(settings: InvestmentReportingSettings, fiscal_year: int) -> list[str]:
    """Return the list of expected period labels for a given fiscal year + settings."""
    periods: list[str] = []
    if settings.reporting_frequency == "monthly":
        periods.extend(MONTHS)
    else:
        periods.extend(["Q1", "Q2", "Q3", "Q4"])
    if settings.track_audited_annual:
        periods.append("FY_Audited")
    return periods


# ── Public functions ──────────────────────────────────────────────────────────

def get_or_create_settings(db: Session, investment_id: int) -> InvestmentReportingSettings:
    settings = (
        db.query(InvestmentReportingSettings)
        .filter(InvestmentReportingSettings.investment_id == investment_id)
        .first()
    )
    if not settings:
        settings = InvestmentReportingSettings(investment_id=investment_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def upsert_settings(db: Session, investment_id: int, data: dict) -> InvestmentReportingSettings:
    settings = get_or_create_settings(db, investment_id)
    for key, value in data.items():
        if value is not None:
            setattr(settings, key, value)
    settings.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(settings)
    return settings


def _derive_period_from_date(period_end_date: str | None) -> tuple[int, str] | None:
    """Derive (fiscal_year, period_label) from a period_end_date string (YYYY-MM-DD).

    Maps calendar months to standard quarters:
      Jan–Mar → Q1, Apr–Jun → Q2, Jul–Sep → Q3, Oct–Dec → Q4
    """
    if not period_end_date:
        return None
    try:
        from datetime import date
        d = date.fromisoformat(str(period_end_date)[:10])
        quarter = (d.month - 1) // 3 + 1
        return (d.year, f"Q{quarter}")
    except (ValueError, TypeError):
        return None


def sync_from_statements(db: Session, investment_id: int) -> int:
    """Sync FinancialPeriodRecord rows from parsed financial statements.

    Uses fiscal_period_label if set, otherwise falls back to period_end_date
    to derive the quarter. Only creates/updates records with auto_detected=True.
    Does NOT overwrite records where auto_detected=False (user-edited).
    Returns count of records synced.
    """
    from sqlalchemy import or_
    statements = (
        db.query(FinancialStatement)
        .filter(
            FinancialStatement.investment_id == investment_id,
            or_(
                FinancialStatement.fiscal_period_label.isnot(None),
                FinancialStatement.period_end_date.isnot(None),
            ),
        )
        .all()
    )

    # Group by (fiscal_year, period_label) → list of statement ids
    grouped: dict[tuple[int, str], list[int]] = {}
    for stmt in statements:
        parsed = _parse_period_label(stmt.fiscal_period_label) if stmt.fiscal_period_label else None
        if not parsed:
            parsed = _derive_period_from_date(stmt.period_end_date)
        if not parsed:
            continue
        key = parsed
        grouped.setdefault(key, []).append(stmt.id)

    count = 0
    for (fiscal_year, period_label), stmt_ids in grouped.items():
        existing = (
            db.query(FinancialPeriodRecord)
            .filter(
                FinancialPeriodRecord.investment_id == investment_id,
                FinancialPeriodRecord.fiscal_year == fiscal_year,
                FinancialPeriodRecord.period_label == period_label,
            )
            .first()
        )
        if existing and not existing.auto_detected:
            # User has manually edited — skip
            continue

        if existing:
            existing.status = "received"
            existing.statement_ids = json.dumps(stmt_ids)
            existing.updated_at = datetime.utcnow()
        else:
            record = FinancialPeriodRecord(
                investment_id=investment_id,
                fiscal_year=fiscal_year,
                period_label=period_label,
                status="received",
                auto_detected=True,
                statement_ids=json.dumps(stmt_ids),
            )
            db.add(record)
        count += 1

    db.commit()
    return count


def get_tracker_grid(
    db: Session,
    investment_ids: list[int],
    fiscal_years: list[int],
) -> list[dict]:
    """Build grid rows: one per investment, with all expected periods filled in."""
    from app.investments.models import Investment

    investments = (
        db.query(Investment)
        .filter(Investment.id.in_(investment_ids))
        .all()
    )

    rows = []
    for inv in investments:
        settings = get_or_create_settings(db, inv.id)

        # Collect all records for this investment + fiscal years
        existing_records = (
            db.query(FinancialPeriodRecord)
            .filter(
                FinancialPeriodRecord.investment_id == inv.id,
                FinancialPeriodRecord.fiscal_year.in_(fiscal_years),
            )
            .all()
        )
        record_map: dict[tuple[int, str], FinancialPeriodRecord] = {
            (r.fiscal_year, r.period_label): r for r in existing_records
        }

        # Build full expected set and fill gaps with "pending" virtual records
        all_periods: list[FinancialPeriodRecord] = []
        for fy in sorted(fiscal_years):
            for period_label in _expected_periods(settings, fy):
                key = (fy, period_label)
                if key in record_map:
                    all_periods.append(record_map[key])
                else:
                    # Virtual pending record (not persisted)
                    virtual = FinancialPeriodRecord(
                        investment_id=inv.id,
                        fiscal_year=fy,
                        period_label=period_label,
                        status="pending",
                        auto_detected=True,
                    )
                    # Give it a fake id of -1 so frontend knows it's not saved
                    virtual.id = -1
                    virtual.created_at = datetime.utcnow()
                    virtual.updated_at = datetime.utcnow()
                    all_periods.append(virtual)

        rows.append({
            "investment_id": inv.id,
            "investment_name": inv.investment_name,
            "settings": settings,
            "periods": all_periods,
        })

    return rows


def update_period_record(
    db: Session, record_id: int, data: dict
) -> FinancialPeriodRecord:
    record = db.query(FinancialPeriodRecord).filter(
        FinancialPeriodRecord.id == record_id
    ).first()
    if not record:
        from app.exceptions import not_found
        raise not_found("Period record not found")

    for key, value in data.items():
        if value is not None:
            setattr(record, key, value)
    record.auto_detected = False  # Mark as user-edited
    record.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(record)
    return record


def upsert_period_record(
    db: Session,
    investment_id: int,
    fiscal_year: int,
    period_label: str,
    data: dict,
) -> FinancialPeriodRecord:
    existing = (
        db.query(FinancialPeriodRecord)
        .filter(
            FinancialPeriodRecord.investment_id == investment_id,
            FinancialPeriodRecord.fiscal_year == fiscal_year,
            FinancialPeriodRecord.period_label == period_label,
        )
        .first()
    )
    if existing:
        for key, value in data.items():
            if value is not None:
                setattr(existing, key, value)
        existing.auto_detected = False
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return existing
    else:
        record = FinancialPeriodRecord(
            investment_id=investment_id,
            fiscal_year=fiscal_year,
            period_label=period_label,
            auto_detected=False,
            **{k: v for k, v in data.items() if v is not None},
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record
