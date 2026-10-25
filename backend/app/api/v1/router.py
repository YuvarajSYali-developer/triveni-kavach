from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.v1 import assessments, auth, dashboard, farms, records, screening, users
from app.core.config import get_settings
from app.db.session import get_db
from app.services.screening.model_service import get_screening_model

api_router = APIRouter()


@api_router.get("/health", tags=["health"])
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        database = "ok"
    except Exception:
        database = "unavailable"
    return {
        "status": "ok" if database == "ok" else "degraded",
        "app": get_settings().APP_NAME,
        "environment": get_settings().APP_ENV,
        "database": database,
        "screening_model_available": get_screening_model().available,
    }


for module in (auth, users, farms, records, assessments, dashboard, screening):
    api_router.include_router(module.router)
