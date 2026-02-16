import os

from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./finance.db"
    UPLOAD_ROOT: Path = Path("uploads")
    MAX_FILE_SIZE: int = 50 * 1024 * 1024  # 50 MB
    ALLOWED_EXTENSIONS: set[str] = {".pdf", ".doc", ".docx", ".xlsx", ".xls"}

    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-sonnet-4-20250514"
    PARSING_CHUNK_SIZE: int = 25
    PARSING_CHUNK_OVERLAP: int = 5
    PARSING_MAX_CONCURRENT: int = 3

    FMP_API_KEY: str = ""

    model_config = {"env_prefix": "FINANCE_", "env_file": ".env", "extra": "ignore"}


_settings = Settings()
# FMP_API_KEY uses no prefix in .env — load it directly
if not _settings.FMP_API_KEY:
    from dotenv import dotenv_values
    _env = dotenv_values(".env")
    if _env.get("FMP_API_KEY"):
        _settings.FMP_API_KEY = _env["FMP_API_KEY"]

settings = _settings
