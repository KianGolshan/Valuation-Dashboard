"""CRUD + analysis service for comparables module."""

import json
import os
import statistics
import tempfile
from pathlib import Path

from openpyxl import Workbook
from sqlalchemy.orm import Session

from app.comparables.models import CompSet, CompSetCompany, InvestmentProfile
from app.comparables.schemas import (
    AnalysisResponse,
    AnalysisStats,
    CompanyMultiples,
    CompSetCreate,
    CompSetUpdate,
    CompanyAdd,
    CompanyUpdate,
    ProfileUpsert,
)
from app.comparables import fmp_service


# ── Profile ─────────────────────────────────────────────────────────

def upsert_profile(db: Session, investment_id: int, data: ProfileUpsert) -> InvestmentProfile:
    profile = (
        db.query(InvestmentProfile)
        .filter(InvestmentProfile.investment_id == investment_id)
        .first()
    )
    if profile:
        for key, val in data.model_dump(exclude_unset=True).items():
            setattr(profile, key, val)
    else:
        profile = InvestmentProfile(investment_id=investment_id, **data.model_dump())
        db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def get_profile(db: Session, investment_id: int) -> InvestmentProfile | None:
    return (
        db.query(InvestmentProfile)
        .filter(InvestmentProfile.investment_id == investment_id)
        .first()
    )


# ── Comp Sets ───────────────────────────────────────────────────────

def create_comp_set(db: Session, investment_id: int, data: CompSetCreate) -> CompSet:
    cs = CompSet(investment_id=investment_id, **data.model_dump())
    db.add(cs)
    db.commit()
    db.refresh(cs)
    return cs


def list_comp_sets(db: Session, investment_id: int) -> list[CompSet]:
    return (
        db.query(CompSet)
        .filter(CompSet.investment_id == investment_id)
        .order_by(CompSet.created_at.desc())
        .all()
    )


def get_comp_set(db: Session, comp_set_id: int) -> CompSet | None:
    return db.query(CompSet).filter(CompSet.id == comp_set_id).first()


def update_comp_set(db: Session, comp_set_id: int, data: CompSetUpdate) -> CompSet | None:
    cs = get_comp_set(db, comp_set_id)
    if not cs:
        return None
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(cs, key, val)
    db.commit()
    db.refresh(cs)
    return cs


def delete_comp_set(db: Session, comp_set_id: int) -> bool:
    cs = get_comp_set(db, comp_set_id)
    if not cs:
        return False
    db.delete(cs)
    db.commit()
    return True


# ── Companies ───────────────────────────────────────────────────────

def add_company(db: Session, comp_set_id: int, data: CompanyAdd) -> CompSetCompany:
    company = CompSetCompany(comp_set_id=comp_set_id, **data.model_dump())
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


def remove_company(db: Session, company_id: int) -> bool:
    company = db.query(CompSetCompany).filter(CompSetCompany.id == company_id).first()
    if not company:
        return False
    db.delete(company)
    db.commit()
    return True


def update_company(db: Session, company_id: int, data: CompanyUpdate) -> CompSetCompany | None:
    company = db.query(CompSetCompany).filter(CompSetCompany.id == company_id).first()
    if not company:
        return None
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(company, key, val)
    db.commit()
    db.refresh(company)
    return company


# ── Analysis ────────────────────────────────────────────────────────

def _safe_div(a, b) -> float | None:
    """Safe division returning None if denominator is zero or inputs are None."""
    if a is None or b is None or b == 0:
        return None
    return a / b


def _pct_change(current, previous) -> float | None:
    """Calculate percentage change."""
    if current is None or previous is None or previous == 0:
        return None
    return ((current - previous) / abs(previous)) * 100


def _compute_stats(values: list[float], metric_name: str) -> AnalysisStats:
    """Compute summary statistics for a list of values (None filtered out)."""
    clean = [v for v in values if v is not None]
    if not clean:
        return AnalysisStats(metric=metric_name)

    clean.sort()
    n = len(clean)

    def percentile(data, pct):
        k = (pct / 100) * (len(data) - 1)
        f = int(k)
        c = f + 1
        if c >= len(data):
            return data[f]
        return data[f] + (k - f) * (data[c] - data[f])

    return AnalysisStats(
        metric=metric_name,
        min=round(clean[0], 2),
        q1=round(percentile(clean, 25), 2),
        median=round(statistics.median(clean), 2),
        mean=round(statistics.mean(clean), 2),
        q3=round(percentile(clean, 75), 2),
        max=round(clean[-1], 2),
    )


def run_analysis(db: Session, comp_set_id: int) -> AnalysisResponse:
    """Fetch FMP data for all companies and compute multiples + stats."""
    cs = get_comp_set(db, comp_set_id)
    if not cs:
        raise ValueError("Comp set not found")

    company_multiples: list[CompanyMultiples] = []

    for company in cs.companies:
        ticker = company.ticker

        # Fetch data from FMP
        profile = fmp_service.get_company_profile(ticker, db)
        income_stmts = fmp_service.get_income_statement(ticker, db, limit=2)
        ev_data = fmp_service.get_enterprise_value(ticker, db, limit=2)

        market_cap = profile.get("mktCap") if profile else None

        # Enterprise value
        ev = None
        if ev_data:
            ev = ev_data[0].get("enterpriseValue")

        # Revenue & EBITDA from most recent income statement
        revenue = None
        ebitda = None
        gross_profit = None
        revenue_prev = None
        if income_stmts:
            latest = income_stmts[0]
            revenue = latest.get("revenue")
            ebitda = latest.get("ebitda")
            gross_profit = latest.get("grossProfit")
            if len(income_stmts) > 1:
                revenue_prev = income_stmts[1].get("revenue")

        # Calculate multiples
        ev_revenue = _safe_div(ev, revenue)
        ev_ebitda = _safe_div(ev, ebitda)
        revenue_growth = _pct_change(revenue, revenue_prev)
        gross_margin = _safe_div(gross_profit, revenue) * 100 if _safe_div(gross_profit, revenue) is not None else None
        ebitda_margin = _safe_div(ebitda, revenue) * 100 if _safe_div(ebitda, revenue) is not None else None

        # Rule of 40
        rule_of_40 = None
        if revenue_growth is not None and ebitda_margin is not None:
            rule_of_40 = round(revenue_growth + ebitda_margin, 2)

        cm = CompanyMultiples(
            ticker=ticker,
            company_name=company.company_name,
            market_cap=round(market_cap, 2) if market_cap else None,
            ev_revenue=round(ev_revenue, 2) if ev_revenue is not None else None,
            ev_ebitda=round(ev_ebitda, 2) if ev_ebitda is not None else None,
            revenue_growth=round(revenue_growth, 2) if revenue_growth is not None else None,
            gross_margin=round(gross_margin, 2) if gross_margin is not None else None,
            ebitda_margin=round(ebitda_margin, 2) if ebitda_margin is not None else None,
            rule_of_40=rule_of_40,
            include_in_median=company.include_in_median,
        )
        company_multiples.append(cm)

    # Compute statistics (only for included companies)
    included = [c for c in company_multiples if c.include_in_median]

    stats = [
        _compute_stats([c.ev_revenue for c in included], "EV/Revenue"),
        _compute_stats([c.ev_ebitda for c in included], "EV/EBITDA"),
        _compute_stats([c.revenue_growth for c in included], "Revenue Growth %"),
        _compute_stats([c.gross_margin for c in included], "Gross Margin %"),
        _compute_stats([c.ebitda_margin for c in included], "EBITDA Margin %"),
        _compute_stats([c.rule_of_40 for c in included], "Rule of 40"),
    ]

    return AnalysisResponse(
        comp_set_id=cs.id,
        comp_set_name=cs.name,
        companies=company_multiples,
        statistics=stats,
    )


# ── Export ───────────────────────────────────────────────────────────

def export_comp_set_to_excel(db: Session, comp_set_id: int) -> str:
    """Export comp set analysis to Excel. Returns temp file path."""
    analysis = run_analysis(db, comp_set_id)
    wb = Workbook()

    # Companies sheet
    ws = wb.active
    ws.title = "Companies"
    headers = [
        "Ticker", "Company", "Market Cap", "EV/Revenue", "EV/EBITDA",
        "Revenue Growth %", "Gross Margin %", "EBITDA Margin %",
        "Rule of 40", "Included",
    ]
    ws.append(headers)
    for c in analysis.companies:
        ws.append([
            c.ticker, c.company_name, c.market_cap, c.ev_revenue, c.ev_ebitda,
            c.revenue_growth, c.gross_margin, c.ebitda_margin,
            c.rule_of_40, "Yes" if c.include_in_median else "No",
        ])

    # Statistics sheet
    ws2 = wb.create_sheet("Statistics")
    ws2.append(["Metric", "Min", "Q1", "Median", "Mean", "Q3", "Max"])
    for s in analysis.statistics:
        ws2.append([s.metric, s.min, s.q1, s.median, s.mean, s.q3, s.max])

    # Save to temp file
    fd, path = tempfile.mkstemp(suffix=".xlsx")
    os.close(fd)
    wb.save(path)
    return path
