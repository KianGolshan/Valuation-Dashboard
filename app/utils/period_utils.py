"""Shared utilities for parsing fiscal period label strings.

Moved here from app/financial_tracker/service.py so that
ratio_service.py and other modules can import without circular deps.
"""

import re

MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

MONTH_NAME_MAP: dict[str, str] = {m.lower(): m for m in MONTHS}
MONTH_NAME_FULL_MAP: dict[str, str] = {
    "january": "Jan", "february": "Feb", "march": "Mar", "april": "Apr",
    "may": "May", "june": "Jun", "july": "Jul", "august": "Aug",
    "september": "Sep", "october": "Oct", "november": "Nov", "december": "Dec",
}

# Quarters that can appear in a fiscal year
QUARTER_LABELS = {"Q1", "Q2", "Q3", "Q4"}


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


def parse_period_label(raw: str) -> tuple[int, str] | None:
    """Parse a fiscal_period_label string into (fiscal_year, period_label).

    Handles formats like:
      "Q1 2025", "Q1 FY25", "Q1FY2025", "Q1-2025"
      "FY2025 Audited", "Audited FY2025"
      "FY2025", "FY 2025", "FY25"
      "January 2025", "Jan 2025", "Jan-25"
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


def prior_year_quarter(fiscal_year: int, quarter: str) -> tuple[int, str]:
    """Return the same quarter in the prior fiscal year."""
    return (fiscal_year - 1, quarter)
