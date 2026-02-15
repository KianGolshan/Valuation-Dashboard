import os

from fastapi import APIRouter, BackgroundTasks, Depends, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.financial_parsing import service
from app.financial_parsing.schemas import (
    DocumentStatementsResponse,
    EditLogResponse,
    FinancialStatementResponse,
    LineItemEditRequest,
    LineItemResponse,
    MapInvestmentRequest,
    ParseJobResponse,
    ReviewRequest,
)

router = APIRouter(
    prefix="/investments/{investment_id}/documents/{document_id}/financials",
    tags=["Financial Parsing"],
)

# Standalone router for endpoints that don't need the document path prefix
standalone_router = APIRouter(tags=["Financial Parsing"])


# ── Parsing ─────────────────────────────────────────────────────────────

@router.post("/parse", response_model=ParseJobResponse, status_code=status.HTTP_202_ACCEPTED)
def trigger_parsing(
    investment_id: int,
    document_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    job, chunks = service.parse_document_financials(db, investment_id, document_id)
    pdf_path = db.query(service.Document).filter(
        service.Document.id == document_id
    ).first().file_path
    background_tasks.add_task(service.run_parsing, job.id, pdf_path, chunks)
    return job


@router.get("/status", response_model=ParseJobResponse | None)
def get_parse_status(
    investment_id: int,
    document_id: int,
    db: Session = Depends(get_db),
):
    job = service.get_parse_job(db, document_id)
    return job


@router.get("/history", response_model=list[ParseJobResponse])
def get_parse_history(
    investment_id: int,
    document_id: int,
    db: Session = Depends(get_db),
):
    from app.financial_parsing.models import ParseJob
    jobs = db.query(ParseJob).filter(
        ParseJob.document_id == document_id
    ).order_by(ParseJob.created_at.desc()).all()
    return jobs


@router.get("/", response_model=DocumentStatementsResponse)
def get_document_financials(
    investment_id: int,
    document_id: int,
    db: Session = Depends(get_db),
):
    job = service.get_parse_job(db, document_id)
    statements = service.get_statements_for_document(db, document_id)
    return DocumentStatementsResponse(parse_job=job, statements=statements)


@router.get("/statements/{statement_id}", response_model=FinancialStatementResponse)
def get_statement(
    investment_id: int,
    document_id: int,
    statement_id: int,
    db: Session = Depends(get_db),
):
    return service.get_statement(db, statement_id)


@router.get("/export")
def export_excel(
    investment_id: int,
    document_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    tmp_path = service.export_to_excel(db, document_id)
    background_tasks.add_task(os.unlink, tmp_path)
    return FileResponse(
        path=tmp_path,
        filename="financial_statements.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.delete("/", status_code=status.HTTP_204_NO_CONTENT)
def delete_financials(
    investment_id: int,
    document_id: int,
    db: Session = Depends(get_db),
):
    service.delete_financials(db, document_id)


# ── Review workflow ─────────────────────────────────────────────────────

@standalone_router.post(
    "/financials/statements/{statement_id}/review",
    response_model=FinancialStatementResponse,
)
def review_statement(
    statement_id: int,
    body: ReviewRequest,
    db: Session = Depends(get_db),
):
    return service.review_statement(
        db, statement_id, body.review_status, body.reviewer_id, body.review_notes,
    )


@standalone_router.post(
    "/financials/statements/{statement_id}/lock",
    response_model=FinancialStatementResponse,
)
def lock_statement(
    statement_id: int,
    db: Session = Depends(get_db),
):
    return service.lock_statement(db, statement_id)


# ── Line item editing ───────────────────────────────────────────────────

@standalone_router.patch(
    "/financials/line-items/{line_item_id}",
    response_model=LineItemResponse,
)
def edit_line_item(
    line_item_id: int,
    body: LineItemEditRequest,
    db: Session = Depends(get_db),
):
    return service.edit_line_item(db, line_item_id, body.edited_label, body.edited_value, body.user)


@standalone_router.get(
    "/financials/line-items/{line_item_id}/history",
    response_model=list[EditLogResponse],
)
def get_edit_history(
    line_item_id: int,
    db: Session = Depends(get_db),
):
    return service.get_edit_history(db, line_item_id)


# ── Investment mapping ──────────────────────────────────────────────────

@standalone_router.post(
    "/financials/statements/{statement_id}/map-investment",
    response_model=FinancialStatementResponse,
)
def map_investment(
    statement_id: int,
    body: MapInvestmentRequest,
    db: Session = Depends(get_db),
):
    return service.map_statement_to_investment(
        db, statement_id, body.investment_id, body.reporting_date, body.fiscal_period_label,
    )


@standalone_router.get(
    "/financials/statements/{statement_id}/suggest-mapping",
)
def suggest_mapping(
    statement_id: int,
    db: Session = Depends(get_db),
):
    return service.suggest_investment_mapping(db, statement_id)


@standalone_router.get(
    "/investments/{investment_id}/financials",
    response_model=list[FinancialStatementResponse],
)
def get_investment_financials(
    investment_id: int,
    db: Session = Depends(get_db),
):
    return service.get_investment_financials(db, investment_id)


# ── Provenance / Source Context ────────────────────────────────────────

@standalone_router.get("/financials/line-items/{line_item_id}/source-context")
def get_line_item_source_context(
    line_item_id: int,
    db: Session = Depends(get_db),
):
    return service.get_line_item_source_context(db, line_item_id)


@standalone_router.get("/financials/statements/{statement_id}/provenance")
def get_statement_provenance(
    statement_id: int,
    db: Session = Depends(get_db),
):
    return service.get_statement_provenance(db, statement_id)


@standalone_router.post(
    "/financials/line-items/{line_item_id}/confirm",
    response_model=LineItemResponse,
)
def confirm_line_item(
    line_item_id: int,
    db: Session = Depends(get_db),
    user: str | None = None,
):
    return service.confirm_line_item(db, line_item_id, user)
