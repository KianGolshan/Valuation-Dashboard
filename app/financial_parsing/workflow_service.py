"""Compute workflow status from existing ParseJob / FinancialStatement data."""

from sqlalchemy.orm import Session

from app.documents.models import Document
from app.financial_parsing.models import FinancialStatement, ParseJob


# Ordered pipeline stages (worst → best)
STAGES = ["not_parsed", "parsed", "partially_mapped", "mapped", "reviewed", "approved"]


def _latest_parse_job(db: Session, document_id: int) -> ParseJob | None:
    return (
        db.query(ParseJob)
        .filter(ParseJob.document_id == document_id)
        .order_by(ParseJob.created_at.desc())
        .first()
    )


def compute_document_workflow(db: Session, doc_id: int) -> dict:
    """Compute workflow status for a single document (by id)."""
    job = _latest_parse_job(db, doc_id)

    statements = (
        db.query(FinancialStatement)
        .filter(FinancialStatement.document_id == doc_id)
        .all()
    )

    total = len(statements)
    mapped_count = sum(1 for s in statements if s.investment_id is not None)
    reviewed_count = sum(
        1 for s in statements if s.review_status in ("reviewed", "approved")
    )
    approved_count = sum(1 for s in statements if s.review_status == "approved")

    low_confidence_count = 0
    for s in statements:
        for li in s.line_items:
            if li.extraction_confidence is not None and li.extraction_confidence < 0.8:
                low_confidence_count += 1

    # Determine status
    if not job or job.status in ("pending", "failed"):
        status = "not_parsed"
    elif total == 0:
        status = "parsed"
    elif mapped_count == 0:
        status = "parsed"
    elif mapped_count < total:
        status = "partially_mapped"
    elif approved_count == total:
        status = "approved"
    elif reviewed_count == total:
        status = "reviewed"
    else:
        status = "mapped"

    return {
        "workflow_status": status,
        "statement_count": total,
        "mapped_count": mapped_count,
        "reviewed_count": reviewed_count,
        "approved_count": approved_count,
        "low_confidence_count": low_confidence_count,
        "has_issues": low_confidence_count > 0 or (job and job.status == "failed"),
    }


def compute_investment_workflow_summary(db: Session, investment_id: int) -> dict:
    """Detailed workflow breakdown for one investment."""
    docs = (
        db.query(Document)
        .filter(Document.investment_id == investment_id)
        .all()
    )

    per_doc = []
    workflow_counts = {stage: 0 for stage in STAGES}
    total_statements = 0
    total_approved = 0

    for doc in docs:
        info = compute_document_workflow(db, doc.id)
        info["document_id"] = doc.id
        info["document_name"] = doc.document_name
        info["document_type"] = doc.document_type
        per_doc.append(info)

        workflow_counts[info["workflow_status"]] += 1
        total_statements += info["statement_count"]
        total_approved += info["approved_count"]

    doc_count = len(docs)
    # Overall status = worst stage present
    overall_status = "approved"
    for stage in STAGES:
        if workflow_counts[stage] > 0:
            overall_status = stage
            break

    completion_pct = (
        round(total_approved / total_statements * 100) if total_statements > 0 else 0
    )

    return {
        "investment_id": investment_id,
        "document_count": doc_count,
        "workflow_counts": workflow_counts,
        "overall_status": overall_status,
        "completion_pct": completion_pct,
        "total_statements": total_statements,
        "total_approved": total_approved,
        "documents": per_doc,
    }


def get_all_investments_workflow(db: Session) -> dict:
    """Compact summary keyed by investment_id (for sidebar)."""
    from app.investments.models import Investment

    investments = db.query(Investment).all()
    result = {}
    for inv in investments:
        summary = compute_investment_workflow_summary(db, inv.id)
        result[inv.id] = {
            "overall_status": summary["overall_status"],
            "completion_pct": summary["completion_pct"],
            "document_count": summary["document_count"],
            "total_statements": summary["total_statements"],
            "total_approved": summary["total_approved"],
        }
    return result
