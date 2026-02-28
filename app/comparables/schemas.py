from datetime import datetime

from pydantic import BaseModel, ConfigDict


# ── Investment Profile ──────────────────────────────────────────────

class ProfileUpsert(BaseModel):
    sector: str | None = None
    sub_sector: str | None = None
    stage: str | None = None
    geography: str | None = None
    primary_metric: str | None = None


class ProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    investment_id: int
    sector: str | None = None
    sub_sector: str | None = None
    stage: str | None = None
    geography: str | None = None
    primary_metric: str | None = None
    last_updated: datetime


# ── Comp Set ────────────────────────────────────────────────────────

class CompanyAdd(BaseModel):
    ticker: str
    company_name: str
    rationale: str | None = None
    include_in_median: bool = True


class CompanyUpdate(BaseModel):
    rationale: str | None = None
    include_in_median: bool | None = None


class CompanyInSet(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    comp_set_id: int
    ticker: str
    company_name: str
    rationale: str | None = None
    include_in_median: bool
    added_at: datetime


class CompSetCreate(BaseModel):
    name: str
    created_by: str | None = None
    notes: str | None = None


class CompSetUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None
    notes: str | None = None


class CompSetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    investment_id: int
    name: str
    created_by: str | None = None
    is_active: bool
    notes: str | None = None
    created_at: datetime
    companies: list[CompanyInSet] = []


# ── Analysis ────────────────────────────────────────────────────────

class CompanyMultiples(BaseModel):
    ticker: str
    company_name: str
    market_cap: float | None = None
    ev_revenue: float | None = None
    ev_ebitda: float | None = None
    revenue_growth: float | None = None
    gross_margin: float | None = None
    ebitda_margin: float | None = None
    rule_of_40: float | None = None
    include_in_median: bool = True
    data_unavailable: bool = False


class AnalysisStats(BaseModel):
    metric: str
    min: float | None = None
    q1: float | None = None
    median: float | None = None
    mean: float | None = None
    q3: float | None = None
    max: float | None = None


class AnalysisResponse(BaseModel):
    comp_set_id: int
    comp_set_name: str
    companies: list[CompanyMultiples]
    statistics: list[AnalysisStats]


# ── FMP Search ──────────────────────────────────────────────────────

class FmpSearchResult(BaseModel):
    ticker: str
    name: str
    exchange: str | None = None
    currency: str | None = None
