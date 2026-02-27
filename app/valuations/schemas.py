from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ValuationCreate(BaseModel):
    valuation_date: str
    methodology: str
    revenue_multiple: float | None = None
    ebitda_multiple: float | None = None
    discount_rate: float | None = None
    implied_enterprise_value: float | None = None
    implied_equity_value: float | None = None
    confidence_flag: str | None = None
    analyst_notes: str | None = None
    price_per_share: float | None = None
    security_id: int | None = None
    multiple: float | None = None
    financial_metric: str | None = None
    financial_metric_value: float | None = None


class ValuationUpdate(BaseModel):
    valuation_date: str | None = None
    methodology: str | None = None
    revenue_multiple: float | None = None
    ebitda_multiple: float | None = None
    discount_rate: float | None = None
    implied_enterprise_value: float | None = None
    implied_equity_value: float | None = None
    confidence_flag: str | None = None
    analyst_notes: str | None = None
    price_per_share: float | None = None
    security_id: int | None = None
    multiple: float | None = None
    financial_metric: str | None = None
    financial_metric_value: float | None = None


class ValuationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    investment_id: int
    valuation_date: str
    methodology: str
    revenue_multiple: float | None = None
    ebitda_multiple: float | None = None
    discount_rate: float | None = None
    implied_enterprise_value: float | None = None
    implied_equity_value: float | None = None
    confidence_flag: str | None = None
    analyst_notes: str | None = None
    price_per_share: float | None = None
    security_id: int | None = None
    multiple: float | None = None
    financial_metric: str | None = None
    financial_metric_value: float | None = None
    created_at: datetime
    updated_at: datetime
