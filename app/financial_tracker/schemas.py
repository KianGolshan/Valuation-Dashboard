from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ReportingSettingsUpdate(BaseModel):
    reporting_frequency: str | None = None  # "quarterly" | "monthly"
    fiscal_year_end_month: int | None = None  # 1–12
    track_audited_annual: bool | None = None
    lookback_years: int | None = None


class ReportingSettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    investment_id: int
    reporting_frequency: str
    fiscal_year_end_month: int
    track_audited_annual: bool
    lookback_years: int
    created_at: datetime
    updated_at: datetime


class PeriodRecordUpdate(BaseModel):
    status: str | None = None  # "received"|"pending"|"expected"|"flagged"
    notes: str | None = None
    received_date: str | None = None


class PeriodRecordUpsert(PeriodRecordUpdate):
    investment_id: int
    fiscal_year: int
    period_label: str


class PeriodRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    investment_id: int
    fiscal_year: int
    period_label: str
    status: str
    auto_detected: bool
    received_date: str | None = None
    notes: str | None = None
    statement_ids: str | None = None
    created_at: datetime
    updated_at: datetime


class TrackerGridRow(BaseModel):
    investment_id: int
    investment_name: str
    settings: ReportingSettingsResponse
    periods: list[PeriodRecordResponse]
