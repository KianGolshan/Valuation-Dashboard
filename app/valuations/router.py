from fastapi import APIRouter, Depends, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.valuations import service
from app.valuations.schemas import ValuationCreate, ValuationResponse, ValuationUpdate

router = APIRouter(
    prefix="/investments/{investment_id}/valuations",
    tags=["Valuations"],
)


@router.post("/", response_model=ValuationResponse, status_code=status.HTTP_201_CREATED)
def create_valuation(
    investment_id: int,
    body: ValuationCreate,
    db: Session = Depends(get_db),
):
    return service.create_valuation(db, investment_id, body.model_dump())


@router.get("/", response_model=list[ValuationResponse])
def list_valuations(
    investment_id: int,
    db: Session = Depends(get_db),
):
    return service.list_valuations(db, investment_id)


@router.get("/latest", response_model=ValuationResponse | None)
def get_latest_valuation(
    investment_id: int,
    db: Session = Depends(get_db),
):
    return service.get_latest_valuation(db, investment_id)


@router.get("/{valuation_id}", response_model=ValuationResponse)
def get_valuation(
    investment_id: int,
    valuation_id: int,
    db: Session = Depends(get_db),
):
    return service.get_valuation(db, valuation_id)


@router.put("/{valuation_id}", response_model=ValuationResponse)
def update_valuation(
    investment_id: int,
    valuation_id: int,
    body: ValuationUpdate,
    db: Session = Depends(get_db),
):
    return service.update_valuation(db, valuation_id, body.model_dump(exclude_unset=True))


@router.delete("/{valuation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_valuation(
    investment_id: int,
    valuation_id: int,
    db: Session = Depends(get_db),
):
    service.delete_valuation(db, valuation_id)


@router.get("/export")
def export_valuations_excel(
    investment_id: int,
    db: Session = Depends(get_db),
):
    xlsx_bytes = service.export_valuations_excel(db, investment_id)
    return StreamingResponse(
        iter([xlsx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename=valuations_{investment_id}.xlsx"
        },
    )
