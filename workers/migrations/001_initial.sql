CREATE TABLE assessments (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL DEFAULT 1,
  instrument_version TEXT NOT NULL,
  variant TEXT NOT NULL,
  anchor_bloc TEXT NOT NULL,
  national_country TEXT,
  trusted_bloc_definition TEXT,
  service_models TEXT NOT NULL,
  user_role TEXT NOT NULL,
  company_name TEXT,
  c5_attestation TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  share_publicly INTEGER NOT NULL DEFAULT 0,
  answers TEXT NOT NULL DEFAULT '{}',
  computed_score TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finalized_at TEXT,
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_assessments_expires ON assessments(expires_at);
CREATE INDEX idx_assessments_share ON assessments(share_publicly, status, finalized_at);

CREATE VIEW public_corpus AS
SELECT
  id,
  instrument_version,
  variant,
  anchor_bloc,
  national_country,
  service_models,
  user_role,
  c5_attestation,
  computed_score,
  substr(finalized_at, 1, 7) AS finalized_month
FROM assessments
WHERE share_publicly = 1
  AND status = 'submitted'
  AND finalized_at IS NOT NULL;
