"""Idempotent startup migrations for adding new columns to existing tables.

SQLAlchemy's create_all() doesn't add columns to existing tables, so we
use ALTER TABLE with dialect-aware schema introspection.
SQLite uses PRAGMA table_info(); Postgres uses information_schema.columns.
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def _get_existing_columns(engine: Engine, table_name: str) -> set[str]:
    dialect = engine.dialect.name
    with engine.connect() as conn:
        if dialect == "sqlite":
            rows = conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
            return {row[1] for row in rows}
        else:
            rows = conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = :t AND table_schema = 'public'"
                ),
                {"t": table_name},
            ).fetchall()
            return {row[0] for row in rows}


def _pg_type(sqlite_type: str) -> str:
    """Map SQLite column type to Postgres-compatible DDL type."""
    mapping = {
        "INTEGER": "INTEGER",
        "REAL": "DOUBLE PRECISION",
        "TEXT": "TEXT",
        "DATETIME": "TIMESTAMP",
        "BOOLEAN": "BOOLEAN",
        "VARCHAR(255)": "VARCHAR(255)",
        "VARCHAR(100)": "VARCHAR(100)",
    }
    return mapping.get(sqlite_type, sqlite_type)


def _add_column_if_missing(
    engine: Engine, table_name: str, column_name: str,
    column_type: str, existing_columns: set[str],
):
    if column_name in existing_columns:
        return
    dialect = engine.dialect.name
    col_type_ddl = column_type if dialect == "sqlite" else _pg_type(column_type)
    ddl = f"ALTER TABLE {table_name} ADD COLUMN {column_name} {col_type_ddl}"
    with engine.connect() as conn:
        conn.execute(text(ddl))
        conn.commit()
    logger.info("Migration: added %s.%s (%s)", table_name, column_name, col_type_ddl)


def startup_migrations(engine: Engine):
    """Run all idempotent column additions. Safe to call on every startup."""
    # ── line_items table ────────────────────────────────────────────
    li_cols = _get_existing_columns(engine, "line_items")
    li_additions = [
        ("source_page", "INTEGER"),
        ("source_bbox", "TEXT"),
        ("extraction_confidence", "REAL"),
        ("original_value", "REAL"),
        ("extracted_text_snippet", "TEXT"),
        ("last_modified_by", "VARCHAR(255)"),
        ("last_modified_at", "DATETIME"),
    ]
    for col_name, col_type in li_additions:
        _add_column_if_missing(engine, "line_items", col_name, col_type, li_cols)

    # ── edit_logs table ─────────────────────────────────────────────
    el_cols = _get_existing_columns(engine, "edit_logs")
    el_additions = [
        ("user", "VARCHAR(255)"),
    ]
    for col_name, col_type in el_additions:
        _add_column_if_missing(engine, "edit_logs", col_name, col_type, el_cols)

    # ── valuation_records table ──────────────────────────────────────────────
    vr_cols = _get_existing_columns(engine, "valuation_records")
    vr_additions = [
        ("price_per_share", "REAL"),
        ("security_id", "INTEGER"),
        ("multiple", "REAL"),
        ("financial_metric", "VARCHAR(100)"),
        ("financial_metric_value", "REAL"),
    ]
    for col_name, col_type in vr_additions:
        _add_column_if_missing(engine, "valuation_records", col_name, col_type, vr_cols)

    logger.info("Startup migrations complete")
