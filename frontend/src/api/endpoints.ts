import { api } from './client';
import type {
  Alert, Assessment, AssessmentRun, DashboardSummary, EnvReading, Farm, Hygiene, ModelStatus, Mortality, Page,
  Screening, User, Vaccination, Visitor,
} from './types';

export const RECORD_KINDS = ['vaccinations', 'mortality', 'hygiene', 'visitors', 'environment'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];
export interface RecordMap {
  vaccinations: Vaccination; mortality: Mortality; hygiene: Hygiene; visitors: Visitor; environment: EnvReading;
}

export const Api = {
  health: () => api<{ status: string; database: string; screening_model_available: boolean; environment: string }>('/health'),
  login: (email: string, password: string) =>
    api<{ access_token: string; expires_in: number; user: User }>('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => api<User>('/auth/me'),

  users: (role?: string) => api<User[]>('/users', { query: { role } }),
  createUser: (body: unknown) => api<User>('/users', { method: 'POST', body }),
  updateUser: (id: number, body: unknown) => api<User>(`/users/${id}`, { method: 'PATCH', body }),

  farms: (query: { q?: string; farm_type?: string; taluk?: string; limit?: number; offset?: number } = {}) =>
    api<Page<Farm>>('/farms', { query }),
  farm: (id: number) => api<Farm>(`/farms/${id}`),
  createFarm: (body: unknown) => api<Farm>('/farms', { method: 'POST', body }),
  updateFarm: (id: number, body: unknown) => api<Farm>(`/farms/${id}`, { method: 'PATCH', body }),
  deleteFarm: (id: number) => api<void>(`/farms/${id}`, { method: 'DELETE' }),

  records: <K extends RecordKind>(farmId: number, kind: K, query: Record<string, string | number | undefined> = {}) =>
    api<Page<RecordMap[K]>>(`/farms/${farmId}/${kind}`, { query }),
  createRecord: <K extends RecordKind>(farmId: number, kind: K, body: unknown) =>
    api<RecordMap[K]>(`/farms/${farmId}/${kind}`, { method: 'POST', body }),
  updateRecord: <K extends RecordKind>(farmId: number, kind: K, id: number, body: unknown) =>
    api<RecordMap[K]>(`/farms/${farmId}/${kind}/${id}`, { method: 'PUT', body }),
  deleteRecord: (farmId: number, kind: RecordKind, id: number) =>
    api<void>(`/farms/${farmId}/${kind}/${id}`, { method: 'DELETE' }),
  simulate: (farmId: number, body: unknown) =>
    api<{ stored: number; source: string }>(`/farms/${farmId}/environment/simulate`, { method: 'POST', body }),

  assess: (farmId: number) => api<AssessmentRun>(`/farms/${farmId}/assessments`, { method: 'POST' }),
  assessments: (farmId: number) => api<Page<Assessment>>(`/farms/${farmId}/assessments`),
  alerts: (query: { status?: string; active?: boolean; severity?: string; farm_id?: number; limit?: number; offset?: number } = {}) =>
    api<Page<Alert>>('/alerts', { query }),
  acknowledge: (id: number) => api<Alert>(`/alerts/${id}/acknowledge`, { method: 'POST' }),
  resolve: (id: number, resolution_note: string) => api<Alert>(`/alerts/${id}/resolve`, { method: 'POST', body: { resolution_note } }),

  dashboard: (query: { date_from?: string; date_to?: string } = {}) => api<DashboardSummary>('/dashboard/summary', { query }),

  modelStatus: () => api<ModelStatus>('/screening/status'),
  screen: (body: unknown) => api<Screening>('/screening', { method: 'POST', body }),
  screenings: (query: { farm_id?: number; limit?: number; offset?: number } = {}) => api<Page<Screening>>('/screening', { query }),
};
