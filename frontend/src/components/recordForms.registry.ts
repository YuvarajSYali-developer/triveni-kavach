import type { ReactNode } from 'react';
import type { RecordKind } from '../api/endpoints';
import { EnvironmentForm, HygieneForm, MortalityForm, VaccinationForm, VisitorForm, type FormProps } from './RecordForms';

export const RECORD_FORMS: { [K in RecordKind]: (p: FormProps<K>) => ReactNode } = {
  vaccinations: VaccinationForm,
  mortality: MortalityForm,
  hygiene: HygieneForm,
  visitors: VisitorForm,
  environment: EnvironmentForm,
};
