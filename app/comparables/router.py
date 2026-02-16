"""Comparables module router."""

import json
import os
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.comparables import fmp_service, service
from app.comparables.fmp_service import FmpError
from app.comparables.schemas import (
    AnalysisResponse,
    CompanyAdd,
    CompanyInSet,
    CompanyUpdate,
    CompSetCreate,
    CompSetResponse,
    CompSetUpdate,
    FmpSearchResult,
    ProfileResponse,
    ProfileUpsert,
)

router = APIRouter(tags=["Comparables"])

BENCHMARKS_PATH = Path(__file__).parent / "benchmarks.json"


# ── Profile ─────────────────────────────────────────────────────────

@router.put(
    "/investments/{investment_id}/profile",
    response_model=ProfileResponse,
)
def upsert_profile(
    investment_id: int, data: ProfileUpsert, db: Session = Depends(get_db)
):
    return service.upsert_profile(db, investment_id, data)


@router.get(
    "/investments/{investment_id}/profile",
    response_model=ProfileResponse | None,
)
def get_profile(investment_id: int, db: Session = Depends(get_db)):
    return service.get_profile(db, investment_id)


# ── Comp Sets ───────────────────────────────────────────────────────

@router.post(
    "/investments/{investment_id}/comp-sets",
    response_model=CompSetResponse,
    status_code=201,
)
def create_comp_set(
    investment_id: int, data: CompSetCreate, db: Session = Depends(get_db)
):
    return service.create_comp_set(db, investment_id, data)


@router.get(
    "/investments/{investment_id}/comp-sets",
    response_model=list[CompSetResponse],
)
def list_comp_sets(investment_id: int, db: Session = Depends(get_db)):
    return service.list_comp_sets(db, investment_id)


@router.put("/comp-sets/{comp_set_id}", response_model=CompSetResponse)
def update_comp_set(
    comp_set_id: int, data: CompSetUpdate, db: Session = Depends(get_db)
):
    cs = service.update_comp_set(db, comp_set_id, data)
    if not cs:
        raise HTTPException(404, "Comp set not found")
    return cs


@router.delete("/comp-sets/{comp_set_id}", status_code=204)
def delete_comp_set(comp_set_id: int, db: Session = Depends(get_db)):
    if not service.delete_comp_set(db, comp_set_id):
        raise HTTPException(404, "Comp set not found")


# ── Companies ───────────────────────────────────────────────────────

@router.post(
    "/comp-sets/{comp_set_id}/companies",
    response_model=CompanyInSet,
    status_code=201,
)
def add_company(
    comp_set_id: int, data: CompanyAdd, db: Session = Depends(get_db)
):
    cs = service.get_comp_set(db, comp_set_id)
    if not cs:
        raise HTTPException(404, "Comp set not found")
    return service.add_company(db, comp_set_id, data)


@router.delete("/comp-sets/{comp_set_id}/companies/{company_id}", status_code=204)
def remove_company(
    comp_set_id: int, company_id: int, db: Session = Depends(get_db)
):
    if not service.remove_company(db, company_id):
        raise HTTPException(404, "Company not found")


@router.put(
    "/comp-sets/{comp_set_id}/companies/{company_id}",
    response_model=CompanyInSet,
)
def update_company(
    comp_set_id: int,
    company_id: int,
    data: CompanyUpdate,
    db: Session = Depends(get_db),
):
    company = service.update_company(db, company_id, data)
    if not company:
        raise HTTPException(404, "Company not found")
    return company


# ── Analysis ────────────────────────────────────────────────────────

@router.get("/comp-sets/{comp_set_id}/analysis", response_model=AnalysisResponse)
def get_analysis(comp_set_id: int, db: Session = Depends(get_db)):
    try:
        return service.run_analysis(db, comp_set_id)
    except ValueError as e:
        raise HTTPException(404, str(e))
    except FmpError as e:
        raise HTTPException(502, str(e))


# ── Export ───────────────────────────────────────────────────────────

def _cleanup_file(path: str):
    try:
        os.unlink(path)
    except OSError:
        pass


@router.get("/comp-sets/{comp_set_id}/export")
def export_comp_set(
    comp_set_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    try:
        path = service.export_comp_set_to_excel(db, comp_set_id)
    except ValueError as e:
        raise HTTPException(404, str(e))
    except FmpError as e:
        raise HTTPException(502, str(e))

    background_tasks.add_task(_cleanup_file, path)
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=f"comp_set_{comp_set_id}.xlsx",
    )


# ── FMP Search ──────────────────────────────────────────────────────

@router.get("/fmp/search", response_model=list[FmpSearchResult])
def fmp_search(query: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    try:
        return fmp_service.search_companies(query, db)
    except FmpError as e:
        raise HTTPException(502, str(e))


# ── Benchmarks ──────────────────────────────────────────────────────

@router.get("/benchmarks/{sector}")
def get_benchmarks(sector: str):
    with open(BENCHMARKS_PATH) as f:
        data = json.load(f)

    sectors = data.get("sectors", {})
    if sector not in sectors:
        available = list(sectors.keys())
        raise HTTPException(404, f"Sector '{sector}' not found. Available: {available}")

    return {
        "sector": sector,
        "note": data.get("_note", ""),
        "benchmarks": sectors[sector],
    }
