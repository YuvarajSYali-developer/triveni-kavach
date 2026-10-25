import { describe, expect, it } from 'vitest';
import { weatherLabel } from './weather';

describe('weatherLabel', () => {
  it('maps WMO codes and never invents a value for missing data', () => {
    expect(weatherLabel(0)).toBe('Clear sky');
    expect(weatherLabel(2)).toBe('Partly cloudy');
    expect(weatherLabel(63)).toBe('Rain');
    expect(weatherLabel(95)).toBe('Thunderstorm');
    expect(weatherLabel(null)).toBe('—');
  });
});
