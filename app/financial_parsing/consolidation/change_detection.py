"""Period-over-period change detection for financial statements."""

from sqlalchemy.orm import Session

from app.financial_parsing.consolidation.aggregation import (
    build_comparison_dataset,
)


def compute_period_changes(aligned_data: dict) -> dict:
    """For each adjacent period pair, compute absolute and percent change.

    Args:
        aligned_data: output of align_line_items_across_periods()

    Returns:
        {
            "period_pairs": [["Q1 2023", "Q2 2023"], ...],
            "rows": [
                {
                    "canonical_label": "Revenue",
                    "category": "revenue",
                    "is_total": false,
                    "indent_level": 0,
                    "values": {"Q1 2023": 1000, "Q2 2023": 1200},
                    "changes": {
                        "Q1 2023 -> Q2 2023": {
                            "absolute": 200,
                            "percent": 20.0,
                            "significant": true,
                        }
                    }
                },
                ...
            ]
        }
    """
    periods = aligned_data.get("periods", [])
    rows = aligned_data.get("rows", [])

    period_pairs = []
    for i in range(len(periods) - 1):
        period_pairs.append([periods[i], periods[i + 1]])

    result_rows = []
    for row in rows:
        values = row.get("values", {})
        changes = {}
        for prev_period, curr_period in period_pairs:
            prev_val = values.get(prev_period)
            curr_val = values.get(curr_period)
            pair_key = f"{prev_period} -> {curr_period}"

            if prev_val is not None and curr_val is not None:
                absolute = curr_val - prev_val
                percent = (
                    (absolute / abs(prev_val)) * 100 if prev_val != 0 else None
                )
                significant = (
                    abs(absolute) > 1000 or
                    (percent is not None and abs(percent) > 20)
                )
                changes[pair_key] = {
                    "absolute": round(absolute, 2),
                    "percent": round(percent, 2) if percent is not None else None,
                    "significant": significant,
                }
            else:
                changes[pair_key] = {
                    "absolute": None,
                    "percent": None,
                    "significant": False,
                }

        result_rows.append({
            **row,
            "changes": changes,
        })

    return {
        "period_pairs": period_pairs,
        "rows": result_rows,
    }


def build_change_detection_dataset(db: Session, investment_id: int) -> dict:
    """Build change detection data grouped by statement type."""
    comparison = build_comparison_dataset(db, investment_id)
    statement_types = comparison.get("statement_types", {})

    result = {}
    for stmt_type, aligned in statement_types.items():
        result[stmt_type] = compute_period_changes(aligned)

    return {
        "investment_id": investment_id,
        "statement_types": result,
    }
