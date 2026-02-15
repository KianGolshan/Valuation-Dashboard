from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.financial_parsing.priority_service import (
    get_global_priority_queue,
    get_investment_priority_queue,
)

router = APIRouter(
    prefix="/priority-queue",
    tags=["Priority Queue"],
)


@router.get("/")
def global_priority_queue(db: Session = Depends(get_db)):
    return get_global_priority_queue(db)


@router.get("/investments/{investment_id}")
def investment_priority_queue(
    investment_id: int,
    db: Session = Depends(get_db),
):
    return get_investment_priority_queue(db, investment_id)
