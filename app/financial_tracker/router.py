from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.financial_tracker import service
from app.financial_tracker.schemas import (
    PeriodRecordResponse,
    PeriodRecordUpdate,
    PeriodRecordUpsert,
    ReportingSettingsResponse,
    ReportingSettingsUpdate,
    TrackerGridRow,
)

router = APIRouter(tags=["Financial Tracker"])


# ── Grid ────────────────────────────────────────────────────────────────────

@router.get("/financial-tracker/grid", response_model=list[TrackerGridRow])
def get_grid(
    fiscal_years: str = Query(
        default=None,
        description="Comma-separated fiscal years, e.g. '2024,2025'",
    ),
    investment_ids: str = Query(
        default=None,
        description="Comma-separated investment IDs (omit to use all)",
    ),
    db: Session = Depends(get_db),
):
    from app.investments.models import Investment

    if investment_ids:
        inv_ids = [int(x) for x in investment_ids.split(",") if x.strip()]
    else:
        all_inv = db.query(Investment).all()
        inv_ids = [i.id for i in all_inv]

    if fiscal_years:
        fy_list = [int(x) for x in fiscal_years.split(",") if x.strip()]
    else:
        import datetime
        current_year = datetime.date.today().year
        fy_list = [current_year - 1, current_year]

    rows = service.get_tracker_grid(db, inv_ids, fy_list)
    return rows


# ── Settings ────────────────────────────────────────────────────────────────

@router.get(
    "/investments/{investment_id}/financial-tracker/settings",
    response_model=ReportingSettingsResponse,
)
def get_settings(investment_id: int, db: Session = Depends(get_db)):
    return service.get_or_create_settings(db, investment_id)


@router.put(
    "/investments/{investment_id}/financial-tracker/settings",
    response_model=ReportingSettingsResponse,
)
def update_settings(
    investment_id: int,
    body: ReportingSettingsUpdate,
    db: Session = Depends(get_db),
):
    return service.upsert_settings(db, investment_id, body.model_dump(exclude_unset=True))


# ── Sync ────────────────────────────────────────────────────────────────────

@router.post("/investments/{investment_id}/financial-tracker/sync")
def sync_tracker(investment_id: int, db: Session = Depends(get_db)):
    count = service.sync_from_statements(db, investment_id)
    return {"synced": count}


# ── Period Records ───────────────────────────────────────────────────────────

@router.put(
    "/financial-tracker/periods/{record_id}",
    response_model=PeriodRecordResponse,
)
def update_period(
    record_id: int,
    body: PeriodRecordUpdate,
    db: Session = Depends(get_db),
):
    return service.update_period_record(
        db, record_id, body.model_dump(exclude_unset=True)
    )


@router.post(
    "/financial-tracker/periods/upsert",
    response_model=PeriodRecordResponse,
)
def upsert_period(body: PeriodRecordUpsert, db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    investment_id = data.pop("investment_id")
    fiscal_year = data.pop("fiscal_year")
    period_label = data.pop("period_label")
    return service.upsert_period_record(
        db, investment_id, fiscal_year, period_label, data
    )
