import os

from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.financial_parsing import service
from app.financial_parsing.consolidation.aggregation import (
    build_comparison_dataset,
    group_by_investment_and_date,
    align_line_items_across_periods,
)
from app.financial_parsing.consolidation.change_detection import (
    build_change_detection_dataset,
)
from app.financial_parsing.consolidation.normalization import (
    normalize_all_for_investment,
)
from app.documents.models import Document
from app.financial_parsing.models import FinancialStatement
from app.financial_parsing.schemas import FinancialStatementResponse

router = APIRouter(
    prefix="/dashboard",
    tags=["Financial Dashboard"],
)


@router.get("/financials/{investment_id}")
def get_dashboard_financials(
    investment_id: int,
    db: Session = Depends(get_db),
):
    """Get all financial data for an investment, grouped and aligned by period."""
    return build_comparison_dataset(db, investment_id)


@router.get("/financial-trends/{investment_id}")
def get_financial_trends(
    investment_id: int,
    db: Session = Depends(get_db),
):
    """Get trend data: key metrics across periods for charting."""
    groups = group_by_investment_and_date(db, investment_id)

    KEY_METRICS = [
        "Revenue", "Total Revenue", "Net Income", "Gross Profit",
        "Operating Income", "Total Assets", "Total Liabilities",
        "Total Stockholders' Equity", "Cash & Cash Equivalents",
        "Cash from Operating Activities", "EBITDA",
    ]

    trends: dict[str, list[dict]] = {}

    for stmt_type, stmts in groups.items():
        for stmt in stmts:
            period_label = stmt.fiscal_period_label or stmt.period
            for li in stmt.line_items:
                label = li.canonical_label or li.edited_label or li.label
                if label in KEY_METRICS:
                    if label not in trends:
                        trends[label] = []
                    val = li.edited_value if li.edited_value is not None else li.value
                    trends[label].append({
                        "period": period_label,
                        "reporting_date": stmt.reporting_date,
                        "value": val,
                        "statement_type": stmt_type,
                    })

    return {
        "investment_id": investment_id,
        "trends": trends,
    }


@router.get("/financials/{investment_id}/changes")
def get_period_changes(
    investment_id: int,
    db: Session = Depends(get_db),
):
    """Get period-over-period changes for an investment."""
    return build_change_detection_dataset(db, investment_id)


@router.post("/financials/{investment_id}/normalize")
def normalize_investment_labels(
    investment_id: int,
    db: Session = Depends(get_db),
):
    """Run label normalization on all statements for an investment."""
    count = normalize_all_for_investment(db, investment_id)
    return {"normalized_count": count}


@router.get(
    "/financials/{investment_id}/statements",
    response_model=list[FinancialStatementResponse],
)
def list_investment_statements(
    investment_id: int,
    statement_type: str | None = None,
    db: Session = Depends(get_db),
):
    """List all statements for an investment, optionally filtered by type."""
    query = db.query(FinancialStatement).filter(
        FinancialStatement.investment_id == investment_id
    )
    if statement_type:
        query = query.filter(FinancialStatement.statement_type == statement_type)
    return query.order_by(
        FinancialStatement.reporting_date.desc(),
        FinancialStatement.statement_type,
    ).all()


@router.get("/financials/{investment_id}/export/statements")
def export_investment_statements(
    investment_id: int,
    background_tasks: BackgroundTasks,
    include_valuation: bool = False,
    db: Session = Depends(get_db),
):
    """Export all statements for an investment to Excel (statement view)."""
    tmp_path = service.export_investment_statements_to_excel(
        db, investment_id, include_valuation=include_valuation,
    )
    background_tasks.add_task(os.unlink, tmp_path)
    return FileResponse(
        path=tmp_path,
        filename="financial_statements.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.get("/financials/{investment_id}/export/comparison")
def export_investment_comparison(
    investment_id: int,
    background_tasks: BackgroundTasks,
    include_valuation: bool = False,
    db: Session = Depends(get_db),
):
    """Export period comparison data for an investment to Excel."""
    tmp_path = service.export_investment_comparison_to_excel(db, investment_id)
    background_tasks.add_task(os.unlink, tmp_path)
    return FileResponse(
        path=tmp_path,
        filename="financial_comparison.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.get("/financials/{investment_id}/key-metrics")
def get_key_metrics_by_period(
    investment_id: int,
    db: Session = Depends(get_db),
):
    """Return key financial metrics grouped by period for use in the Valuation form.

    Focuses on income statement categories most commonly used as valuation anchors.
    """
    KEY_CATEGORIES = {
        "revenue": "Revenue",
        "gross_profit": "Gross Profit",
        "operating_income": "Operating Income (EBIT)",
        "net_income": "Net Income",
    }
    # Approximate EBITDA from operating_income + depreciation_amortization
    stmts = (
        db.query(FinancialStatement)
        .filter(
            FinancialStatement.investment_id == investment_id,
            FinancialStatement.statement_type == "income_statement",
        )
        .order_by(FinancialStatement.reporting_date.desc())
        .all()
    )

    periods: list[dict] = []
    seen = set()
    for stmt in stmts:
        period_label = stmt.fiscal_period_label or stmt.period
        if period_label in seen:
            continue
        seen.add(period_label)

        metrics: dict[str, float | None] = {}
        da_value: float | None = None
        for li in stmt.line_items:
            cat = li.category
            val = li.edited_value if li.edited_value is not None else li.value
            if cat in KEY_CATEGORIES:
                metrics[KEY_CATEGORIES[cat]] = val
            if cat == "depreciation_amortization" and val is not None:
                da_value = val

        # Compute LTM EBITDA if we have operating income and D&A
        oi = metrics.get("Operating Income (EBIT)")
        if oi is not None and da_value is not None:
            metrics["EBITDA (approx)"] = oi + abs(da_value)

        if metrics:
            periods.append({
                "period_label": period_label,
                "reporting_date": stmt.reporting_date,
                "statement_id": stmt.id,
                "metrics": metrics,
            })

    return {"investment_id": investment_id, "periods": periods}


@router.get("/financials/{investment_id}/unmapped-statements")
def get_unmapped_statements(
    investment_id: int,
    db: Session = Depends(get_db),
):
    """Return statements from this investment's documents that have no investment_id mapping."""
    doc_ids = [
        d.id
        for d in db.query(Document.id)
        .filter(Document.investment_id == investment_id)
        .all()
    ]
    if not doc_ids:
        return []
    stmts = (
        db.query(FinancialStatement)
        .filter(
            FinancialStatement.document_id.in_(doc_ids),
            FinancialStatement.investment_id.is_(None),
        )
        .order_by(FinancialStatement.created_at.desc())
        .all()
    )
    return [
        {
            "id": s.id,
            "document_id": s.document_id,
            "statement_type": s.statement_type,
            "period": s.period,
            "review_status": s.review_status,
        }
        for s in stmts
    ]
