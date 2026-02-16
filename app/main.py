from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.migrations import startup_migrations
from app.investments.router import router as investments_router
from app.documents.router import router as documents_router
from app.documents.router import all_documents_router
from app.search.router import router as search_router
from app.securities.router import router as securities_router
from app.financial_parsing.router import router as financial_parsing_router
from app.financial_parsing.router import standalone_router as financial_standalone_router
from app.financial_parsing.dashboard_router import router as dashboard_router
from app.valuations.router import router as valuations_router
from app.financial_parsing.priority_router import router as priority_router
from app.financial_parsing.workflow_router import router as workflow_router
from app.comparables.router import router as comparables_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    startup_migrations(engine)
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Finance Document Management API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(investments_router, prefix="/api/v1")
app.include_router(documents_router, prefix="/api/v1")
app.include_router(all_documents_router, prefix="/api/v1")
app.include_router(search_router, prefix="/api/v1")
app.include_router(securities_router, prefix="/api/v1")
app.include_router(financial_parsing_router, prefix="/api/v1")
app.include_router(financial_standalone_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")
app.include_router(valuations_router, prefix="/api/v1")
app.include_router(priority_router, prefix="/api/v1")
app.include_router(workflow_router, prefix="/api/v1")
app.include_router(comparables_router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok"}
