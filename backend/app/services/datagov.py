"""Connector for the Open Government Data Platform India (https://data.gov.in).

Workflow (deliberately two-step, because dataset layouts differ and must not be guessed):
  1. ``preview(resource_id)`` fetches the dataset's field list and a few sample records so an
     administrator can see the real column names.
  2. ``fetch_population_rows(...)`` downloads the records and maps the columns the
     administrator selected (state, district, pig count, poultry count) into rows.

No dataset ID or field name is hard-coded. Values that are not clean non-negative numbers
are skipped and reported, never estimated.
"""

from __future__ import annotations

import re
from typing import Any

import httpx

from app.core.config import get_settings

PAGE_SIZE = 500
MAX_RECORDS = 20_000
RESOURCE_ID_PATTERN = re.compile(r"^[A-Za-z0-9-]{8,64}$")


class DataGovError(RuntimeError):
    pass


def _key() -> str:
    key = get_settings().DATA_GOV_IN_API_KEY
    if not key:
        raise DataGovError("DATA_GOV_IN_API_KEY is not configured. Register at data.gov.in and set the key on the server.")
    return key


def _get(resource_id: str, params: dict[str, Any], client: httpx.Client | None) -> dict[str, Any]:
    if not RESOURCE_ID_PATTERN.match(resource_id):
        raise DataGovError("The resource ID looks invalid (letters, digits and dashes only).")
    s = get_settings()
    url = f"{s.DATA_GOV_IN_API_URL.rstrip('/')}/{resource_id}"
    query = {"api-key": _key(), "format": "json", **params}
    try:
        if client is not None:
            resp = client.get(url, params=query, timeout=20)
        else:
            with httpx.Client() as c:
                resp = c.get(url, params=query, timeout=20)
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPStatusError as exc:
        raise DataGovError(f"data.gov.in returned HTTP {exc.response.status_code}. Check the resource ID and API key.") from None
    except (httpx.HTTPError, ValueError) as exc:
        raise DataGovError(f"data.gov.in could not be reached ({exc.__class__.__name__}).") from None
    if not isinstance(data, dict) or not isinstance(data.get("records"), list):
        raise DataGovError("data.gov.in returned an unexpected response (no 'records' list).")
    return data


def _fields(data: dict[str, Any]) -> list[dict[str, str]]:
    out = []
    for f in data.get("field") or []:
        if isinstance(f, dict) and f.get("id"):
            out.append({"id": str(f["id"]), "name": str(f.get("name") or f["id"]), "type": str(f.get("type") or "")})
    if not out and data["records"]:
        out = [{"id": k, "name": k, "type": ""} for k in data["records"][0]]
    return out


def preview(resource_id: str, client: httpx.Client | None = None) -> dict[str, Any]:
    data = _get(resource_id, {"offset": 0, "limit": 5}, client)
    return {
        "resource_id": resource_id,
        "title": data.get("title"),
        "organisation": data.get("org") if isinstance(data.get("org"), list | str) else None,
        "total": data.get("total"),
        "fields": _fields(data),
        "sample_records": data["records"][:5],
        "source_url": f"https://data.gov.in/resource/{resource_id}",
    }


def parse_count(value: Any) -> int | None:
    """Parse '1,234' / 1234 / '1234.0' into an int; anything else (NA, '-', blank) -> None."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value >= 0 else None
    if isinstance(value, float):
        return int(value) if value >= 0 and value.is_integer() else None
    if isinstance(value, str):
        v = value.strip().replace(",", "")
        if re.fullmatch(r"\d+(\.0+)?", v):
            return int(float(v))
    return None


def fetch_population_rows(
    resource_id: str,
    state_field: str,
    district_field: str,
    pig_field: str | None,
    poultry_field: str | None,
    state_filter: str | None = None,
    client: httpx.Client | None = None,
) -> tuple[list[dict[str, Any]], list[str]]:
    """Return ([{state, district, species, population}], skipped-messages)."""
    if not pig_field and not poultry_field:
        raise DataGovError("Choose at least one of the pig or poultry fields.")
    rows: list[dict[str, Any]] = []
    skipped: list[str] = []
    offset = 0
    while offset < MAX_RECORDS:
        data = _get(resource_id, {"offset": offset, "limit": PAGE_SIZE}, client)
        records = data["records"]
        for i, rec in enumerate(records):
            if not isinstance(rec, dict):
                continue
            state = str(rec.get(state_field) or "").strip()
            district = str(rec.get(district_field) or "").strip()
            if not state or not district:
                skipped.append(f"record {offset + i}: missing state or district")
                continue
            if state_filter and state.lower() != state_filter.strip().lower():
                continue
            for species, field in (("pig", pig_field), ("poultry", poultry_field)):
                if not field:
                    continue
                count = parse_count(rec.get(field))
                if count is None:
                    skipped.append(f"{district}, {state}: {species} value {rec.get(field)!r} is not a number")
                    continue
                rows.append({"state": state, "district": district, "species": species, "population": count})
        if len(records) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows, skipped
