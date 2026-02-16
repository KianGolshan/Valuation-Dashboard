"""FMP (Financial Modeling Prep) API proxy with 24-hour cache."""

import json
from datetime import datetime, timedelta

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.comparables.models import FmpCache

CACHE_TTL = timedelta(hours=24)
FMP_BASE = "https://financialmodelingprep.com/stable"


class FmpError(Exception):
    pass


def _fmp_get(endpoint: str, params: dict, db: Session) -> dict | list:
    """Core FMP fetch with cache-first strategy."""
    cache_key = f"{endpoint}|{json.dumps(params, sort_keys=True)}"

    # Check cache
    cached = db.query(FmpCache).filter(FmpCache.cache_key == cache_key).first()
    if cached and (datetime.utcnow() - cached.fetched_at) < CACHE_TTL:
        return json.loads(cached.response_json)

    # Fetch from FMP
    if not settings.FMP_API_KEY:
        raise FmpError("FMP_API_KEY is not configured")

    params["apikey"] = settings.FMP_API_KEY
    url = f"{FMP_BASE}{endpoint}"

    try:
        with httpx.Client(timeout=30) as client:
            resp = client.get(url, params=params)
    except httpx.HTTPError as e:
        raise FmpError(f"FMP request failed: {e}")

    if resp.status_code == 429:
        raise FmpError("FMP rate limit exceeded — please wait and retry")

    if resp.status_code != 200:
        raise FmpError(f"FMP returned status {resp.status_code}")

    data = resp.json()

    # Store/update cache
    response_str = json.dumps(data)
    if cached:
        cached.response_json = response_str
        cached.fetched_at = datetime.utcnow()
    else:
        cached = FmpCache(
            cache_key=cache_key,
            response_json=response_str,
            fetched_at=datetime.utcnow(),
        )
        db.add(cached)
    db.commit()

    return data


def search_companies(query: str, db: Session) -> list[dict]:
    """Search FMP for companies by name/ticker."""
    results = _fmp_get("/search-name", {"query": query}, db)
    return [
        {
            "ticker": r.get("symbol", ""),
            "name": r.get("name", ""),
            "exchange": r.get("exchangeFullName", r.get("exchange", "")),
            "currency": r.get("currency", ""),
        }
        for r in (results if isinstance(results, list) else [])
    ]


def get_company_profile(ticker: str, db: Session) -> dict | None:
    """Get company profile (market cap, sector, etc.)."""
    results = _fmp_get("/profile", {"symbol": ticker}, db)
    if isinstance(results, list) and results:
        return results[0]
    return None


def get_key_metrics_ttm(ticker: str, db: Session) -> dict | None:
    """Get TTM key metrics."""
    results = _fmp_get("/key-metrics-ttm", {"symbol": ticker}, db)
    if isinstance(results, list) and results:
        return results[0]
    return None


def get_ratios_ttm(ticker: str, db: Session) -> dict | None:
    """Get TTM financial ratios."""
    results = _fmp_get("/ratios-ttm", {"symbol": ticker}, db)
    if isinstance(results, list) and results:
        return results[0]
    return None


def get_income_statement(
    ticker: str, db: Session, period: str = "annual", limit: int = 2
) -> list[dict]:
    """Get income statements."""
    results = _fmp_get(
        "/income-statement",
        {"symbol": ticker, "period": period, "limit": str(limit)},
        db,
    )
    return results if isinstance(results, list) else []


def get_enterprise_value(
    ticker: str, db: Session, period: str = "annual", limit: int = 2
) -> list[dict]:
    """Get enterprise value data."""
    results = _fmp_get(
        "/enterprise-values",
        {"symbol": ticker, "period": period, "limit": str(limit)},
        db,
    )
    return results if isinstance(results, list) else []
