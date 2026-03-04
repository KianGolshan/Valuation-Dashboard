"""Compute financial ratios from already-extracted line items.

Each ratio uses the most recent available statement of its required type
independently. Periods are not forced to align across statement types.
All ratios return None gracefully if required inputs are missing.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.financial_parsing.models import FinancialStatement, LineItem
from app.utils.period_utils import parse_period_label, QUARTER_LABELS

# ── Helpers ────────────────────────────────────────────────────────────────────

def _display_value(li: LineItem) -> float | None:
    """Return the effective value of a line item (edited overrides original)."""
    return li.edited_value if li.edited_value is not None else li.value


def _category_map(stmt: FinancialStatement) -> dict[str, float]:
    """Build {category: value} dict from a statement, preferring is_total rows."""
    totals: dict[str, float] = {}
    others: dict[str, float] = {}
    for li in stmt.line_items:
        val = _display_value(li)
        if val is None:
            continue
        if li.is_total:
            totals[li.category] = val
        elif li.category not in totals:
            others[li.category] = val
    merged = {**others, **totals}
    return merged


def _period_label(stmt: FinancialStatement) -> str:
    return stmt.fiscal_period_label or stmt.period or "Unknown"


def _latest_stmt_by_type(
    stmts: list[FinancialStatement], stmt_type: str
) -> FinancialStatement | None:
    matching = [s for s in stmts if s.statement_type == stmt_type]
    if not matching:
        return None
    # Sort by reporting_date desc, then by id desc as tiebreaker
    def sort_key(s: FinancialStatement):
        return (s.reporting_date or "", s.id)
    return sorted(matching, key=sort_key, reverse=True)[0]


def _safe_div(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator is None:
        return None
    if denominator == 0:
        return None
    return numerator / denominator


def _pct(value: float | None) -> float | None:
    """Convert ratio to percentage (0.42 → 42.0)."""
    if value is None:
        return None
    return round(value * 100, 2)


# ── Per-ratio computation ──────────────────────────────────────────────────────

def _gross_margin(cats: dict[str, float], period: str, prior_cats: dict[str, float] | None, prior_period: str | None) -> dict:
    val = _safe_div(cats.get("gross_profit"), cats.get("revenue"))
    prior_val = _safe_div(prior_cats.get("gross_profit"), prior_cats.get("revenue")) if prior_cats else None
    delta = round((_pct(val) or 0) - (_pct(prior_val) or 0), 2) if val is not None and prior_val is not None else None
    return _ratio_result("Gross Margin", "gross_margin", _pct(val), _pct(prior_val), delta, period, prior_period, "pct")


def _ebitda_margin(cats: dict[str, float], period: str, prior_cats: dict[str, float] | None, prior_period: str | None) -> dict:
    oi = cats.get("operating_income")
    da = cats.get("depreciation_amortization")
    rev = cats.get("revenue")
    ebitda = None
    if oi is not None and da is not None:
        ebitda = oi + abs(da)
    elif oi is not None:
        ebitda = oi  # D&A not available, use EBIT as proxy

    val = _safe_div(ebitda, rev)

    prior_ebitda = None
    prior_val = None
    if prior_cats:
        p_oi = prior_cats.get("operating_income")
        p_da = prior_cats.get("depreciation_amortization")
        p_rev = prior_cats.get("revenue")
        if p_oi is not None and p_da is not None:
            prior_ebitda = p_oi + abs(p_da)
        elif p_oi is not None:
            prior_ebitda = p_oi
        prior_val = _safe_div(prior_ebitda, p_rev)

    delta = round((_pct(val) or 0) - (_pct(prior_val) or 0), 2) if val is not None and prior_val is not None else None
    return _ratio_result("EBITDA Margin", "ebitda_margin", _pct(val), _pct(prior_val), delta, period, prior_period, "pct")


def _net_margin(cats: dict[str, float], period: str, prior_cats: dict[str, float] | None, prior_period: str | None) -> dict:
    val = _safe_div(cats.get("net_income"), cats.get("revenue"))
    prior_val = _safe_div(prior_cats.get("net_income"), prior_cats.get("revenue")) if prior_cats else None
    delta = round((_pct(val) or 0) - (_pct(prior_val) or 0), 2) if val is not None and prior_val is not None else None
    return _ratio_result("Net Margin", "net_margin", _pct(val), _pct(prior_val), delta, period, prior_period, "pct")


def _revenue_growth_yoy(
    stmts: list[FinancialStatement],
    current_stmt: FinancialStatement,
    current_cats: dict[str, float],
) -> dict:
    """True YoY: same fiscal quarter, prior year.

    Requires parse_period_label to identify the prior-year matching period.
    Returns None value if prior-year period doesn't exist in data.
    """
    period = _period_label(current_stmt)
    parsed = parse_period_label(current_stmt.fiscal_period_label or "")
    if not parsed or parsed[1] not in QUARTER_LABELS:
        # Can't do true YoY without a parseable quarterly label
        return _ratio_result("Revenue Growth YoY", "revenue_growth_yoy", None, None, None, period, None, "pct")

    fy, quarter = parsed
    prior_fy = fy - 1
    prior_period_label_str = f"{quarter} FY{prior_fy}"

    # Find a statement whose fiscal_period_label parses to (prior_fy, quarter)
    prior_stmt = None
    for s in stmts:
        if s.statement_type != "income_statement" or s.id == current_stmt.id:
            continue
        p = parse_period_label(s.fiscal_period_label or "")
        if p and p == (prior_fy, quarter):
            prior_stmt = s
            break

    if prior_stmt is None:
        return _ratio_result("Revenue Growth YoY", "revenue_growth_yoy", None, None, None, period, None, "pct")

    prior_cats = _category_map(prior_stmt)
    current_rev = current_cats.get("revenue")
    prior_rev = prior_cats.get("revenue")
    val = _safe_div((current_rev or 0) - (prior_rev or 0), abs(prior_rev)) if prior_rev else None
    if current_rev is None or prior_rev is None:
        val = None
    delta = None  # delta on growth percentage is not meaningful
    return _ratio_result(
        "Revenue Growth YoY", "revenue_growth_yoy",
        _pct(val), None, delta,
        period, prior_period_label_str, "pct",
    )


def _current_ratio(cats: dict[str, float], period: str, prior_cats: dict[str, float] | None, prior_period: str | None) -> dict:
    val = _safe_div(cats.get("total_current_assets"), cats.get("total_current_liabilities"))
    prior_val = _safe_div(prior_cats.get("total_current_assets"), prior_cats.get("total_current_liabilities")) if prior_cats else None
    delta = round((val or 0) - (prior_val or 0), 3) if val is not None and prior_val is not None else None
    return _ratio_result("Current Ratio", "current_ratio", _round(val, 2), _round(prior_val, 2), delta, period, prior_period, "ratio")


def _quick_ratio(cats: dict[str, float], period: str, prior_cats: dict[str, float] | None, prior_period: str | None) -> dict:
    cash = cats.get("cash_and_equivalents", 0) or 0
    st_inv = cats.get("short_term_investments", 0) or 0
    ar = cats.get("accounts_receivable", 0) or 0
    cl = cats.get("total_current_liabilities")
    numerator = cash + st_inv + ar if (cats.get("cash_and_equivalents") is not None or cats.get("accounts_receivable") is not None) else None
    val = _safe_div(numerator, cl)

    prior_val = None
    if prior_cats:
        p_cash = prior_cats.get("cash_and_equivalents", 0) or 0
        p_st = prior_cats.get("short_term_investments", 0) or 0
        p_ar = prior_cats.get("accounts_receivable", 0) or 0
        p_cl = prior_cats.get("total_current_liabilities")
        p_num = p_cash + p_st + p_ar if (prior_cats.get("cash_and_equivalents") is not None or prior_cats.get("accounts_receivable") is not None) else None
        prior_val = _safe_div(p_num, p_cl)

    delta = round((val or 0) - (prior_val or 0), 3) if val is not None and prior_val is not None else None
    return _ratio_result("Quick Ratio", "quick_ratio", _round(val, 2), _round(prior_val, 2), delta, period, prior_period, "ratio")


def _debt_equity(cats: dict[str, float], period: str, prior_cats: dict[str, float] | None, prior_period: str | None) -> dict:
    sd = cats.get("short_term_debt", 0) or 0
    ld = cats.get("long_term_debt", 0) or 0
    eq = cats.get("total_stockholders_equity")
    debt = sd + ld if (cats.get("short_term_debt") is not None or cats.get("long_term_debt") is not None) else None
    val = _safe_div(debt, eq)

    prior_val = None
    if prior_cats:
        p_sd = prior_cats.get("short_term_debt", 0) or 0
        p_ld = prior_cats.get("long_term_debt", 0) or 0
        p_eq = prior_cats.get("total_stockholders_equity")
        p_debt = p_sd + p_ld if (prior_cats.get("short_term_debt") is not None or prior_cats.get("long_term_debt") is not None) else None
        prior_val = _safe_div(p_debt, p_eq)

    delta = round((val or 0) - (prior_val or 0), 3) if val is not None and prior_val is not None else None
    return _ratio_result("Debt / Equity", "debt_equity", _round(val, 2), _round(prior_val, 2), delta, period, prior_period, "ratio")


def _burn_and_runway(cats: dict[str, float], period: str, stmt: FinancialStatement) -> list[dict]:
    """Burn Rate (monthly) and Runway (months).

    Burn Rate = |OCF| / period_months. If OCF >= 0: show "Profitable".
    Runway only computed when OCF < 0.
    """
    ocf = cats.get("operating_cash_flow")
    ending_cash = cats.get("ending_cash")

    if ocf is None:
        return [
            _ratio_result("Burn Rate", "burn_rate", None, None, None, period, None, "currency"),
            _ratio_result("Runway", "runway", None, None, None, period, None, "months"),
        ]

    # Estimate period months from fiscal_period_label
    period_months = _estimate_period_months(stmt.fiscal_period_label or "")

    if ocf >= 0:
        # Profitable — burn rate not applicable
        burn_result = _ratio_result("Burn Rate", "burn_rate", None, None, None, period, None, "currency")
        burn_result["profitable"] = True
        runway_result = _ratio_result("Runway", "runway", None, None, None, period, None, "months")
        runway_result["profitable"] = True
        return [burn_result, runway_result]

    monthly_burn = abs(ocf) / period_months
    burn_result = _ratio_result("Burn Rate", "burn_rate", round(monthly_burn, 0), None, None, period, None, "currency")

    runway = _safe_div(ending_cash, monthly_burn) if ending_cash is not None else None
    runway_result = _ratio_result("Runway", "runway", _round(runway, 1), None, None, period, None, "months")

    return [burn_result, runway_result]


def _estimate_period_months(label: str) -> int:
    """Estimate number of months in a period from its label."""
    parsed = parse_period_label(label)
    if parsed:
        _, period_label = parsed
        if period_label in QUARTER_LABELS:
            return 3
        if period_label in ("FY", "FY_Audited"):
            return 12
        # Monthly labels ("Jan", "Feb", ...)
        return 1
    # Default to quarterly if unparseable
    return 3


# ── Result builder ─────────────────────────────────────────────────────────────

def _ratio_result(
    name: str,
    key: str,
    value: float | None,
    prior_value: float | None,
    delta: float | None,
    period: str,
    prior_period: str | None,
    fmt: str,
) -> dict:
    result: dict = {
        "name": name,
        "key": key,
        "value": value,
        "period": period,
        "format": fmt,
    }
    if prior_value is not None:
        result["prior_value"] = prior_value
    if prior_period is not None:
        result["prior_period"] = prior_period
    if delta is not None:
        result["delta"] = delta
    return result


def _round(val: float | None, ndigits: int) -> float | None:
    if val is None:
        return None
    return round(val, ndigits)


# ── Public entry point ─────────────────────────────────────────────────────────

def compute_ratios(db: Session, investment_id: int) -> list[dict]:
    """Compute all financial ratios for an investment from existing line items.

    Each ratio uses the most recent available statement of its required type.
    Returns a list of ratio result dicts. Ratios with missing data return
    value=None (not omitted from the list — the frontend shows "—").
    """
    stmts: list[FinancialStatement] = (
        db.query(FinancialStatement)
        .filter(FinancialStatement.investment_id == investment_id)
        .order_by(FinancialStatement.reporting_date.desc())
        .all()
    )

    if not stmts:
        return []

    # ── Income statement ratios ───────────────────────────────────────────────
    latest_is = _latest_stmt_by_type(stmts, "income_statement")
    ratios: list[dict] = []

    if latest_is:
        is_cats = _category_map(latest_is)
        is_period = _period_label(latest_is)

        # Find second-most-recent IS for prior-period comparisons
        is_stmts = sorted(
            [s for s in stmts if s.statement_type == "income_statement"],
            key=lambda s: (s.reporting_date or "", s.id),
            reverse=True,
        )
        prior_is = is_stmts[1] if len(is_stmts) > 1 else None
        prior_is_cats = _category_map(prior_is) if prior_is else None
        prior_is_period = _period_label(prior_is) if prior_is else None

        ratios.append(_gross_margin(is_cats, is_period, prior_is_cats, prior_is_period))
        ratios.append(_ebitda_margin(is_cats, is_period, prior_is_cats, prior_is_period))
        ratios.append(_net_margin(is_cats, is_period, prior_is_cats, prior_is_period))
        ratios.append(_revenue_growth_yoy(stmts, latest_is, is_cats))
    else:
        # No income statement — include placeholder ratios with None values
        na_period = "N/A"
        for name, key in [("Gross Margin", "gross_margin"), ("EBITDA Margin", "ebitda_margin"),
                          ("Net Margin", "net_margin"), ("Revenue Growth YoY", "revenue_growth_yoy")]:
            ratios.append(_ratio_result(name, key, None, None, None, na_period, None, "pct"))

    # ── Balance sheet ratios ──────────────────────────────────────────────────
    latest_bs = _latest_stmt_by_type(stmts, "balance_sheet")

    if latest_bs:
        bs_cats = _category_map(latest_bs)
        bs_period = _period_label(latest_bs)

        bs_stmts = sorted(
            [s for s in stmts if s.statement_type == "balance_sheet"],
            key=lambda s: (s.reporting_date or "", s.id),
            reverse=True,
        )
        prior_bs = bs_stmts[1] if len(bs_stmts) > 1 else None
        prior_bs_cats = _category_map(prior_bs) if prior_bs else None
        prior_bs_period = _period_label(prior_bs) if prior_bs else None

        ratios.append(_current_ratio(bs_cats, bs_period, prior_bs_cats, prior_bs_period))
        ratios.append(_quick_ratio(bs_cats, bs_period, prior_bs_cats, prior_bs_period))
        ratios.append(_debt_equity(bs_cats, bs_period, prior_bs_cats, prior_bs_period))
    else:
        na_period = "N/A"
        for name, key, fmt in [
            ("Current Ratio", "current_ratio", "ratio"),
            ("Quick Ratio", "quick_ratio", "ratio"),
            ("Debt / Equity", "debt_equity", "ratio"),
        ]:
            ratios.append(_ratio_result(name, key, None, None, None, na_period, None, fmt))

    # ── Cash flow ratios ──────────────────────────────────────────────────────
    latest_cf = _latest_stmt_by_type(stmts, "cash_flow")

    if latest_cf:
        cf_cats = _category_map(latest_cf)
        cf_period = _period_label(latest_cf)
        ratios.extend(_burn_and_runway(cf_cats, cf_period, latest_cf))
    else:
        na_period = "N/A"
        ratios.append(_ratio_result("Burn Rate", "burn_rate", None, None, None, na_period, None, "currency"))
        ratios.append(_ratio_result("Runway", "runway", None, None, None, na_period, None, "months"))

    return ratios
