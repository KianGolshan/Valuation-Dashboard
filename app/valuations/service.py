from sqlalchemy.orm import Session

from app.exceptions import not_found
from app.valuations.models import ValuationRecord


def create_valuation(db: Session, investment_id: int, data: dict) -> ValuationRecord:
    record = ValuationRecord(investment_id=investment_id, **data)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_valuations(db: Session, investment_id: int) -> list[ValuationRecord]:
    return db.query(ValuationRecord).filter(
        ValuationRecord.investment_id == investment_id
    ).order_by(ValuationRecord.valuation_date.desc()).all()


def get_latest_valuation(db: Session, investment_id: int) -> ValuationRecord | None:
    return db.query(ValuationRecord).filter(
        ValuationRecord.investment_id == investment_id
    ).order_by(ValuationRecord.valuation_date.desc()).first()


def get_valuation(db: Session, valuation_id: int) -> ValuationRecord:
    record = db.query(ValuationRecord).filter(
        ValuationRecord.id == valuation_id
    ).first()
    if not record:
        raise not_found("Valuation record not found")
    return record


def update_valuation(db: Session, valuation_id: int, data: dict) -> ValuationRecord:
    record = get_valuation(db, valuation_id)
    for key, value in data.items():
        if value is not None:
            setattr(record, key, value)
    db.commit()
    db.refresh(record)
    return record


def delete_valuation(db: Session, valuation_id: int):
    record = get_valuation(db, valuation_id)
    db.delete(record)
    db.commit()
