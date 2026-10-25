export type Role = 'admin' | 'veterinarian' | 'farmer';
export type FarmType = 'pig' | 'poultry' | 'mixed';
export type Species = 'pig' | 'poultry';
export type RiskStatus = 'low' | 'moderate' | 'high' | 'insufficient_data';
export type Severity = 'low' | 'medium' | 'high';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';
export type Source = 'manual' | 'simulated' | 'device';

export interface Page<T> { items: T[]; total: number; limit: number; offset: number }

export interface User {
  id: number; email: string; full_name: string; role: Role; phone: string | null; is_active: boolean; is_demo: boolean;
}
export interface UserBrief { id: number; full_name: string; role: Role }

export interface Farm {
  id: number; name: string; farm_type: FarmType; state: string; district: string; taluk: string; village: string | null;
  pig_count: number; poultry_count: number; total_animals: number; contact_phone: string | null;
  owner: UserBrief | null; veterinarian: UserBrief | null; is_demo: boolean; created_at: string; updated_at: string;
  open_alerts: number; latest_status: RiskStatus | null;
}

interface RecordBase { id: number; farm_id: number; notes: string | null; created_at: string; updated_at: string; recorded_by_id: number | null }
export interface Vaccination extends RecordBase {
  species: Species; vaccine_name: string; target_disease: string | null; status: 'scheduled' | 'completed' | 'missed';
  due_on: string | null; administered_on: string | null; animals_covered: number; batch_number: string | null;
}
export interface Mortality extends RecordBase { species: Species; observed_on: string; count: number; suspected_cause: string | null }
export interface Hygiene extends RecordBase {
  inspected_on: string; footbath_maintained: boolean; shed_cleaned: boolean; disinfectant_applied: boolean;
  waste_disposed_properly: boolean; protective_clothing_available: boolean; result: 'pass' | 'fail';
}
export interface Visitor extends RecordBase {
  visitor_name: string; purpose: string; entry_time: string; exit_time: string | null; vehicle_disinfected: boolean;
  footwear_changed: boolean; hands_sanitised: boolean; visited_other_farm_48h: boolean; precautions_complete: boolean;
}
export interface EnvReading extends RecordBase {
  observed_at: string; shed_label: string | null; temperature_c: number | null; relative_humidity_pct: number | null;
  ammonia_ppm: number | null; source: Source; device_id: string | null;
}

export interface TriggeredRule { code: string; title: string; severity: Severity; weight: number; detail: string }
export interface Assessment {
  id: number; farm_id: number; assessed_at: string; rules_version: string; status: RiskStatus; score: number | null;
  triggered_rules: TriggeredRule[]; observations: string[]; recommendations: string[];
  data_quality_warnings: string[]; limitations: string[];
}
export interface AssessmentRun { assessment: Assessment; alerts_created: number; alerts_updated: number }

export interface Alert {
  id: number; farm_id: number; farm_name: string; rule_code: string; severity: Severity; status: AlertStatus;
  title: string; message: string; first_seen_at: string; last_seen_at: string; occurrence_count: number;
  last_assessment_id: number | null; acknowledged_at: string | null; acknowledged_by_id: number | null;
  resolved_at: string | null; resolved_by_id: number | null; resolution_note: string | null;
}

export interface ScoredLabel { label: string; model_score: number; observed_for_species_in_training: boolean }
export interface Screening {
  id: number; created_at: string; farm_id: number | null; species: string; animal_identifier: string | null;
  inputs: Record<string, unknown> & { symptoms?: string[] }; model_version: string; top: ScoredLabel;
  alternatives: ScoredLabel[]; warnings: string[]; score_note: string; recommendation: string; limitations: string[];
}
export interface ModelStatus {
  available: boolean; error: string | null; model_version: string; model_species: string[]; enabled_species: string[];
  unsupported_species: { species: string; reason: string }[]; symptoms: string[]; labels: string[];
  labels_by_enabled_species: Record<string, string[]>;
  training_vital_ranges: Record<string, Record<string, [number, number]> | null>;
  historical_training_metrics: Record<string, number | string> | null; score_note: string; limitations: string[];
}

export interface DashboardSummary {
  role: Role;
  period: { from: string; to: string };
  contains_demo_data: boolean;
  farms: {
    total: number; by_type: { type: FarmType; count: number }[];
    by_taluk: { taluk: string; farms: number; open_alerts: number }[]; population: { pig: number; poultry: number };
  };
  vaccinations: {
    completed_in_period: number; missed_in_period: number; overdue: number; due_next_30_days: number;
    monthly_completed: { month: string; completed: number }[];
    upcoming: VaccinationDue[]; overdue_items: VaccinationDue[];
  };
  mortality: {
    total_in_period: number; by_species: { pig: number; poultry: number }; reports_in_period: number;
    weekly: { week_start: string; pig: number; poultry: number }[];
  };
  hygiene: { inspections_in_period: number; passed: number; failed: number };
  alerts: { active: number; open: number; acknowledged: number; by_severity: Record<Severity, number> };
  risk_status: { status: RiskStatus | 'not_assessed'; count: number }[];
  follow_up_farms: {
    farm_id: number; farm_name: string; taluk: string; latest_status: RiskStatus | null;
    latest_assessed_at: string | null; reasons: string[];
  }[];
  environment: { readings_in_period: Partial<Record<Source, number>> };
  screenings_in_period: number;
  official_notices: { id: number; disease: string; species: string; district: string; taluk: string | null; reported_on: string; source_name: string; source_url: string }[];
  recent_activity: { at: string; actor: string; action: string; summary: string; farm_id: number | null }[];
}
export interface VaccinationDue { id: number; farm_id: number; farm_name: string; vaccine_name: string; species: Species; due_on: string }

export interface Attribution { text: string; url: string; licence: string; licence_url: string }
export interface Weather {
  district: string; taluk: string; latitude: number; longitude: number; source: string; attribution: Attribution;
  observed_at: string | null; timezone: string | null; cached: boolean;
  current: {
    temperature_c: number | null; relative_humidity_pct: number | null; apparent_temperature_c: number | null;
    precipitation_mm: number | null; wind_speed_kmh: number | null; weather_code: number | null;
  };
  forecast: { date: string; temperature_max_c: number | null; temperature_min_c: number | null; precipitation_mm: number | null }[];
  advisories: string[];
}
export interface OutbreakNotice {
  id: number; disease: string; species: 'pig' | 'poultry' | 'both'; state: string; district: string; taluk: string | null;
  reported_on: string; status: 'active' | 'closed'; closed_on: string | null; source_name: string; source_url: string;
  reference: string | null; notes: string | null; created_by_id: number | null; created_at: string; updated_at: string;
}
export interface LivestockStat {
  id: number; state: string; district: string; species: Species; population: number; reference_year: number;
  source_name: string; source_url: string; import_method: string; notes: string | null; created_at: string;
}
export interface ImportResult { created: number; updated: number; skipped: string[] }
export interface DataGovPreview {
  resource_id: string; title: string | null; total: number | null; source_url: string;
  fields: { id: string; name: string; type: string }[]; sample_records: Record<string, unknown>[];
}
