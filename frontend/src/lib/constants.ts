import type { Farm } from '../api/types';

export const HAVERI_TALUKS = ['Byadgi', 'Hanagal', 'Haveri', 'Hirekerur', 'Rattihalli', 'Ranebennur', 'Savanur', 'Shiggaon'];

export function speciesFor(farm: Farm): ('pig' | 'poultry')[] {
  return farm.farm_type === 'mixed' ? ['pig', 'poultry'] : [farm.farm_type];
}
