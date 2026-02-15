from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.financial_parsing.workflow_service import (
    compute_investment_workflow_summary,
    get_all_investments_workflow,
)

router = APIRouter(
    prefix="/workflow",
    tags=["Workflow"],
)


@router.get("/investments")
def all_investments_workflow(db: Session = Depends(get_db)):
    """Compact workflow summary for every investment (sidebar)."""
    return get_all_investments_workflow(db)


@router.get("/investments/{investment_id}")
def investment_workflow(investment_id: int, db: Session = Depends(get_db)):
    """Detailed workflow breakdown for one investment."""
    return compute_investment_workflow_summary(db, investment_id)
