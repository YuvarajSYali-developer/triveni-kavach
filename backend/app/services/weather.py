"""Live regional weather from Open-Meteo (https://open-meteo.com).

* Weather is looked up for a taluk's headquarters town. These are approximate public
  town-centre coordinates used ONLY to query regional weather; farms themselves store no
  coordinates. The values describe the surrounding area, not conditions inside a shed,
  and are never stored as farm environmental observations or used in the risk score.
* Data licence: Open-Meteo data is CC BY 4.0 and must be attributed (see ATTRIBUTION).
* Responses are cached in memory to stay well within the free, key-less usage limits.
* Upstream failures raise WeatherUnavailable; no placeholder values are ever returned.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import get_settings

ATTRIBUTION = {
    "text": "Weather data by Open-Meteo.com",
    "url": "https://open-meteo.com/",
    "licence": "CC BY 4.0",
    "licence_url": "https://creativecommons.org/licenses/by/4.0/",
}

# Approximate town-centre coordinates of taluk headquarters (Haveri district, Karnataka).
# Used only as weather lookup points; precision is ~1 km, which is far finer than the
# ~10 km resolution of the weather models queried.
TALUK_LOCATIONS: dict[tuple[str, str], tuple[float, float]] = {
    ("haveri", "byadgi"): (14.678, 75.487),
    ("haveri", "hanagal"): (14.767, 75.133),
    ("haveri", "haveri"): (14.795, 75.404),
    ("haveri", "hirekerur"): (14.455, 75.395),
    ("haveri", "rattihalli"): (14.417, 75.550),
    ("haveri", "ranebennur"): (14.623, 75.622),
    ("haveri", "savanur"): (14.973, 75.337),
    ("haveri", "shiggaon"): (14.991, 75.223),
}

CURRENT_VARS = "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m"
DAILY_VARS = "temperature_2m_max,temperature_2m_min,precipitation_sum"
HEAT_ADVISORY_C = 35.0  # provisional: forecast daily maximum at or above this triggers an advisory


class WeatherUnavailable(RuntimeError):
    pass


class LocationNotSupported(LookupError):
    pass


@dataclass
class _Entry:
    fetched: float
    data: dict[str, Any]


_cache: dict[tuple[str, str], _Entry] = {}
_lock = threading.Lock()


def supported_locations() -> list[dict[str, Any]]:
    return [
        {"district": d.title(), "taluk": t.title(), "latitude": lat, "longitude": lon}
        for (d, t), (lat, lon) in sorted(TALUK_LOCATIONS.items())
    ]


def _num(block: dict[str, Any], key: str) -> float | None:
    v = block.get(key)
    return float(v) if isinstance(v, int | float) and not isinstance(v, bool) else None


def parse_response(payload: dict[str, Any]) -> dict[str, Any]:
    """Validate and reshape an Open-Meteo forecast response. Missing values stay None."""
    if not isinstance(payload, dict) or not isinstance(payload.get("current"), dict):
        raise WeatherUnavailable("The weather service returned an unexpected response.")
    cur = payload["current"]
    daily = payload.get("daily") if isinstance(payload.get("daily"), dict) else {}
    dates = daily.get("time") if isinstance(daily.get("time"), list) else []

    def series(key: str) -> list:
        vals = daily.get(key)
        return vals if isinstance(vals, list) and len(vals) == len(dates) else [None] * len(dates)

    tmax, tmin, rain = series("temperature_2m_max"), series("temperature_2m_min"), series("precipitation_sum")
    forecast = [
        {
            "date": d,
            "temperature_max_c": tmax[i] if isinstance(tmax[i], int | float) else None,
            "temperature_min_c": tmin[i] if isinstance(tmin[i], int | float) else None,
            "precipitation_mm": rain[i] if isinstance(rain[i], int | float) else None,
        }
        for i, d in enumerate(dates)
    ]
    hot = [f for f in forecast if f["temperature_max_c"] is not None and f["temperature_max_c"] >= HEAT_ADVISORY_C]
    advisories = []
    if hot:
        advisories.append(
            f"Forecast maximum of {max(f['temperature_max_c'] for f in hot):.0f} °C on "
            f"{', '.join(f['date'] for f in hot)}. Check shed ventilation, shade and drinking water. "
            f"(Provisional advisory threshold {HEAT_ADVISORY_C:.0f} °C; regional forecast, not a shed measurement.)"
        )
    return {
        "observed_at": cur.get("time"),
        "timezone": payload.get("timezone"),
        "current": {
            "temperature_c": _num(cur, "temperature_2m"),
            "relative_humidity_pct": _num(cur, "relative_humidity_2m"),
            "apparent_temperature_c": _num(cur, "apparent_temperature"),
            "precipitation_mm": _num(cur, "precipitation"),
            "wind_speed_kmh": _num(cur, "wind_speed_10m"),
            "weather_code": _num(cur, "weather_code"),
        },
        "forecast": forecast,
        "advisories": advisories,
    }


def get_weather(district: str, taluk: str, client: httpx.Client | None = None) -> dict[str, Any]:
    s = get_settings()
    if not s.WEATHER_ENABLED:
        raise WeatherUnavailable("Live weather is disabled in this deployment.")
    key = (district.strip().lower(), taluk.strip().lower())
    if key not in TALUK_LOCATIONS:
        raise LocationNotSupported(f"No weather lookup point is configured for {taluk}, {district}.")
    lat, lon = TALUK_LOCATIONS[key]

    with _lock:
        hit = _cache.get(key)
        if hit and time.monotonic() - hit.fetched < s.WEATHER_CACHE_MINUTES * 60:
            return {**hit.data, "cached": True}

    params = {
        "latitude": lat,
        "longitude": lon,
        "current": CURRENT_VARS,
        "daily": DAILY_VARS,
        "forecast_days": 3,
        "timezone": "Asia/Kolkata",
    }
    try:
        if client is not None:
            resp = client.get(s.WEATHER_API_URL, params=params, timeout=s.WEATHER_TIMEOUT_SECONDS)
        else:
            with httpx.Client() as c:
                resp = c.get(s.WEATHER_API_URL, params=params, timeout=s.WEATHER_TIMEOUT_SECONDS)
        resp.raise_for_status()
        payload = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise WeatherUnavailable(f"The weather service could not be reached ({exc.__class__.__name__}).") from None

    data = {
        "district": key[0].title(),
        "taluk": key[1].title(),
        "latitude": lat,
        "longitude": lon,
        "source": "open-meteo",
        "attribution": ATTRIBUTION,
        **parse_response(payload),
    }
    with _lock:
        _cache[key] = _Entry(time.monotonic(), data)
    return {**data, "cached": False}


def clear_cache() -> None:
    with _lock:
        _cache.clear()
