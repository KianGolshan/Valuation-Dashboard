# Finance-Project

A full-stack investment management and financial document analysis platform. Upload, parse, review, and compare financial statements across your portfolio — all in one place.

## Owner
Kian Golshan

## Features

### Investment & Security Management
- Create and organize investments by asset type (equity, debt, real estate, fund, crypto)
- Track multiple securities per investment with round details, dates, sizes, and price-per-share
- Sidebar navigation with search/filter and workflow status indicators

### Document Management
- Upload PDFs, Word docs, and Excel files against investments or individual securities
- Cross-investment document browser with filtering by investment, file type, and workflow stage
- Inline document viewer and direct download

### Financial Parsing & Extraction
- AI-powered PDF parsing extracts financial statements (income statements, balance sheets, cash flow statements) into structured line items
- Chunked processing with real-time progress tracking
- Extraction provenance: source page, bounding box, confidence scores, and original text snippets for every line item
- Parse validation panel for side-by-side comparison of extracted data against the source PDF

### Review & Edit Workflow
- Statement-level review workflow: pending, reviewed, approved
- Lock approved statements to prevent further edits
- Inline editing of line item labels and values with full audit trail (edit history per field)
- User confirmation of individual line items with confidence tracking
- Map parsed statements to investments with auto-suggested mappings

### Workflow Tracking
- Computed workflow pipeline per document: Not Parsed → Parsed → Mapped → Reviewed → Approved
- All statuses derived from existing data (no extra database columns)
- Sidebar workflow dots showing per-investment status at a glance
- Documents tab with workflow badges, detail counts, and stage filter
- Investment panel progress bar showing document distribution across pipeline stages

### Financial Dashboard
- Period-over-period comparison: line items aligned across reporting periods for any investment
- Label normalization to unify equivalent line items across different documents
- Trend analysis for key financial metrics (revenue, net income, total assets, etc.)
- Period-over-period change detection with absolute and percentage deltas
- Export to Excel: statement view and comparison view

### Valuations
- Record investment valuations with date tracking
- View latest and historical valuations per investment

### Search
- Full-text search across all documents with investment and date filters

## Prerequisites

- Python 3.12+
- Node.js 18+

## Getting Started

### Backend

```bash
# Install Python dependencies
pip install -r requirements.txt

# Start the API server (runs on http://localhost:8000)
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend

# Install Node dependencies
npm install

# Start the dev server (runs on http://localhost:5173)
npm run dev
```

The frontend dev server proxies `/api` requests to the backend automatically.

### Configuration

The backend can be configured via environment variables (prefixed with `FINANCE_`):

| Variable | Default | Description |
|---|---|---|
| `FINANCE_DATABASE_URL` | `sqlite:///./finance.db` | Database connection string |
| `FINANCE_UPLOAD_ROOT` | `uploads` | Directory for uploaded files |
| `FINANCE_MAX_FILE_SIZE` | `52428800` (50 MB) | Max upload size in bytes |

## Architecture

- **Backend**: FastAPI + SQLAlchemy + SQLite
- **Frontend**: React 18 + Tailwind CSS + Vite
- **Pattern**: Feature modules under `app/` with `models.py`, `schemas.py`, `router.py`, `service.py`
- **Database**: SQLite at `finance.db`, uploads stored in `uploads/investments/`

## API

- **Docs**: http://localhost:8000/docs (Swagger UI)
- **Health check**: `GET /health`
- All routes are under `/api/v1` (investments, documents, securities, financials, workflow, search, valuations)
