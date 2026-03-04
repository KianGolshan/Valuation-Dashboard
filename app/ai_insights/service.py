"""AI Insights service — assembles compact financial context and streams Claude responses."""

from __future__ import annotations

import json
from datetime import date
from typing import AsyncIterator

import anthropic
from sqlalchemy.orm import Session

from app.config import settings
from app.financial_parsing.models import FinancialStatement, LineItem
from app.financial_parsing.ratio_service import compute_ratios
from app.investments.models import Investment
from app.securities.models import Security
from app.valuations.models import ValuationRecord

# ── Context assembly ───────────────────────────────────────────────────────────

_MAX_PERIODS = 6
_TOTAL_STMTS = {"income_statement", "balance_sheet", "cash_flow"}


def _disp(li: LineItem) -> float | None:
    return li.edited_value if li.edited_value is not None else li.value


def _compact_num(v: float | None) -> str:
    """Compact number: 1234567 → 1234567 (no decimals for large ints)."""
    if v is None:
        return ""
    if v == int(v):
        return str(int(v))
    return f"{v:.2f}"


def _stmt_block(stmt: FinancialStatement) -> str:
    """Serialize a statement as compact pipe-delimited rows: cat|value|period."""
    period = stmt.fiscal_period_label or stmt.period or "?"
    lines: list[str] = []
    seen_categories: set[str] = set()
    # Only is_total rows; fall back to first row per category if none
    totals = {li.category: li for li in stmt.line_items if li.is_total}
    others: dict[str, LineItem] = {}
    for li in stmt.line_items:
        if li.category not in totals and li.category not in others:
            others[li.category] = li
    items = {**others, **totals}

    for cat, li in items.items():
        val = _disp(li)
        if val is None:
            continue
        if cat in seen_categories:
            continue
        seen_categories.add(cat)
        lines.append(f"{cat}|{_compact_num(val)}|{period}")
    return "\n".join(lines)


def _format_ratio(r: dict) -> str | None:
    val = r.get("value")
    if val is None:
        return None
    fmt = r.get("format", "")
    period = r.get("period", "")
    if fmt == "pct":
        v_str = f"{val:.1f}%"
    elif fmt == "ratio":
        v_str = f"{val:.2f}x"
    elif fmt == "months":
        v_str = f"{val:.1f}mo"
    elif fmt == "currency":
        abs_v = abs(val)
        if abs_v >= 1e6:
            v_str = f"${val/1e6:.1f}M/mo"
        elif abs_v >= 1e3:
            v_str = f"${val/1e3:.1f}K/mo"
        else:
            v_str = f"${val:.0f}/mo"
    else:
        v_str = str(val)
    prior = r.get("prior_value")
    delta = r.get("delta")
    parts = [f"{r['name']}:{v_str}@{period}"]
    if prior is not None:
        parts.append(f"prior={prior:.1f}")
    if delta is not None:
        parts.append(f"Δ={delta:+.1f}")
    return " ".join(parts)


def build_single_investment_context(db: Session, investment_id: int) -> str:
    """Build compact context string for a single investment.

    Target: under 1,500 tokens for a typical 4-period dataset.
    Format: pipe-delimited rows, no JSON, no prose.
    """
    inv = db.query(Investment).filter(Investment.id == investment_id).first()
    if not inv:
        return "Investment not found."

    lines: list[str] = []

    # ── Header ─────────────────────────────────────────────────────────────
    header_parts = [f"INVESTMENT:{inv.investment_name}"]
    if inv.asset_type:
        header_parts.append(f"type={inv.asset_type}")
    if inv.series:
        header_parts.append(f"series={inv.series}")
    lines.append(" ".join(header_parts))

    # ── Securities ─────────────────────────────────────────────────────────
    securities = db.query(Security).filter(Security.investment_id == investment_id).all()
    for sec in securities:
        parts = [f"SECURITY:{sec.investment_round or sec.description or f'#{sec.id}'}"]
        if sec.investment_date:
            parts.append(f"date={sec.investment_date}")
        if sec.investment_size is not None:
            parts.append(f"size={_compact_num(sec.investment_size)}")
        if sec.price_per_share is not None:
            parts.append(f"cost_basis={_compact_num(sec.price_per_share)}/sh")
        lines.append(" ".join(parts))

    # ── Financial statements ────────────────────────────────────────────────
    # Sort by review status priority (approved first), then reporting_date desc
    _STATUS_ORDER = {"approved": 0, "reviewed": 1, "pending": 2}
    stmts: list[FinancialStatement] = (
        db.query(FinancialStatement)
        .filter(FinancialStatement.investment_id == investment_id)
        .order_by(FinancialStatement.reporting_date.desc())
        .all()
    )
    stmts.sort(key=lambda s: (_STATUS_ORDER.get(s.review_status, 9), -(s.id or 0)))

    if stmts:
        # Group by period → stmt_type, keep most recent _MAX_PERIODS distinct periods
        # For each period+type, prefer higher-status statements (approved > reviewed > pending)
        period_order: list[str] = []
        by_period: dict[str, dict[str, FinancialStatement]] = {}
        for s in stmts:
            period = s.fiscal_period_label or s.period or "?"
            if period not in by_period:
                if len(period_order) < _MAX_PERIODS:
                    period_order.append(period)
                    by_period[period] = {}
                else:
                    continue
            stmt_type = s.statement_type
            existing = by_period[period].get(stmt_type)
            if existing is None:
                by_period[period][stmt_type] = s
            else:
                # Replace if current has better review status
                if _STATUS_ORDER.get(s.review_status, 9) < _STATUS_ORDER.get(existing.review_status, 9):
                    by_period[period][stmt_type] = s

        lines.append("---FINANCIALS---")
        for period in period_order:
            # Find highest status across statement types in this period
            period_stmts = [v for v in by_period[period].values()]
            best_status = min(
                (_STATUS_ORDER.get(s.review_status, 9) for s in period_stmts),
                default=9
            )
            status_label = {0: "approved", 1: "reviewed", 2: "pending"}.get(best_status, "pending")
            lines.append(f"PERIOD:{period}[{status_label}]")
            for stype in ("income_statement", "balance_sheet", "cash_flow"):
                stmt = by_period[period].get(stype)
                if stmt and stmt.line_items:
                    lines.append(f"#{stype}")
                    block = _stmt_block(stmt)
                    if block:
                        lines.append(block)
    else:
        lines.append("---FINANCIALS:none---")

    # ── Computed ratios ─────────────────────────────────────────────────────
    ratios = compute_ratios(db, investment_id)
    ratio_lines = [_format_ratio(r) for r in ratios]
    ratio_lines = [r for r in ratio_lines if r]
    if ratio_lines:
        lines.append("---RATIOS---")
        lines.extend(ratio_lines)

    # ── Valuation history ───────────────────────────────────────────────────
    valuations = (
        db.query(ValuationRecord)
        .filter(ValuationRecord.investment_id == investment_id)
        .order_by(ValuationRecord.valuation_date.desc())
        .limit(6)
        .all()
    )
    if valuations:
        lines.append("---VALUATIONS---")
        for v in valuations:
            parts = [f"VAL:{v.valuation_date}"]
            if v.methodology:
                parts.append(v.methodology)
            if v.multiple is not None:
                parts.append(f"{v.multiple:.1f}x")
            if v.price_per_share is not None:
                parts.append(f"${v.price_per_share:.2f}/sh")
            if v.implied_enterprise_value is not None:
                parts.append(f"EV={_compact_num(v.implied_enterprise_value)}")
            lines.append(" ".join(parts))

    return "\n".join(lines)


def build_all_investments_context(db: Session) -> str:
    """Build compact context for all investments.

    For multi-investment scope: latest IS totals only, no BS/CF, no valuation detail.
    Target: under 2,000 tokens regardless of portfolio size.
    """
    investments = db.query(Investment).order_by(Investment.investment_name).all()
    if not investments:
        return "No investments in portfolio."

    lines: list[str] = [f"PORTFOLIO:{len(investments)} investments"]

    for inv in investments:
        parts = [f"INV:{inv.investment_name}"]
        if inv.asset_type:
            parts.append(inv.asset_type)
        lines.append(" ".join(parts))

        # Latest income statement only
        latest_is = (
            db.query(FinancialStatement)
            .filter(
                FinancialStatement.investment_id == inv.id,
                FinancialStatement.statement_type == "income_statement",
            )
            .order_by(FinancialStatement.reporting_date.desc())
            .first()
        )
        if latest_is and latest_is.line_items:
            period = latest_is.fiscal_period_label or latest_is.period or "?"
            lines.append(f"#IS@{period}")
            block = _stmt_block(latest_is)
            if block:
                lines.append(block)

        # Latest valuation (one line)
        latest_val = (
            db.query(ValuationRecord)
            .filter(ValuationRecord.investment_id == inv.id)
            .order_by(ValuationRecord.valuation_date.desc())
            .first()
        )
        if latest_val:
            v_parts = [f"VAL:{latest_val.valuation_date}"]
            if latest_val.methodology:
                v_parts.append(latest_val.methodology)
            if latest_val.price_per_share is not None:
                v_parts.append(f"${latest_val.price_per_share:.2f}/sh")
            lines.append(" ".join(v_parts))

        lines.append("")  # blank separator between investments

    return "\n".join(lines)


# ── System prompt ──────────────────────────────────────────────────────────────

def build_system_prompt(scope: str) -> str:
    today = date.today().isoformat()
    return (
        f"You are a financial analyst for a private equity portfolio platform. "
        f"Answer questions using only the data below. Show calculations. "
        f"Use markdown. Say 'insufficient data' when needed. Today: {today}."
    )


# ── Streaming ──────────────────────────────────────────────────────────────────

async def stream_insight(
    db: Session,
    question: str,
    investment_id: int | None,
    scope: str,
    history: list[dict],
) -> AsyncIterator[str]:
    """Stream Claude response as SSE data events.

    Yields strings of the form "data: {...}\\n\\n" or "data: [DONE]\\n\\n".
    """
    # Assemble context
    if scope == "all" or investment_id is None:
        context = build_all_investments_context(db)
    else:
        context = build_single_investment_context(db, investment_id)

    system_prompt = build_system_prompt(scope)

    # Build message list: context injected as first user turn, then history, then question
    messages: list[dict] = []

    # Inject context as system-level knowledge in the first user message
    context_msg = f"<financial_data>\n{context}\n</financial_data>"

    # If this is the first message (no history), prepend context to the question
    if not history:
        full_question = f"{context_msg}\n\n{question}"
        messages = [{"role": "user", "content": full_question}]
    else:
        # Context already injected in first message of history; just append new question
        # Reconstruct: first turn includes context, subsequent turns are plain
        first_user_content = history[0].get("content", "")
        if not first_user_content.startswith("<financial_data>"):
            first_user_content = f"{context_msg}\n\n{first_user_content}"
        rebuilt = [{"role": history[0]["role"], "content": first_user_content}]
        rebuilt.extend(history[1:])
        rebuilt.append({"role": "user", "content": question})
        messages = rebuilt

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    try:
        async with client.messages.stream(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=2048,
            system=system_prompt,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield f"data: {json.dumps({'text': text})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"

    yield "data: [DONE]\n\n"
