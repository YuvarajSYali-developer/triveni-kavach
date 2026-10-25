/** WMO weather interpretation codes used by Open-Meteo. */
export function weatherLabel(code: number | null): string {
  if (code === null) return '—';
  if (code === 0) return 'Clear sky';
  if (code <= 3) return ['Mainly clear', 'Partly cloudy', 'Overcast'][code - 1];
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code >= 95) return 'Thunderstorm';
  return `Code ${code}`;
}
