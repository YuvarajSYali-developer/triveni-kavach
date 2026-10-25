"""Central error handling producing a consistent JSON error shape:

{"detail": "<human readable message>", "code": "<machine code>", "errors": [...]}
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("triveni_kavach")

_CODES = {
    400: "bad_request",
    401: "unauthenticated",
    403: "forbidden",
    404: "not_found",
    409: "conflict",
    422: "validation_error",
    429: "rate_limited",
    503: "service_unavailable",
}


def _body(detail: str, code: str, errors: list | None = None) -> dict:
    body: dict = {"detail": detail, "code": code}
    if errors:
        body["errors"] = errors
    return body


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException):
        detail = exc.detail if isinstance(exc.detail, str) else "Request failed."
        return JSONResponse(
            _body(detail, _CODES.get(exc.status_code, "error")),
            status_code=exc.status_code,
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        errors = []
        for err in exc.errors():
            loc = [str(p) for p in err.get("loc", []) if p not in ("body", "query", "path")]
            msg = str(err.get("msg", "Invalid value")).removeprefix("Value error, ")
            errors.append({"field": ".".join(loc) or None, "message": msg})
        return JSONResponse(
            _body("Some fields are invalid. Please correct them and try again.", "validation_error", errors),
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    @app.exception_handler(IntegrityError)
    async def integrity_error(_: Request, exc: IntegrityError):
        logger.warning("Integrity error: %s", exc.orig.__class__.__name__)
        return JSONResponse(
            _body("The change conflicts with existing data (duplicate or invalid reference).", "conflict"),
            status_code=status.HTTP_409_CONFLICT,
        )

    @app.exception_handler(SQLAlchemyError)
    async def db_error(_: Request, exc: SQLAlchemyError):
        logger.error("Database error: %s", exc.__class__.__name__)
        return JSONResponse(
            _body("A database error occurred. The change was not saved.", "database_error"),
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):
        logger.exception("Unhandled error: %s", exc.__class__.__name__)
        return JSONResponse(
            _body("An unexpected server error occurred.", "internal_error"),
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
