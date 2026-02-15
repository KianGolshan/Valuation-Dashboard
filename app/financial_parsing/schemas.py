from datetime import datetime

from pydantic import BaseModel, ConfigDict


class LineItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category: str
    label: str
    value: float | None
    is_total: bool
    indent_level: int
    sort_order: int
    edited_label: str | None = None
    edited_value: float | None = None
    is_user_modified: bool = False
    canonical_label: str | None = None
    # Provenance fields
    source_page: int | None = None
    source_bbox: str | None = None
    extraction_confidence: float | None = None
    original_value: float | None = None
    extracted_text_snippet: str | None = None
    last_modified_by: str | None = None
    last_modified_at: datetime | None = None


class LineItemEditRequest(BaseModel):
    edited_label: str | None = None
    edited_value: float | None = None
    user: str | None = None


class FinancialStatementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    document_id: int
    statement_type: str
    period: str
    period_end_date: str | None
    currency: str | None
    unit: str | None
    source_pages: str | None
    review_status: str = "pending"
    reviewer_id: str | None = None
    review_notes: str | None = None
    locked: bool = False
    investment_id: int | None = None
    reporting_date: str | None = None
    fiscal_period_label: str | None = None
    created_at: datetime
    line_items: list[LineItemResponse]


class ReviewRequest(BaseModel):
    review_status: str  # pending, reviewed, approved
    reviewer_id: str | None = None
    review_notes: str | None = None


class MapInvestmentRequest(BaseModel):
    investment_id: int
    reporting_date: str | None = None
    fiscal_period_label: str | None = None


class ParseJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    document_id: int
    status: str
    total_chunks: int
    completed_chunks: int
    error_message: str | None
    created_at: datetime
    updated_at: datetime


class DocumentStatementsResponse(BaseModel):
    parse_job: ParseJobResponse | None
    statements: list[FinancialStatementResponse]


class EditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    line_item_id: int
    field: str
    old_value: str | None
    new_value: str | None
    user: str | None = None
    created_at: datetime
