"""Priority classification for PDF documents in the review queue."""

from sqlalchemy.orm import Session

from app.documents.models import Document
from app.financial_parsing.models import FinancialStatement, LineItem, ParseJob


EXPECTED_STATEMENT_TYPES = {"income_statement", "balance_sheet", "cash_flow"}


def classify_document(db: Session, doc: Document) -> dict:
    """Classify a single PDF document and return priority info."""
    score = 0
    issues = []

    # Check parse jobs
    latest_job = db.query(ParseJob).filter(
        ParseJob.document_id == doc.id
    ).order_by(ParseJob.created_at.desc()).first()

    if latest_job and latest_job.status == "failed":
        score += 100
        issues.append({"type": "parse_failure", "detail": latest_job.error_message or "Parse failed"})
    elif not latest_job:
        score += 50
        issues.append({"type": "never_parsed", "detail": "Document has never been parsed"})

    # Check statements
    statements = db.query(FinancialStatement).filter(
        FinancialStatement.document_id == doc.id
    ).all()

    if statements:
        found_types = {s.statement_type for s in statements}
        missing = EXPECTED_STATEMENT_TYPES - found_types
        for mt in missing:
            score += 30
            issues.append({"type": "missing_statement", "detail": f"Missing {mt.replace('_', ' ')}"})

        # Check for low confidence items
        stmt_ids = [s.id for s in statements]
        low_conf_count = db.query(LineItem).filter(
            LineItem.statement_id.in_(stmt_ids),
            LineItem.extraction_confidence.isnot(None),
            LineItem.extraction_confidence < 0.6,
        ).count()
        if low_conf_count > 0:
            score += 10 * low_conf_count
            issues.append({
                "type": "low_confidence",
                "detail": f"{low_conf_count} items with confidence < 0.6",
            })

        # Check for pending review
        pending_count = sum(1 for s in statements if s.review_status == "pending")
        if pending_count > 0:
            score += 20
            issues.append({
                "type": "pending_review",
                "detail": f"{pending_count} statements pending review",
            })

    return {
        "document_id": doc.id,
        "document_name": doc.document_name,
        "original_filename": doc.original_filename,
        "investment_id": doc.investment_id,
        "priority_score": score,
        "issues": issues,
    }


def get_global_priority_queue(db: Session) -> list[dict]:
    """Get priority queue across all PDF documents."""
    docs = db.query(Document).filter(
        Document.document_type == ".pdf"
    ).all()

    items = []
    for doc in docs:
        result = classify_document(db, doc)
        if result["priority_score"] > 0:
            items.append(result)

    items.sort(key=lambda x: x["priority_score"], reverse=True)
    return items


def get_investment_priority_queue(db: Session, investment_id: int) -> list[dict]:
    """Get priority queue for a specific investment."""
    docs = db.query(Document).filter(
        Document.investment_id == investment_id,
        Document.document_type == ".pdf",
    ).all()

    items = []
    for doc in docs:
        result = classify_document(db, doc)
        if result["priority_score"] > 0:
            items.append(result)

    items.sort(key=lambda x: x["priority_score"], reverse=True)
    return items
