import type { Farm } from '../api/types';

export const HAVERI_TALUKS = ['Byadgi', 'Hanagal', 'Haveri', 'Hirekerur', 'Rattihalli', 'Ranebennur', 'Savanur', 'Shiggaon'];

export function speciesFor(farm: Farm): ('pig' | 'poultry')[] {
  return farm.farm_type === 'mixed' ? ['pig', 'poultry'] : [farm.farm_type];
}

/** Approximate taluk headquarters towns (Haveri district). Used only to place taluk-level
 * summaries and regional weather on maps; farms have no coordinates. */
export const TALUK_COORDS: Record<string, [number, number]> = {
  Byadgi: [14.678, 75.487], Hanagal: [14.767, 75.133], Haveri: [14.795, 75.404], Hirekerur: [14.455, 75.395],
  Rattihalli: [14.417, 75.55], Ranebennur: [14.623, 75.622], Savanur: [14.973, 75.337], Shiggaon: [14.991, 75.223],
};
export const HAVERI_CENTER: [number, number] = [14.72, 75.4];
