# Database schema

Managed by Alembic (`backend/alembic/versions/0001_initial_schema.py`). Default database:
SQLite file `backend/triveni_kavach.db`; PostgreSQL is supported via `DATABASE_URL`.
Enumerations are stored as short strings (non-native enums) for portability.

```mermaid
erDiagram
  users ||--o{ farms : "owns (owner_id)"
  users ||--o{ farms : "assigned vet (veterinarian_id)"
  farms ||--o{ vaccination_records : has
  farms ||--o{ mortality_records : has
  farms ||--o{ hygiene_inspections : has
  farms ||--o{ visitor_logs : has
  farms ||--o{ environmental_observations : has
  farms ||--o{ biosecurity_assessments : has
  farms ||--o{ alerts : has
  farms ||--o{ animal_screenings : "optional link"
  biosecurity_assessments ||--o{ alerts : "last_assessment_id"
  users ||--o{ audit_logs : actor

  users {
    int id PK
    string email UK
    string full_name
    string role
    string hashed_password
    bool is_active
    bool is_demo
  }
  farms {
    int id PK
    string name
    string farm_type
    string district
    string taluk
    string village
    int pig_count
    int poultry_count
    int owner_id FK
    int veterinarian_id FK
    bool is_demo
  }
  vaccination_records {
    int id PK
    int farm_id FK
    string species
    string vaccine_name
    string status
    date due_on
    date administered_on
    int animals_covered
  }
  mortality_records {
    int id PK
    int farm_id FK
    string species
    date observed_on
    int count
    string suspected_cause
  }
  hygiene_inspections {
    int id PK
    int farm_id FK
    date inspected_on
    bool footbath_maintained
    bool shed_cleaned
    bool disinfectant_applied
    bool waste_disposed_properly
    bool protective_clothing_available
    string result
  }
  visitor_logs {
    int id PK
    int farm_id FK
    string visitor_name
    string purpose
    datetime entry_time
    datetime exit_time
    bool vehicle_disinfected
    bool footwear_changed
    bool hands_sanitised
    bool visited_other_farm_48h
  }
  environmental_observations {
    int id PK
    int farm_id FK
    datetime observed_at
    float temperature_c
    float relative_humidity_pct
    float ammonia_ppm
    string source
    string device_id
  }
  biosecurity_assessments {
    int id PK
    int farm_id FK
    datetime assessed_at
    string rules_version
    string status
    int score
    json triggered_rules
    json recommendations
    json data_quality_warnings
  }
  alerts {
    int id PK
    int farm_id FK
    string rule_code
    string dedup_key
    string severity
    string status
    int occurrence_count
    datetime acknowledged_at
    datetime resolved_at
    string resolution_note
  }
  animal_screenings {
    int id PK
    int farm_id FK
    int requested_by_id FK
    string species
    json inputs
    string model_version
    string top_label
    float top_score
    json alternatives
    json warnings
  }
  audit_logs {
    int id PK
    datetime created_at
    int actor_id FK
    string action
    string entity_type
    int farm_id FK
    string summary
  }
```

## Tables

| Table | Notes and constraints |
|---|---|
| `users` | `email` unique; `role` ∈ admin / veterinarian / farmer; bcrypt hash only; `is_demo` marks seeded fictional accounts |
| `farms` | `farm_type` ∈ pig / poultry / mixed; counts ≥ 0 (CHECK); API also rejects pigs on poultry farms and vice versa; location is district/taluk/village — **no coordinates**; `owner_id`, `veterinarian_id` → users (SET NULL) |
| `vaccination_records` | `status` ∈ scheduled / completed / missed; CHECK at least one of `due_on`, `administered_on`; API: completed needs `administered_on` (not future), scheduled/missed need `due_on` |
| `mortality_records` | `count` ≥ 0; **0 = explicit nil report** (lets the engine distinguish "no deaths" from "not reported") |
| `hygiene_inspections` | five checklist booleans; `result` derived server-side (pass only if all true) |
| `visitor_logs` | precautions; `precautions_complete` derived; exit ≥ entry |
| `environmental_observations` | at least one value; physical-plausibility bounds; **`source` ∈ manual / simulated / device** (device rejected unless enabled); composite index (farm_id, observed_at) |
| `biosecurity_assessments` | immutable history; JSON lists of triggered rules, observations, recommendations, warnings, limitations; `score` NULL when status is `insufficient_data` |
| `alerts` | `dedup_key = "<farm_id>:<rule_code>"`; **partial unique index** on `dedup_key WHERE status != 'resolved'`; acknowledgement/resolution actor + timestamps; note required to resolve |
| `animal_screenings` | inputs, model version (artifact hash), raw top/alternative scores, whether the top label was observed for the species in training, warnings |
| `audit_logs` | actor, action, entity, farm, summary — no passwords or tokens |
| `outbreak_notices` (migration 0002) | official notices: disease, species (pig/poultry/both), state/district/taluk, reported/closed dates, status; **`source_name` and `source_url` mandatory** |
| `livestock_statistics` (migration 0002) | district population per species and reference year with source name/URL and `import_method` (manual / csv / data.gov.in); unique per state+district+species+year+source |

All farm-scoped tables cascade on farm deletion (administrator-only, with a confirmation
dialog in the UI). All timestamps are timezone-aware UTC; `created_at`/`updated_at` exist on
users, farms, records and alerts.

## Migration commands
```powershell
cd backend
alembic upgrade head      # create / upgrade
alembic downgrade base    # drop everything
alembic check             # verify models and migrations agree
```
